#include "buzzer_driver.h"
#include "pins.h"
#include <Arduino.h>

namespace {

struct BeepSegment {
  unsigned long durationMs;
  bool on;
};

const BeepSegment WARNING_PATTERN[] = {
  {100, true}, {900, false},
};
const BeepSegment SIREN_PATTERN[] = {
  {200, true}, {200, false},
};
const BeepSegment RECOVERY_PATTERN[] = {
  {80, true}, {80, false},
  {80, true}, {80, false},
  {80, true}, {1500, false},
};

BuzzerState currentState = BuzzerState::Silent;
unsigned long stateStartMs = 0;

void applyPattern(const BeepSegment* pattern, int count, unsigned long elapsed) {
  unsigned long total = 0;
  for (int i = 0; i < count; i++) total += pattern[i].durationMs;
  unsigned long phase = elapsed % total;
  unsigned long acc = 0;
  for (int i = 0; i < count; i++) {
    acc += pattern[i].durationMs;
    if (phase < acc) {
      digitalWrite(PIN_BUZZER, pattern[i].on ? HIGH : LOW);
      return;
    }
  }
}

}  // namespace

void buzzerInit() {
  pinMode(PIN_BUZZER, OUTPUT);
  buzzerSetState(BuzzerState::Silent);
}

void buzzerSetState(BuzzerState state) {
  currentState = state;
  stateStartMs = millis();
  if (state == BuzzerState::Silent) {
    digitalWrite(PIN_BUZZER, LOW);
  }
}

void buzzerTick() {
  unsigned long elapsed = millis() - stateStartMs;

  switch (currentState) {
    case BuzzerState::Silent:
      break;  // already off from buzzerSetState()
    case BuzzerState::Warning:
      applyPattern(WARNING_PATTERN, 2, elapsed);
      break;
    case BuzzerState::Siren:
      applyPattern(SIREN_PATTERN, 2, elapsed);
      break;
    case BuzzerState::SirenConfirmed:
      digitalWrite(PIN_BUZZER, HIGH);  // continuous tone, no pattern
      break;
    case BuzzerState::Recovery:
      applyPattern(RECOVERY_PATTERN, 6, elapsed);
      break;
  }
}
