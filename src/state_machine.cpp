#include "state_machine.h"
#include "model_inference.h"
#include "neopixel_driver.h"
#include "buzzer_driver.h"
#include <Arduino.h>
#include <string.h>

namespace {

enum class AppState {
  Normal,
  Dizzy,
  Fallen,      // fall detected, short debounce before confirming -- always leads to ALARMED
  Alarmed,     // confirmed fall: alert sent, siren active
  Recovering,
};

AppState state = AppState::Normal;
int confirmCounter = 0;
unsigned long fallStartMs = 0;

// Sustained-reading thresholds, counted in classifications (one per
// ~1.5s window -- see main.cpp's non-overlapping-window classification
// rate) -- not single-frame triggers, so a lone misread can never
// silence a real alarm early or falsely confirm recovery.
const int CONFIRM_THRESHOLD = 3;           // ~4.5s sustained before ALARMED -> RECOVERING
const int RECOVER_CONFIRM_THRESHOLD = 5;   // ~7.5s sustained before RECOVERING -> NORMAL

// Debounce after a fall before confirming and alerting. Explicit
// product decision: the alert must always fire once a fall is
// confirmed, never conditionally on whether the person seems to
// recover -- missing a real fall is worse than an extra alert. (An
// earlier design waited up to 20s to decide whether to alert at all;
// that's been dropped for exactly this reason.) Recovery afterward
// (stopping the siren, sending the resolved message) can still happen
// at any time via ALARMED -> RECOVERING below -- it just no longer
// prevents the alert itself.
//
// Keep a short debounce to reject a lone noisy fall classification
// before activating the local alarm.
const unsigned long FALL_CONFIRM_DELAY_MS = 4000;

bool isLabel(int classIndex, const char* name) {
  return strcmp(modelLabel(classIndex), name) == 0;
}
bool isFall(int c) { return isLabel(c, "fall"); }
bool isDizzy(int c) { return isLabel(c, "dizzy"); }
bool isNormalMotion(int c) { return isLabel(c, "stand") || isLabel(c, "sit") || isLabel(c, "walk"); }

// What counts as "recovering" right after a fall (exiting ALARMED):
// any non-fall reading -- stand, sit, walk, or dizzy. This used to
// deliberately exclude "sit" (only stand/dizzy/walk counted), on the
// theory that sitting still wasn't a clean enough sign of recovery.
// In practice the model classifies a lot of real post-fall standing
// and walking as "sit," so excluding it left the alarm stuck
// indefinitely -- confirmed during real testing. Now that alerting no
// longer depends on recovery detection (see FALL_CONFIRM_DELAY_MS
// above), there's no safety downside to being lenient here: worst case
// is stopping the siren a bit early, not missing an alert.
bool isRecoverySign(int c) { return isNormalMotion(c) || isDizzy(c); }

// Debug-only: makes state transitions visible over serial.
void logTransition(const char* from, const char* to, int predicted) {
  Serial.printf("[state] %s -> %s (predicted=%s)\n", from, to, modelLabel(predicted));
}

// Standing/Sitting/Walking are steady (non-animated) colors, so
// calling this every tick while remaining in NORMAL is harmless --
// unlike Alarmed/Recovering, there's no animation phase to disrupt.
void updateNeopixelForNormal(int c) {
  if (isLabel(c, "stand")) neopixelSetState(VisualState::Standing);
  else if (isLabel(c, "sit")) neopixelSetState(VisualState::Sitting);
  else if (isLabel(c, "walk")) neopixelSetState(VisualState::Walking);
}

void enterFallen(int predicted) {
  logTransition(state == AppState::Normal ? "NORMAL" : "DIZZY", "FALLEN", predicted);
  state = AppState::Fallen;
  neopixelSetState(VisualState::Alarmed);
  buzzerSetState(BuzzerState::Siren);
  fallStartMs = millis();
  confirmCounter = 0;
}

// Confirmed: either FALL_CONFIRM_DELAY_MS elapsed after a fall, or a
// relapse straight from RECOVERING (a fall after we already thought
// they were recovering re-alerts immediately, skipping the debounce).
void enterAlarmed(int predicted) {
  logTransition(state == AppState::Recovering ? "RECOVERING" : "FALLEN", "ALARMED", predicted);
  state = AppState::Alarmed;
  neopixelSetState(VisualState::Alarmed);
  buzzerSetState(BuzzerState::SirenConfirmed);
  confirmCounter = 0;
}

}  // namespace

void stateMachineInit() {
  state = AppState::Normal;
  confirmCounter = 0;
  neopixelSetState(VisualState::Standing);
  buzzerSetState(BuzzerState::Silent);
}

void stateMachineUpdate(int predicted) {
  switch (state) {
    case AppState::Normal:
      updateNeopixelForNormal(predicted);
      if (isFall(predicted)) {
        enterFallen(predicted);
      } else if (isDizzy(predicted)) {
        state = AppState::Dizzy;
        neopixelSetState(VisualState::Dizzy);
        buzzerSetState(BuzzerState::Warning);
      }
      break;

    case AppState::Dizzy:
      if (isFall(predicted)) {
        enterFallen(predicted);
      } else if (isNormalMotion(predicted)) {
        state = AppState::Normal;
        updateNeopixelForNormal(predicted);
        buzzerSetState(BuzzerState::Silent);
      }
      break;

    case AppState::Fallen:
      // fallStartMs is set once, in enterFallen(), and deliberately
      // never reset here even on repeated "fall" readings -- a real
      // fall's settling motion can span several classification windows
      // in a row, and restarting the clock on each one let a single
      // continuous fall stretch the debounce out to 15-20+ seconds
      // (observed during testing). Escalation must happen within a
      // fixed ~4-5s of the *first* fall reading, full stop.
      if (millis() - fallStartMs >= FALL_CONFIRM_DELAY_MS) {
        enterAlarmed(predicted);
      }
      break;

    case AppState::Alarmed:
      if (isRecoverySign(predicted)) {
        confirmCounter++;
        if (confirmCounter >= CONFIRM_THRESHOLD) {
          logTransition("ALARMED", "RECOVERING", predicted);
          state = AppState::Recovering;
          neopixelSetState(VisualState::Recovering);
          buzzerSetState(BuzzerState::Recovery);
          confirmCounter = 0;
        }
      } else {
        confirmCounter = 0;  // only a continued "fall" reading resets -- must be a clean, sustained recovery
      }
      break;

    case AppState::Recovering:
      if (isNormalMotion(predicted)) {
        confirmCounter++;
        if (confirmCounter >= RECOVER_CONFIRM_THRESHOLD) {
          logTransition("RECOVERING", "NORMAL", predicted);
          state = AppState::Normal;
          confirmCounter = 0;
          updateNeopixelForNormal(predicted);
          buzzerSetState(BuzzerState::Silent);
        }
      } else if (isFall(predicted)) {
        enterAlarmed(predicted);  // relapse -- re-alerts (fire-and-forget, may already be pending from before)
      } else {
        confirmCounter = 0;
      }
      break;
  }
}
