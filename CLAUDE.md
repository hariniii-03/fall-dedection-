# CLAUDE.md — Fall Detection & Alert System

This file tells Claude Code how to work on this repo. Read it fully before doing anything else in this project.

## What this project is

An ESP32-S3 wearable/room device that watches a person's movement with an MPU6050 (accelerometer + gyroscope), classifies their body state on-device with a small TinyML model (standing, sitting, walking, dizzy, fall), gives silent Neopixel feedback for normal activity, sounds a buzzer for concerning states, and sends a Telegram alert to an emergency contact when a fall is confirmed. Full requirements live in `docs/Fall_Detection_PRD.md` (copy the original PRD into the repo under this path — see Phase 1).

The end goal is to open source this: a stranger should be able to clone the repo, follow `README.md`, and build the same thing without asking questions.

## How to work with Mostafa on this

Mostafa is an experienced engineering manager (C#/Python background) but this is his first hands-on embedded/TinyML project. **Write and explain at an intermediate level**: don't over-explain basic programming or git concepts, but don't assume familiarity with embedded-specific things (I2C, PWM, flashing, TFLite Micro, non-blocking timing) — a short one- or two-sentence "why this matters" is welcome the first time something embedded-specific comes up, not every time.

Go **phase by phase**, in the order below. Don't jump ahead to a later phase's tasks even if it seems efficient — each phase produces something the next one depends on (wiring before firmware, trained model before flashing, working device before writing docs).

For each phase:
1. Tell Mostafa what the phase covers and roughly how long it usually takes, before starting.
2. Walk through the tasks in that phase one at a time (or in small logical groups, e.g. all the pin-config tasks together). Explain *why* a step matters when it isn't obvious, not just *what* to type.
3. After each meaningful step is actually done and confirmed working (not just typed), mark it as complete — see "Keeping files updated" below.
4. If Mostafa deviates from a task, skips one, or does something differently than written here (different board, different sensor pins, a different buzzer type, a different license, etc.), **treat that as new ground truth**: update this file and/or the PRD reference to reflect what was actually decided, and note it as a "Decision" (see below) rather than silently going along with it and forgetting later.
5. Don't silently skip a task because it looks optional — flag it and ask if he wants to skip it, then record that choice too.

## The phases (source of truth: `docs/TASKS.md`)

The full checklist with every task lives in `docs/TASKS.md` (import it into the repo in Phase 1 — see below). Treat `docs/TASKS.md` as the master checklist; this file is about *how* to guide Mostafa through it, not a duplicate of it.

1. **Project Setup** — PlatformIO, repo scaffolding, license, Telegram bot creation
2. **GitHub Project Setup** — repo, Issues/labels, Projects board, milestones
3. **Wiring** — free/open-source diagram tools, pin table, physical breadboard build
4. **TinyML Data Collection & Training** — Edge Impulse setup, per-class capture, training, export
5. **Firmware Coding & Pin Configuration** — drivers, state machine, Telegram integration
6. **Build, Flash & Upload** — PlatformIO build/flash workflow
7. **Testing & Validation** — against the PRD's own success criteria
8. **Documentation & Open-Source Release** — README, dataset docs, known limitations, launch

## Keeping files updated

This is important and easy to let slide — don't let it slide.

**`docs/TASKS.md`** (the master checklist):
- Check off `- [ ]` → `- [x]` the moment a task is genuinely done and verified, not when it's merely attempted.
- If a task's approach changes from what's written (e.g. a different Neopixel pin, a different license, skipping the wearable form factor for a room-only version), edit that task's text in place so the checklist always reflects reality — never leave it saying something that's no longer true.
- If a new task comes up that isn't in the original list (a bug fix, an extra debugging step, a hardware substitution), add it under the relevant phase rather than letting it live only in chat history.

**`README.md`**:
- Update it incrementally, phase by phase — do NOT wait until Phase 8 to write it from scratch. By the time Phase 8 ("Documentation") starts, most of the README should already exist from notes captured along the way.
- After finishing a phase (or a substantial chunk of one), add or update the relevant README section: what was installed/built, what the final configuration was (board name, pin assignments, license chosen, tool versions), and any gotchas hit and how they were resolved.
- Keep a **"Build Log" or "Decisions" section** in the README (or a separate `docs/DECISIONS.md` if it grows large) that records, in plain language, every meaningful choice and deviation from the original PRD/plan — e.g. "Used a passive buzzer instead of active — required PWM tone code," or "Skipped the wearable form factor for v1, room-mounted only." This is what makes the project genuinely reproducible instead of just a code dump.

**This file (`CLAUDE.md`)**:
- If Mostafa's working style changes (wants less hand-holding, wants more detail on a specific phase, switches boards/tools entirely), update the relevant section here so future sessions pick up where this one left off.

## Setup: importing the checklist into this repo

Before starting Phase 1 for real:
1. Create `docs/TASKS.md` from the full checklist Mostafa has (the "Fall Detection System — Build & Open-Source Task List", including the Overview, all 8 phases as written above, and the GitHub Project Setup section).
2. Create `docs/Fall_Detection_PRD.md` from the original PRD Mostafa provided.
3. Create a starter `README.md` with just the title, one-line description, and a "Status: Phase 1 — Project Setup" line — this gets filled in as phases complete, per "Keeping files updated" above.
4. Confirm all three exist and are committed before beginning Phase 1 work.

## Ground rules

- Non-blocking timing (`millis()`, never `delay()`) for any tone/siren/animation code — this is called out repeatedly in the PRD and is a common beginner mistake that silently breaks the sensor sampling loop.
- Secrets (WiFi credentials, Telegram bot token, chat ID) go in a git-ignored `secrets.h`; commit a `secrets.h.example` template instead. Never commit real credentials.
- Zero missed falls takes priority over false-positive rate — when tuning thresholds or reviewing model performance, always check this trade-off explicitly with Mostafa rather than optimizing for accuracy alone.
- Confirm each phase's hardware/software actually works before moving to the next phase — don't stack unverified work.
