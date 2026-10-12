// MPU6050 Data Forwarder sketch (used for Phase 4 data collection).
//
// Streams MPU6050 accel + gyro as comma-separated values over serial,
// one line per sample, for use with tools/serial-data-logger.html.
// Not part of the firmware build -- PlatformIO only compiles src/, so
// to reuse this (e.g. to collect more training data later), copy it
// into src/main.cpp, rebuild, and reflash.

#include <Arduino.h>
#include <Wire.h>

#define SDA_PIN 8
#define SCL_PIN 9
#define MPU_ADDR 0x68
#define ACCEL_SCALE 16384.0
#define GYRO_SCALE 131.0
#define GRAVITY 9.80665

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(SDA_PIN, SCL_PIN);

  // Wake MPU (clear sleep bit in power management register)
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission(true);

  Serial.println("accX,accY,accZ,gyrX,gyrY,gyrZ");
}

void loop() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);  // starting register: accel X high byte
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 14);  // accel (6) + temp (2) + gyro (6)

  int16_t rawAx = (Wire.read() << 8) | Wire.read();
  int16_t rawAy = (Wire.read() << 8) | Wire.read();
  int16_t rawAz = (Wire.read() << 8) | Wire.read();
  Wire.read(); Wire.read();  // discard temperature
  int16_t rawGx = (Wire.read() << 8) | Wire.read();
  int16_t rawGy = (Wire.read() << 8) | Wire.read();
  int16_t rawGz = (Wire.read() << 8) | Wire.read();

  float ax = (rawAx / ACCEL_SCALE) * GRAVITY;
  float ay = (rawAy / ACCEL_SCALE) * GRAVITY;
  float az = (rawAz / ACCEL_SCALE) * GRAVITY;
  float gx = rawGx / GYRO_SCALE;
  float gy = rawGy / GYRO_SCALE;
  float gz = rawGz / GYRO_SCALE;

  Serial.print(ax, 3); Serial.print(",");
  Serial.print(ay, 3); Serial.print(",");
  Serial.print(az, 3); Serial.print(",");
  Serial.print(gx, 3); Serial.print(",");
  Serial.print(gy, 3); Serial.print(",");
  Serial.println(gz, 3);

  delay(20);  // ~50 Hz
}
