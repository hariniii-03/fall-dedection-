#include "neopixel_driver.h"
#include "pins.h"
#include <Adafruit_NeoPixel.h>

namespace {

Adafruit_NeoPixel pixel(NEOPIXEL_COUNT, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);
VisualState currentState = VisualState::Standing;
unsigned long stateStartMs = 0;

const uint32_t COLOR_BLUE = pixel.Color(0, 0, 255);     // standing
const uint32_t COLOR_CYAN = pixel.Color(0, 255, 255);   // sitting
const uint32_t COLOR_GREEN = pixel.Color(0, 255, 0);    // walking
const uint32_t COLOR_AMBER = pixel.Color(255, 191, 0);  // dizzy
const uint32_t COLOR_RED = pixel.Color(255, 0, 0);      // alarmed

const unsigned long ALARM_PULSE_PERIOD_MS = 1000;
const unsigned long RECOVER_FADE_DURATION_MS = 3000;

uint8_t scaleChannel(uint8_t channel, float brightness) {
  return (uint8_t)(channel * brightness);
}

uint32_t scaleColor(uint32_t color, float brightness) {
  uint8_t r = (uint8_t)(color >> 16);
  uint8_t g = (uint8_t)(color >> 8);
  uint8_t b = (uint8_t)color;
  return pixel.Color(scaleChannel(r, brightness), scaleChannel(g, brightness), scaleChannel(b, brightness));
}

uint32_t lerpColor(uint32_t from, uint32_t to, float t) {
  if (t < 0.0f) t = 0.0f;
  if (t > 1.0f) t = 1.0f;
  uint8_t fr = (uint8_t)(from >> 16), fg = (uint8_t)(from >> 8), fb = (uint8_t)from;
  uint8_t tr = (uint8_t)(to >> 16), tg = (uint8_t)(to >> 8), tb = (uint8_t)to;
  uint8_t r = (uint8_t)(fr + (tr - fr) * t);
  uint8_t g = (uint8_t)(fg + (tg - fg) * t);
  uint8_t b = (uint8_t)(fb + (tb - fb) * t);
  return pixel.Color(r, g, b);
}

void showColor(uint32_t color) {
  pixel.setPixelColor(0, color);
  pixel.show();
}

// Draws the steady-state color for Standing/Sitting/Walking/Dizzy.
// No-op for Alarmed/Recovering, which neopixelTick() animates instead.
// Shared by neopixelSetState().
void drawSteadyColor(VisualState state) {
  switch (state) {
    case VisualState::Standing:
      showColor(COLOR_BLUE);
      break;
    case VisualState::Sitting:
      showColor(COLOR_CYAN);
      break;
    case VisualState::Walking:
      showColor(COLOR_GREEN);
      break;
    case VisualState::Dizzy:
      showColor(COLOR_AMBER);
      break;
    case VisualState::Alarmed:
    case VisualState::Recovering:
      break;
  }
}

}  // namespace

void neopixelInit() {
  pixel.begin();
  pixel.setBrightness(80);
  neopixelSetState(VisualState::Standing);
}

void neopixelSetState(VisualState state) {
  currentState = state;
  stateStartMs = millis();
  drawSteadyColor(state);  // no-op for Alarmed/Recovering -- neopixelTick() draws their first frame
}

void neopixelTick() {
  unsigned long elapsed = millis() - stateStartMs;

  if (currentState == VisualState::Alarmed) {
    unsigned long phase = elapsed % ALARM_PULSE_PERIOD_MS;
    float t = (float)phase / (float)ALARM_PULSE_PERIOD_MS;  // 0..1
    // Triangle wave: brightness rises then falls, floor at 0.15 so it
    // never fully blacks out.
    float triangle = (t < 0.5f) ? (t * 2.0f) : (2.0f - t * 2.0f);
    float brightness = 0.15f + 0.85f * triangle;
    showColor(scaleColor(COLOR_RED, brightness));
  } else if (currentState == VisualState::Recovering) {
    float t = (float)elapsed / (float)RECOVER_FADE_DURATION_MS;  // 0..1, clamped in lerpColor
    showColor(lerpColor(COLOR_AMBER, COLOR_GREEN, t));
  }
  // Steady states already drew their color once in neopixelSetState().
}
