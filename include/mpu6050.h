#ifndef MPU6050_H
#define MPU6050_H

// Raw-register MPU6050 driver -- deliberately not the Adafruit_MPU6050
// library (that library hung with no serial output during Phase 4
// bring-up; this raw approach is proven working at ~50Hz). Scaling
// matches tools/mpu6050-data-forwarder.cpp exactly, since that's what
// produced the data the model in fall_detection_model_data.h was
// trained on -- accel in m/s^2, gyro in deg/s.

void mpu6050Init();

// Fills sample[0..5] = accX, accY, accZ, gyrX, gyrY, gyrZ.
void mpu6050ReadSample(float sample[6]);

#endif  // MPU6050_H
