#ifndef NEOPIXEL_DRIVER_H
#define NEOPIXEL_DRIVER_H

// Onboard single WS2812 LED driver. Color-per-state mapping from the
// PRD: standing/sitting/walking = blue/cyan/green, dizzy = amber,
// alarmed = red pulsing, recovering = amber->green fade.

enum class VisualState {
  Standing,
  Sitting,
  Walking,
  Dizzy,
  Alarmed,
  Recovering,
};

void neopixelInit();

// Call once whenever the visual state changes (not every loop) -- sets
// the steady color immediately and resets animation timing for
// Alarmed/Recovering.
void neopixelSetState(VisualState state);

// Call every loop iteration. No-op for steady states; drives the
// pulsing/fading animation for Alarmed/Recovering, timed off millis()
// (non-blocking).
void neopixelTick();

#endif  // NEOPIXEL_DRIVER_H
