#include "mpu6050.h"
#include "pins.h"
#include <Arduino.h>
#include <Wire.h>

#define MPU_ADDR 0x68
#define ACCEL_SCALE 16384.0
#define GYRO_SCALE 131.0
#define GRAVITY 9.80665

void mpu6050Init() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

  // Wake MPU (clear sleep bit in power management register)
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission(true);
}

void mpu6050ReadSample(float sample[6]) {
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

  sample[0] = (rawAx / ACCEL_SCALE) * GRAVITY;
  sample[1] = (rawAy / ACCEL_SCALE) * GRAVITY;
  sample[2] = (rawAz / ACCEL_SCALE) * GRAVITY;
  sample[3] = rawGx / GYRO_SCALE;
  sample[4] = rawGy / GYRO_SCALE;
  sample[5] = rawGz / GYRO_SCALE;
}
