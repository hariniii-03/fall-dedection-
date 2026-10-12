#ifndef STATE_MACHINE_H
#define STATE_MACHINE_H

// Implements the PRD's NORMAL/DIZZY/ALARMED/RECOVERING state machine.
// Drives the Neopixel/buzzer drivers and the Telegram alert internally
// based on classifications fed in via stateMachineUpdate().

void stateMachineInit();

// Call once per new classification (see model_inference.h).
void stateMachineUpdate(int predictedClassIndex);

#endif  // STATE_MACHINE_H
