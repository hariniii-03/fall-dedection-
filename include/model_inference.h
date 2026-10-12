#ifndef MODEL_INFERENCE_H
#define MODEL_INFERENCE_H

// Hand-rolled forward pass over the dense network in
// fall_detection_model_data.h -- no TFLite Micro (see docs/TASKS.md
// Phase 4/5 for why: training moved to a custom in-browser trainer
// that exports raw float weight/bias arrays instead of a TFLite model).
//
// Only model_inference.cpp includes fall_detection_model_data.h
// directly. That header defines LABELS[] (and the weight/bias arrays)
// without `extern`, so including it from more than one .cpp file
// causes a linker "multiple definition" error, and would otherwise
// silently duplicate the model's flash footprint per file that
// includes it. Everything else in firmware goes through this header
// instead.
//
// These mirror the macros in fall_detection_model_data.h. If the
// model is retrained with a different window size, update these to
// match -- model_inference.cpp has a static_assert that will fail the
// build if they drift out of sync.
#define MODEL_WINDOW_SIZE 75
#define MODEL_SENSOR_CHANNELS 6
#define MODEL_INPUT_FEATURES (MODEL_WINDOW_SIZE * MODEL_SENSOR_CHANNELS)
#define MODEL_OUTPUT_CLASSES 5

// Runs inference over a flattened MODEL_INPUT_FEATURES-length window
// (MODEL_WINDOW_SIZE samples x MODEL_SENSOR_CHANNELS channels, same
// order as mpu6050ReadSample: accX,accY,accZ,gyrX,gyrY,gyrZ per
// sample) and returns the predicted class index.
int modelPredict(const float* input);

// Returns the human-readable label for a class index returned by
// modelPredict().
const char* modelLabel(int classIndex);

#endif  // MODEL_INFERENCE_H
