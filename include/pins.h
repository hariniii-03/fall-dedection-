#ifndef PINS_H
#define PINS_H

// Pin assignments -- see docs/TASKS.md (Phase 3) and README.md's Wiring
// section for how these were determined. Change wiring? Change it here,
// nowhere else.

#define PIN_I2C_SDA 8
#define PIN_I2C_SCL 9

// Onboard single WS2812 RGB LED (not an external strip).
#define PIN_NEOPIXEL 48
#define NEOPIXEL_COUNT 1

// Active buzzer with no signal pin -- GPIO6 switches its power directly
// (digitalWrite HIGH/LOW), not tone()/noTone(). See README's Build Log.
#define PIN_BUZZER 6

#endif  // PINS_H
