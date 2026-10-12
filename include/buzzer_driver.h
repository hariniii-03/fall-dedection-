#ifndef BUZZER_DRIVER_H
#define BUZZER_DRIVER_H

// Active buzzer with no signal pin -- controlled by switching its
// power directly via digitalWrite(PIN_BUZZER, HIGH/LOW), not
// tone()/noTone() (see README's Build Log). Since it can't vary
// pitch, each state gets a distinct on/off beep *pattern* instead of
// a distinct tone, so severity is still tellable apart by sound alone.

enum class BuzzerState {
  Silent,
  Warning,        // dizzy: slow, intermittent beep
  Siren,          // fallen, awaiting recovery confirmation: fast intermittent beeping
  SirenConfirmed, // confirmed no recovery within the grace period: continuous tone
  Recovery,       // recovering: three short beeps, then a pause, repeating
};

void buzzerInit();

// Call once whenever the buzzer state changes (not every loop) --
// resets pattern timing so it always starts from the beginning of its
// cycle.
void buzzerSetState(BuzzerState state);

// Call every loop iteration. Non-blocking, timed off millis() -- never
// use delay() here or the IMU sampling loop stalls mid-pattern.
void buzzerTick();

#endif  // BUZZER_DRIVER_H
