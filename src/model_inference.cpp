#include "model_inference.h"
#include "fall_detection_model_data.h"

static_assert(MODEL_WINDOW_SIZE == WINDOW_SIZE,
              "MODEL_WINDOW_SIZE in model_inference.h is out of sync with fall_detection_model_data.h");
static_assert(MODEL_SENSOR_CHANNELS == SENSOR_CHANNELS,
              "MODEL_SENSOR_CHANNELS in model_inference.h is out of sync with fall_detection_model_data.h");
static_assert(MODEL_OUTPUT_CLASSES == OUTPUT_CLASSES,
              "MODEL_OUTPUT_CLASSES in model_inference.h is out of sync with fall_detection_model_data.h");

namespace {

// weights is flattened row-major [inputDim][outputDim]: weight for
// input i, output j is at weights[i * outputDim + j] -- matches the
// layout documented in fall_detection_model_data.h's header comment.
void denseLayer(const float* input, int inputDim, const float* weights,
                 const float* biases, int outputDim, float* output, bool relu) {
  for (int j = 0; j < outputDim; j++) {
    float sum = biases[j];
    for (int i = 0; i < inputDim; i++) {
      sum += input[i] * weights[i * outputDim + j];
    }
    output[j] = (relu && sum < 0.0f) ? 0.0f : sum;
  }
}

}  // namespace

int modelPredict(const float* input) {
  float hidden0[16];
  denseLayer(input, INPUT_FEATURES, layer0_weights, layer0_biases, 16, hidden0, true);

  float hidden1[8];
  denseLayer(hidden0, 16, layer1_weights, layer1_biases, 8, hidden1, true);

  float logits[OUTPUT_CLASSES];
  denseLayer(hidden1, 8, layer2_weights, layer2_biases, OUTPUT_CLASSES, logits, false);

  // argmax of raw logits == argmax of softmax(logits) since softmax is
  // monotonic, so there's no need to actually compute the softmax.
  int bestIndex = 0;
  float bestValue = logits[0];
  for (int i = 1; i < OUTPUT_CLASSES; i++) {
    if (logits[i] > bestValue) {
      bestValue = logits[i];
      bestIndex = i;
    }
  }
  return bestIndex;
}

const char* modelLabel(int classIndex) {
  return LABELS[classIndex];
}
