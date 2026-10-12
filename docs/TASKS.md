# Fall Detection System — Build & Open-Source Task List

2026-09-17 · @u_Gd73xkkFmo9snIgr0fdFzg

## Overview

This is the execution checklist for the Fall Detection & Alert System PRD: an ESP32-S3 device that classifies body state from an MPU6050 and gives a local alarm on a confirmed fall. Work through the phases in order — each one hands off what the next needs (wiring before firmware, trained model before flashing, working device before writing it up).

**Current scope decision (2026-10-09):** Telegram and Wi-Fi alerting were removed from the firmware at the user's request. The project now runs offline; fall alerts are local (Neopixel and buzzer). Phase 5/6 Telegram tasks and test notes below record historical work on the earlier firmware, not current requirements.

Each task below is a checkbox. As you close a task, capture what you'd tell someone reproducing this from scratch (settings used, gotchas hit, screenshots to take) — that running log becomes the open-source README, so document as you go rather than after the fact.

**Phases**

1. Project setup (PlatformIO + repo scaffolding)
2. GitHub project setup (repo, Issues, Projects board, milestones)
3. Wiring (diagram tools + physical build)
4. TinyML data collection & training (Edge Impulse)
5. Firmware coding & pin configuration
6. Build, flash & upload
7. Testing & validation
8. Documentation & open-source release

## Phase 1 — Project Setup

- [x] Install [PlatformIO](https://platformio.org/) as a VS Code extension (free, open source) — install [VS Code](https://code.visualstudio.com/) first if you don't have it, then add the PlatformIO IDE extension from the marketplace
- [x] Create a new PlatformIO project — **deviation:** created via the PlatformIO "New Project" wizard with `board = esp32s3usbotg`, framework = `arduino`. Note this is technically Espressif's official ESP32-S3-USB-OTG devkit board *definition* (LCD + 4 buttons), not an exact match for the actual hardware (a generic ESP32-S3-N16R8 dev board, confirmed via `esptool flash_id`: ESP32-S3, 16MB quad flash, 8MB quad PSRAM). Kept as-is by choice — pin-mapping mismatches from this will need attention once Phase 3 wiring starts referencing board-specific pin macros.
- [x] Confirm the board builds and uploads a blank sketch before touching sensors — build + upload over USB confirmed working (COM8, native USB on `VID:PID=303A:1001`). Serial output verification was skipped for now (the wizard's default `main.cpp` doesn't call `Serial.begin()`/print anything) — revisit once `main.cpp` actually needs serial output. Note: this board's native USB port required boot to actually route Arduino's `Serial` there in earlier testing; if serial output looks silent later, check whether `-DARDUINO_USB_CDC_ON_BOOT=1` is needed in `build_flags`.
- [x] Set up the repo structure for open-sourcing from day one:
  - `/src` — firmware (`main.cpp`, state machine, drivers)
  - `/include` — headers (pin map, config constants)
  - `/lib` — the Edge Impulse exported library (added in Phase 3)
  - `/docs` — wiring diagrams, photos, this task list exported as the README
  - `/data` — sample IMU captures (small representative samples only — raw training data usually stays out of git; note where the full dataset lives)
  - `/test` — added automatically by the PlatformIO wizard (PlatformIO Unity test runner scaffold); not in the original plan but harmless, left in place
  - `platformio.ini` — board, framework, and library dependencies pinned to versions
- [x] Add a `.gitignore` for PlatformIO (`.pio/`, `.vscode/` build artifacts) — used PlatformIO wizard's auto-generated `.gitignore`
- [x] Initialize the git repo and pick an open-source license (MIT or Apache-2.0 are the common defaults for hobbyist hardware projects) — **chose MIT**, copyright line uses the `msohdy` git identity rather than a legal name (fine for an open-source hobby project); added `LICENSE` and a stub `README.md`
- [x] Create a Telegram bot via [@BotFather](https://t.me/BotFather) and note the bot token + your chat ID — done; token/chat ID currently saved in a local `.env` (now git-ignored) as personal notes. **Note:** `.env` is not read by the firmware — Arduino/PlatformIO can't load it at compile or run time without custom build scripting. Per the PRD, the actual values will move into `include/secrets.h` (a git-ignored C++ header, with a `secrets.h.example` template committed) when Telegram integration is coded in Phase 5.

## Phase 2 — GitHub Project Setup

- [x] Create the GitHub repo (public, since this is going open source) and push the local repo from Phase 1 as the initial commit — created via `gh repo create`: [msohdy/fall-detection-physical-ai-esp32](https://github.com/msohdy/fall-detection-physical-ai-esp32)
- [x] Add repo topics/tags for discoverability (`esp32`, `tinyml`, `edge-impulse`, `fall-detection`, `platformio`)
- [x] Enable GitHub Issues and set up labels that map to this checklist's structure — **deviation:** used `phase-1-setup` through `phase-8-docs` (8 phases, not 7 — matches the actual phase count in this file) plus the repo's default `bug`/`help wanted` labels
- [x] Create a GitHub Project (the built-in Projects board) with columns `Backlog / In Progress / Done` — [Fall Detection Build Roadmap](https://github.com/users/msohdy/projects/3). **Deviation:** one issue per phase (not one per task) was added to the board, each issue linking back to its section of this file for the detailed checklist — keeps the board readable while this file stays the source of truth for task-level detail.
- [x] Set milestones matching the phases, each with its issue attached — 8 milestones created matching the 8 phases in this file
- [ ] Add a `CODEOWNERS` or at least a note in `README.md` on who reviews PRs — **explicitly deferred** to closer to Phase 7/8, per plan
- [ ] Turn on GitHub Discussions — **explicitly deferred** until the project has outside visitors

## Phase 3 — Wiring

**Free/open-source tools to design and document the diagram**

- [x] [Fritzing](https://fritzing.org/) — **chosen primary tool** (switched from an initial Wokwi choice): open source, breadboard-style diagram, parts easy to find in Fritzing's library
- [x] [Wokwi](https://wokwi.com/) — considered first, not used
- [x] [KiCad](https://www.kicad.org/) — not needed for this project (no PCB planned for v1)
- [x] Pick one primary tool for the repo — **Fritzing** (deviation from the earlier Wokwi decision, made once actually building the diagram)

**Pin table** — **deviation:** the Neopixel is the board's onboard single WS2812 RGB LED (GPIO48), not an external strip, so there's no separate strip wiring or level-shifting concern.

| Signal | MPU6050 | Neopixel (onboard) | Buzzer (active) |
| --- | --- | --- | --- |
| Power | VCC → 3.3V | onboard, no wiring | + → **GPIO6** (switched power, not a fixed rail) |
| Ground | GND → GND | onboard | - → GND |
| Data/Signal | SDA → GPIO8 | GPIO48 (onboard) | *(none — see note below)* |
| Clock | SCL → GPIO9 | — | — |

- [x] Confirm your board's default I2C pins — **GPIO8 (SDA) / GPIO9 (SCL)**, the Arduino-ESP32 core's default `Wire.begin()` pins on ESP32-S3 (no strapping-pin conflicts), set explicitly rather than relying on board defaults since the board ID in `platformio.ini` doesn't exactly match the physical hardware
- [x] Confirm the buzzer type (passive vs active) — **confirmed active** via direct test: connecting VCC to 3.3V and GND with the third pin left unwired produced a steady, continuous tone, meaning it has its own internal driver circuit. This corrects an earlier passive guess based on an old, apparently-unrelated sample sketch that used `tone()`.
  - **Deviation — no dedicated signal pin:** this buzzer's 3rd pin turned out to be unused (confirmed: it buzzed with just VCC+GND wired, 3rd pin floating). There's no logic-level control input at all — the module just turns on whenever it has power. So control works by switching **power itself**: the wire originally planned for a fixed 3.3V rail instead goes to **GPIO6**, which sources power to the buzzer directly; GND stays on GND; the 3rd/mid pin is left disconnected. Driver code in Phase 5 uses `digitalWrite(GPIO6, HIGH/LOW)` to turn it on/off — confirmed working.
  - **Note for Phase 5:** driving the buzzer directly off a GPIO (rather than through a transistor) works for bring-up but isn't the most robust long-term design if the buzzer's current draw is on the high side for a GPIO pin (ESP32-S3 GPIOs recommend staying under ~20mA). Revisit with a transistor driver if it proves unreliable.
  - **PRD implication to revisit in Phase 5:** the PRD's per-state buzzer table calls for a distinct *tone* per concerning state (warning tone / siren / recovery chirp). An active buzzer can't vary pitch — only on/off timing patterns. Will need to use distinct *beep patterns* (e.g. different on/off rhythms) instead of distinct pitches to keep the "tell severity apart by sound alone" requirement.
- [x] Note the Neopixel strip's logic voltage — **N/A**, onboard single LED (GPIO48), not an external strip

**Physical build**

- [x] Breadboard the MPU6050, Neopixel, and buzzer per the diagram — done one component at a time, each verified with a real firmware test rather than just continuity: MPU6050 confirmed via I2C scanner (responds at `0x68`), buzzer confirmed via `digitalWrite` on/off toggling on GPIO6, Neopixel confirmed via a red/green/blue color-cycle test on GPIO48
- [x] Photograph the breadboard from a few angles for the docs — one photo taken and added to `docs/wiring/wiringImage.jpg`
- [x] If building the wearable form factor, plan strain relief on the wires before final assembly — **decision: staying on breadboard for v1**, powered by a USB powerbank (handheld, not worn or room-mounted). No enclosure/form-factor commitment yet, so strain relief is out of scope for now; revisit if/when a final form factor is chosen.
- [x] Add the finished wiring diagram + photos + pin table to `/docs` — `docs/wiring/fall-detection-wiring.fzz` (Fritzing source), `docs/wiring/fall-detection-wiring.png` (exported diagram), `docs/wiring/wiringImage.jpg` (photo), pin table in this file and in `README.md`

## Phase 4 — TinyML Data Collection & Training

**Setup**

- [x] Create a free [Edge Impulse](https://edgeimpulse.com/) account and a new project
- [x] Flash a minimal sketch to the ESP32-S3 that reads MPU6050 accel + gyro and prints to serial in the format Edge Impulse's Data Forwarder expects — streams `accX,accY,accZ,gyrX,gyrY,gyrZ` at ~50Hz via raw I2C register reads (no Adafruit_MPU6050 library — an earlier attempt using that library appeared to hang/produce no serial output, and raw register access matching a previously-known-working sketch was used instead). Confirmed producing real, varying sensor values. Sample rate tuned from an initial ~100Hz down to ~50Hz (still dense enough to characterize a fall's acceleration spike within the PRD's ~1-2s window).
  - **Debugging note:** hit a confusing failure where I2C reads returned a fixed garbage value (`Wire.read()` returning -1 for every byte, i.e. `Wire.requestFrom()` failing) despite the MPU6050 previously scanning fine at `0x68`. Root cause turned out to be the **ESP32-S3 board itself not being fully seated in the breadboard** — some pins (including GPIO8/9) had no reliable contact. A lit power LED on the MPU6050 was a red herring: it stayed faintly lit even with VCC disconnected, due to current backfeeding through the I2C pull-up resistors on the breakout — lesson for later debugging: a lit sensor LED doesn't guarantee a solid power connection.
- [x] Connect the Data Forwarder and confirm live samples appear in the Edge Impulse Data Acquisition tab — **deviation (two levels deep):**
  1. `npm install -g edge-impulse-cli` failed (`@serialport/bindings` needs native compilation via `node-gyp`, which requires Visual Studio Build Tools that aren't installed — a large, slow install to add just for this).
  2. Edge Impulse Studio's browser-based WebSerial "Connect a new device" flow was tried as a CLI-free alternative, but turned out to require the device firmware to speak Edge Impulse's AT-command remote-management protocol (`Timeout when waiting for >` error) — a completely different thing from the plain-CSV Data Forwarder protocol our sketch speaks. Not usable without writing that protocol into the firmware.
  - **Final approach:** built a custom local tool, [`tools/serial-data-logger.html`](../tools/serial-data-logger.html) — a self-contained Web Serial page (no CLI, no special firmware protocol) that connects to the board, logs incoming CSV lines to an editable table, and exports a clean CSV per recording session. Those CSVs are then imported into Edge Impulse via Studio's **Data acquisition → Upload data** CSV wizard instead of a live Data Forwarder connection.

**Per-class collection** (5 classes: standing, sitting, walking, dizzy, fall)

- [x] Standing / sitting / walking — collected via `tools/serial-data-logger.html` (1399 / 1900 / 1971 samples respectively)
- [x] Dizzy/unsteady — simulated with deliberately irregular gait; 1886 samples
- [x] Fall — **deviation:** since the device is handheld (breadboard + powerbank, not worn — see Phase 3), falls are simulated by holding the assembly and mimicking the arm/body motion of falling (quick drop + sudden stop) rather than an actual worn fall onto a mattress; 960 samples (smallest class, as expected). **Known limitation carried into Phase 8 docs:** this fall signature is a proxy, not a real worn-device fall, and the model's confusion matrix shows real evidence of this (see below) — a handheld mimicked fall and a staggering "dizzy" motion end up looking more similar in the IMU signal than a real worn fall would.
- [x] After each recording session, reviewed samples for mislabeled segments using the chart + drag-select delete in `tools/serial-data-logger.html`. That tool later also gained a **Load CSV** button so already-saved recordings in `data/raw/` can be reopened for a second cleanup pass.

Total: 8116 raw samples across the 5 classes.

**Split & balance**

- [x] Checked class balance — fall (960) is the smallest class as expected, others range 1399–1971. No explicit rebalancing done; noted as something to revisit if fall-detection accuracy needs further improvement.
- [x] Train/validation split — 80/20, held out automatically by the training tool (see below) via a shuffled split of the windowed samples.

**Impulse design & training — deviation: Edge Impulse abandoned entirely**

Edge Impulse was dropped as the training platform (not just the data-forwarder connection method noted above). Reasons and what replaced it:

- [x] **Why:** wanted a fully local, reproducible, no-external-account training pipeline consistent with this project's "no external dependency" pattern (same reasoning as building `serial-data-logger.html` instead of relying on Edge Impulse's device-connection flow). Also, a simple 5-class dense-network classifier doesn't need Edge Impulse's Spectral Analysis / DSP blocks — raw windowed IMU samples fed directly into a small dense net work well here.
- [x] **Built [`tools/tinyml-trainer.html`](../tools/tinyml-trainer.html)** — a self-contained TensorFlow.js page: upload a CSV per class, configure window size / epochs / learning rate / model name, train a `dense(16, relu) → dense(8, relu) → dense(numClasses, softmax)` network entirely in-browser, then export a plain C header with the raw float weight/bias arrays (no TFLite Micro runtime needed — Phase 5 firmware will do a hand-rolled forward pass instead).
- [x] **Bug found and fixed during training:** the first training runs showed `val_acc` stuck around 0.3–0.5 and bouncing around while `acc` climbed normally to ~0.84 — classic overfitting-looking symptom, but the real cause was that the windowed dataset was built class-by-class in sequence (all "fall" windows, then all "sit", etc.), and TensorFlow.js's `validationSplit` carves its slice off the *end* of the array *before* any epoch shuffling. The validation set was therefore almost entirely just the last class or two, not a representative mix. Fixed by shuffling the windowed `(X, y)` pairs together before training. After the fix, `val_acc` tracked `acc` smoothly as expected.
- [x] **Added a confusion matrix to the trainer** (computed on the same validation slice tf.js uses internally) after realizing overall accuracy alone doesn't reveal whether "fall" specifically is being missed — which is exactly the PRD's stated priority. It also auto-flags in red if any "fall" validation samples were misclassified.
- [x] **Window size tuning — this mattered a lot.** Started at window=5 samples (100ms at 50Hz), which is far shorter than the PRD's suggested ~1–2s and produced heavy fall↔dizzy confusion (a 100ms slice can't capture a fall's actual shape). Iterated up:

  | Window size | Duration @ 50Hz | Overall val_acc | Fall samples missed |
  | --- | --- | --- | --- |
  | 5 | 0.1s | ~0.87 (comparable to the very first Edge-Impulse-style attempt) | 68/209 (32.5%) |
  | 50 | 1.0s | 0.958 | 39/191 (20.4%) |
  | 75 | 1.5s | 0.963 | 23/205 (11.2%) — **accepted for now** |

  Fall↔dizzy remained the dominant confusion at every window size, consistent with the handheld-fall-simulation limitation noted above rather than being purely a hyperparameter problem.
- [ ] **Not fully met:** the PRD's "zero missed falls" bar is not actually hit — 11.2% of fall validation samples are still misclassified. Explicitly accepted as a known v1 limitation (to document plainly in Phase 8) rather than continuing to iterate indefinitely, given the handheld form factor is the more likely root cause at this point. Revisit if a wearable form factor or more/cleaner fall data becomes available.

**Export**

- [x] Final model: `include/fall_detection_model_data.h` — window=75 (450 input features = 75 samples × 6 channels), `dense(16)→dense(8)→dense(5)`, labels `fall, sit, stand, walk, dizzy`. No `/lib` dependency needed (no TFLite Micro) — Phase 5 firmware includes this header directly and implements the forward pass by hand.
- [x] Model version noted here: trained via `tools/tinyml-trainer.html`, window=75, 50 epochs, learning rate 0.001, final train acc 0.999 / val_acc 0.963 (see table above for the tuning history).

## Phase 5 — Firmware Coding & Pin Configuration

**Current scope note (2026-10-09):** Telegram integration was removed after the Phase 6 work. The local alarm/state machine remains; Telegram credentials, Wi-Fi setup, and Telegram delivery are not required for the current firmware.

**Pin config**

- [x] Create `include/pins.h` with named constants for every pin used (I2C SDA/SCL = GPIO8/9, Neopixel = GPIO48 onboard, buzzer = GPIO6 switched power) — matches the pin table from Phase 3, so wiring changes only ever touch one file
- [x] Add library dependencies to `platformio.ini`: `Adafruit NeoPixel` (already added in Phase 3) and WiFi/HTTPS client (bundled with the ESP32 Arduino core). **Deviation from original plan:** no Edge Impulse export library and no MPU6050 driver library needed — see Drivers below.

**Drivers**

- [x] MPU6050 read loop — **deviation:** use the same raw I2C register access as `tools/mpu6050-data-forwarder.cpp` (registers 0x3B–0x48 via `Wire`), not the `Adafruit_MPU6050` library — an earlier attempt with that library hung with no serial output during Phase 4 bring-up, and the raw-register approach is already proven working at ~50Hz. Implemented in `include/mpu6050.h` + `src/mpu6050.cpp`, sampling at 50Hz into a 75-sample window (1.5s), matching exactly what `tools/tinyml-trainer.html` was trained on.
- [x] Model inference — **deviation:** no TFLite Micro. Implemented in `include/model_inference.h` + `src/model_inference.cpp` as a hand-rolled forward pass (`dense(450→16, ReLU) → dense(16→8, ReLU) → dense(8→5) → argmax`) over the raw float arrays in `include/fall_detection_model_data.h`.
  - **Gotcha hit and fixed:** `fall_detection_model_data.h` defines `LABELS[]` (and the weight/bias arrays) without `extern`, so including it directly from more than one `.cpp` file causes a linker "multiple definition" error — and would otherwise silently duplicate the model's ~160KB flash footprint per file that includes it. Fixed by making `model_inference.cpp` the *only* file that includes the generated header directly; everything else goes through `model_inference.h`, which mirrors the model's window-size/channel-count macros with a `static_assert` guard so a future retrain with different dimensions fails the build loudly instead of silently misbehaving.
  - **Confirmed working end-to-end** via a bring-up test: live MPU6050 samples → windowing → inference → predicted label printed over serial, producing sane results (mostly "sit" for a stationary device, as expected — no state-machine smoothing yet, so occasional single-frame noise is expected and will be handled by `CONFIRM_THRESHOLD` below).
- [x] Neopixel driver — `include/neopixel_driver.h` + `src/neopixel_driver.cpp`, a `VisualState` enum (`Standing/Sitting/Walking/Dizzy/Alarmed/Recovering`) with `neopixelSetState()` (called once on state change) and `neopixelTick()` (called every loop, non-blocking, drives the Alarmed pulse and Recovering amber→green fade off `millis()`). Confirmed all 6 states visually via a bring-up test.
- [x] Buzzer driver — **deviation:** buzzer is active with no signal pin (Phase 3) — driver is `digitalWrite(BUZZER_PIN, HIGH/LOW)` to switch its power directly, not `tone()`/`noTone()`. Implemented in `include/buzzer_driver.h` + `src/buzzer_driver.cpp` as a `BuzzerState` enum with distinct non-blocking on/off **beep patterns** per state (`Warning` = slow intermittent, `Siren` = fast continuous-feeling, `Recovery` = triple chirp + pause) instead of distinct tones. Confirmed audibly via the same bring-up test.

**State machine**

- [x] Implement the four states (NORMAL, DIZZY, ALARMED, RECOVERING) and transitions from the PRD's pseudocode/state diagram — `include/state_machine.h` + `src/state_machine.cpp`. Uses string comparison against `modelLabel()` rather than hardcoded class indices, so it stays correct even if the model is retrained with a different label order.
  - **Issue found during live testing, fixed in Phase 6:** ALARMED→RECOVERING originally required stand/dizzy/walk, excluding "sit". Live debug logging showed the model predicting "sit" for most of a real post-fall standing/walking attempt, which — combined with the sit exclusion — kept resetting the confirm counter and left the alarm stuck (siren never stopped). Not a state-machine logic bug; the debug log confirmed the code did exactly what it was told. Fixed in Phase 6 by broadening the exit criteria to include "sit" (any non-fall reading now counts) — safe to do since alerting had by then been decoupled from recovery detection entirely (see Phase 6 notes), so the worst case is stopping the siren a bit early, not missing an alert.
- [x] Implement `CONFIRM_THRESHOLD` and `RECOVER_CONFIRM_THRESHOLD` as sustained-reading counters, not single-frame triggers — `CONFIRM_THRESHOLD = 3` (~4.5s), `RECOVER_CONFIRM_THRESHOLD = 5` (~7.5s), counted in classifications at the ~0.67/sec (once per ~1.5s window) rate established below. (Initially set to 50/100 assuming a 50Hz classification rate; recalibrated after switching to non-overlapping-window classification — see the false-alarm fix below. Left as tunable constants for Phase 7 testing to adjust.)
- [x] **Deviation from the PRD's literal ALARMED exit condition:** by explicit choice, exiting ALARMED (siren stops, enters RECOVERING) now requires **stand, dizzy, or walk** — not the PRD's original "stand or sit." Any sign of movement/consciousness other than sitting still counts as recovering; a continued "fall" *or* "sit" reading keeps the siren going. RECOVERING → NORMAL (the final "all clear," which also sends the resolved Telegram message) still uses the original stand/sit criterion, unchanged.
- [x] Implement the ALARMED→RECOVERING→ALARMED relapse path (fall reading during RECOVERING jumps straight back to ALARMED and resets `alertSent` so a fresh Telegram message goes out)
- [x] **Real bug found during bring-up testing:** entering ALARMED on a single "fall" classification (as the PRD's pseudocode literally specifies) combined with classifying on a *sliding* window every new sample (~50Hz) caused spurious false alarms roughly every few seconds even at rest. The confusion matrix showed a small but nonzero false-fall rate (sit→fall, walk→fall, and especially dizzy→fall: ~1.2% of non-fall classifications overall) — at 50 classifications/second, that compounds to a ~46% chance of at least one false trigger per second. **Fixed without touching the single-frame-trigger logic**: switched from a sliding window (classify every sample) back to a fresh, non-overlapping window per classification (~0.67 classifications/sec) — this is also what the model was actually validated on (independent windows, not overlapping ones), and cuts the false-alarm rate to roughly once every couple of minutes. Neopixel/buzzer `tick()` calls still run every ~20ms during window collection so animations stay smooth despite the lower classification rate. Confirmed via a 35-second stationary test: zero false alarms.

**Telegram integration (historical; removed from current firmware 2026-10-09)**

- [x] Store the bot token, chat ID, and WiFi credentials in a `secrets.h` that's git-ignored (never commit these) — `include/secrets.h` (git-ignored) + `include/secrets.h.example` (committed template). Chat ID was retrieved by messaging the bot once, then fetching `https://api.telegram.org/bot<TOKEN>/getUpdates` and reading the `chat.id` field — the `.env` file from Phase 1 had saved the lookup *URL* instead of the actual numeric ID, so this had to be done properly here.
- [x] Implement `sendTelegramMessage()` as an HTTPS GET to the Bot API's `sendMessage` endpoint (`include/telegram.h` + `src/telegram.cpp`, using `WiFiClientSecure` + `HTTPClient`), called once on ALARMED entry (`alertSent` flag) and once on RECOVERING→NORMAL resolution. Returns `bool` (success/failure) rather than being fire-and-forget for the fall alert specifically — `alertSent` is only set `true` if the send actually succeeded, so it naturally retries on the next classification if WiFi wasn't ready yet, matching the PRD's pseudocode more precisely than an earlier draft that marked it sent unconditionally.
  - **Security note:** uses `WiFiClientSecure::setInsecure()` (no certificate pinning) — a common simplification for a hobbyist project, at the cost of no protection against a MITM on the local network. Documented in README's Build Log rather than silently done.
- [x] Make the WiFi/Telegram call non-blocking or at least short-timeout — `sendTelegramMessage()` checks `WiFi.status()` and returns immediately (no blocking wait) if not already connected; `telegramInit()`'s `WiFi.begin()` call itself is non-blocking (connects in the background). The actual HTTPS GET (only reached when already connected) has a 4-second timeout.
- [x] Wire it all together in `main.cpp`'s loop per the PRD pseudocode — confirmed working end-to-end: triggering a simulated fall produced a real Telegram message on-device.

## Phase 6 — Build, Flash & Upload

- [x] `pio run` to compile — **found and fixed a real build-blocking bug**: `include/secrets.h` had a missing closing quote on `TELEGRAM_CHAT_ID` (`"529206226` with no trailing `"`), a silent typo that broke every build. Unrelated to firmware logic. Also note: the PlatformIO CLI isn't on `$PATH` in this setup — invoked directly from `~/.platformio/penv/bin/pio` (same binary the VS Code extension uses under the hood).
- [x] Connect the ESP32-S3 over USB, confirm the correct serial port is detected (`pio device list`) — confirmed at `/dev/cu.usbmodem30EDA0A8ADE01`, "Espressif ESP32-S3-USB-OTG"
- [x] `pio run --target upload` to flash — **deviation: this board does NOT auto-reset into the bootloader.** esptool's normal DTR/RTS reset trick fails with "No serial data received" every time. Required manually holding **BOOT**, then pressing/releasing **RESET** (or unplug/replug USB) *while still holding BOOT*, before every single upload. While in bootloader mode the board re-enumerates under a **different port** (e.g. `/dev/cu.usbmodem101` or `.../2101`) as "USB JTAG/serial debug unit" — upload to that port, not the app one. After a successful upload it hard-resets back to the original port/name on its own.
- [x] Open the serial monitor (`pio device monitor`) and confirm sensor readings, inference output, and WiFi connection logs look sane before disconnecting from USB — **deviation: no such logging existed at all going into Phase 6.** Added a per-cycle `[cycle] predicted=<label> wifi=<connected|disconnected>` heartbeat in `main.cpp`, plus `[state]` transition logs and `[telegram]`/`[wifi]` send/connect logs in `state_machine.cpp`/`telegram.cpp`. This is what made the bugs below diagnosable at all rather than guessed at from behavior. `pio device monitor` itself can't run non-interactively from a script — needs a real terminal (or a pty wrapper like `script`) if scripting serial capture.
- [ ] Do a first untethered test: battery power (if wearable) or wall power (if room device), confirm Neopixel/buzzer behavior matches expectations for a basic "standing still" baseline — **partially done, and explicitly left open by decision**: extensive power-bank testing happened during this phase (see the bugs below, most of which were found *because of* untethered testing), but a clean confirmation run specifically with the final async-Telegram-task firmware hasn't been done off-USB yet. **Decision (2026-09-17):** the Phase 6 GitHub issue was closed anyway rather than blocking on this — the phase's core objective (build/flash/upload working, major bugs found and fixed) is solidly met, and this remaining item is being carried forward as a quick Phase 7 sanity check instead of a Phase 6 blocker.
- [x] Note the exact `platformio.ini` board/framework versions that worked in `/docs` — `platform = espressif32 @ 7.0.1`, `framework-arduinoespressif32 @ 3.20017.241212+sha.dcc1105b`, `tool-esptoolpy @ 4.11.0`, board `esp32s3usbotg`

**Bugs found and fixed during Phase 6 bring-up (not in the original plan — added here per the "record deviations" rule):**

- [x] **Real bug: a second fall's Telegram alert silently never sent.** Live testing showed: fall #1 → alert sent OK → recovered → resolved message sent OK → fall #2 → **no alert at all**, no error surfaced anywhere. Root cause (found via the new serial logging above): **WiFi silently dropped and never reconnected on its own** — `WiFi.status()` sat at disconnected for 25+ seconds straight with zero recovery attempts, despite `WiFi.setAutoReconnect(true)`. The state machine itself was doing exactly the right thing the whole time (fresh `alertSent = false` on every new alarm, retrying every cycle) — the transport underneath it had just died. **Fix:** `WiFi.setSleep(false)` in `telegramInit()` (disables ESP32 modem sleep, a known cause of exactly this silent-drop symptom) plus a new `telegramTick()` in `telegram.cpp`/`.h` that actively retries `WiFi.begin()` (throttled to once per 5s) whenever disconnected, called every ~20ms from `main.cpp`'s sampling loop so recovery isn't gated on the slower classification cadence.
- [x] **Real bug: repeated failed Telegram sends risked hanging the device.** After the WiFi fix, one test still showed a failed send attempt followed by the serial log going completely silent (heartbeat included) for well past what should have printed a retry — consistent with a second back-to-back TLS handshake (`WiFiClientSecure` + `HTTPClient`, freshly constructed each call) hanging rather than failing fast. **Fix:** throttled Telegram send retries to at most once per 5s (`ALERT_RETRY_INTERVAL_MS`) instead of every ~1.5s classification cycle, in `state_machine.cpp`.
- [x] **State machine redesigned around a "did they get up" question — product decision made mid-Phase-6, deviation from the original single-fall-triggers-alert design:** a fall now enters a new `FALLEN` state with a short (4s, `FALL_CONFIRM_DELAY_MS`) debounce before confirming — filters a single noisy frame, nothing more. **Explicit decision: the Telegram alert always fires once a fall is confirmed, never conditionally on whether the person seems to recover.** An earlier version of this redesign waited up to 20 seconds to decide whether to alert *at all*, canceling quietly with no message ever sent if the person got back up in time — this was built, tested, and explicitly rejected: missing a real fall is worse than an occasional extra alert, and gating the alert on the same recovery-detection logic that already had a known bug (see the Phase 5 ALARMED→RECOVERING note above) was too risky. Recovery is now fully decoupled from the alert: after `ALARMED`, sustained stand/dizzy/walk readings — no time limit, "whenever" — move to `RECOVERING` then `NORMAL` and send the "Resolved" message, unchanged from the original design. Buzzer escalation added to match: intermittent siren (`BuzzerState::Siren`) during the `FALLEN` debounce, escalating to a continuous tone (`BuzzerState::SirenConfirmed`) once confirmed.
- [x] **Confirmed end-to-end on real hardware, twice in a row, with real Telegram messages received on a phone:** fall → alert sent → recovered → resolved sent → second fall → alert sent again. This is the exact failure scenario reported at the start of Phase 6 testing, now fixed and verified.

**More bugs found and fixed during untethered (power-bank) field testing, after the above:**

- [x] **Real bug: a pending alert could be abandoned if the state moved on before WiFi came up.** The alert-send retry lived inside the `ALARMED` switch case, so if the person recovered (state left `ALARMED`) before WiFi ever connected, the send attempts simply stopped — the alert was silently lost, not just delayed. Found via a power-bank test where WiFi took 20-35s to reconnect after a cold boot, well longer than a quick recovery. **Fix:** message delivery (`alertSent`/`resolvedSent` retry) was hoisted out of the state switch to run unconditionally every cycle, independent of `AppState` — a pending message now keeps retrying forever until it actually succeeds, no matter what the state machine does afterward.
- [x] **Real bug: the fall-confirmation debounce could stretch to 15-20+ seconds instead of ~4s.** The debounce timer was restarted on every repeated "fall" classification (meant for a genuine relapse), but a single real fall's settling motion can itself span several consecutive classification windows, each one pushing the timer out further. **Fix:** the timer is now set once on the first fall reading and never reset within the same `FALLEN` episode — escalation is bounded to a fixed delay from the *first* reading, full stop.
- [x] **WiFi retry logic was fighting itself, stretching a normal ~5-10s connect out to 60-90+ seconds.** `telegramTick()` called `WiFi.begin()` again every 5s whenever disconnected — but calling `WiFi.begin()` while a connection attempt is already in progress can abort and restart that handshake, so a slow WPA2/DHCP negotiation kept getting interrupted before it could finish. **Fix:** throttle raised to 15s, giving a real attempt room to complete.
- [x] **Discovered (not a firmware bug): a home router can temporarily rate-limit/block a device that reassociates too aggressively.** After the above bug was live for a while, WiFi stopped connecting *at all* (not just slowly) on the original router, even after fixing the retry throttle — and it later connected fine again after enough time passed / other network changes. Most likely a router-side anti-flood defense triggered by the earlier 5s-retry storm. Not fixable from firmware; a router power-cycle or a wait typically clears it.
- [x] **Discovered (not a firmware bug): phone hotspots can default to 5GHz, which the ESP32-S3 (2.4GHz-only) cannot see at all.** Switching WiFi credentials to a phone hotspot for testing (to rule out the router block above) also failed to connect, for a different reason — worth checking a hotspot's band/"maximize compatibility" setting before assuming a firmware issue.
- [x] **Real build-tooling gotcha: editing `secrets.h` doesn't always trigger a relink.** After changing `WIFI_SSID`/`WIFI_PASSWORD` back to the router's credentials, `pio run` recompiled `telegram.cpp.o` (correctly, timestamp-wise) but did **not** relink `firmware.elf`/`firmware.bin` — verified by comparing file timestamps, and confirmed by `strings`-searching the built `.bin` for the expected SSID. A board flashed after an edit like this can silently still be running old credentials. **Workaround used:** `pio run --target clean` before rebuilding whenever a git-ignored header like `secrets.h` changes; verify with `strings firmware.bin | grep <expected-value>` if in doubt.
- [x] **Real bug (the actual root cause of "stuck" states and 10+ second alert latency): the Telegram send blocked the entire main loop.** `sendTelegramMessage()` is a real, synchronous HTTPS/TLS call, and it was being invoked directly from `stateMachineUpdate()`, which runs in the same single-threaded loop as IMU sampling, classification, and the buzzer/Neopixel ticks. While a send was in flight (which can take anywhere from under a second to several seconds, especially retrying on a flaky connection), *nothing else in the firmware could run* — no new samples, no new classifications, frozen animations — which looked exactly like the state machine being stuck, because the whole loop genuinely was. **Fix:** moved all Telegram sending onto a dedicated FreeRTOS task (`xTaskCreatePinnedToCore`, pinned to core 0, separate from Arduino's `loop()` on core 1) in `telegram.cpp`. `state_machine.cpp` now only calls fire-and-forget `telegramSendFallAlert()`/`telegramSendResolved()`; the background task owns all retry/backoff/delivery logic and the actual blocking network calls, so a slow or retrying send can never stall sensor sampling or classification again. Confirmed via serial log: `[cycle]` heartbeat lines kept appearing at a normal, steady cadence right through a live send and full recovery sequence.
- [x] **Recovery criteria broadened back to include "sit"** (`isRecoverySign()` now equals "any non-fall reading"), reverting the Phase 5 exclusion that caused the earlier stuck-alarm bug. Safe to do now that the alert no longer depends on recovery detection succeeding — worst case is stopping the siren a little early, not missing an alert.
- [x] **Added a purple-flash-x3 Neopixel indicator on WiFi connect** (`neopixelFlashWifiConnected()` in `neopixel_driver.h/.cpp`, triggered from `main.cpp`), non-blocking (ticked via `neopixelTick()` like everything else), so WiFi status is visible during untethered/battery testing without a serial monitor.
- [x] **Confirmed end-to-end again after all of the above, on the original home router, with the async Telegram task in place:** fall → alert sent OK → recovered cleanly (no longer stuck) → resolved message sent OK (after one transient retry) → classification heartbeat never skipped a beat throughout. Both messages confirmed received on a phone.

## Phase 7 — Testing & Validation

Validate against the PRD's own success criteria:

- [ ] **Carried over from Phase 6:** do a clean, final untethered (battery power) confirmation run with the current firmware — a basic "standing still" baseline plus one full local fall-alarm→recover cycle, off USB
- [ ] **Classifier accuracy** — re-check ≥90% on held-out data isn't just an Edge Impulse number; run live on-device with samples the model has never seen and log the confusion pattern, especially fall-vs-standing
- [ ] **Local alarm latency** — time from a simulated fall event to the Neopixel/buzzer alarm; log actual numbers across several trials
- [ ] **Zero missed falls** — this is the PRD's explicit priority over false-positive rate. Run repeated fall simulations (forward/backward/sideways, different speeds) and treat any miss as a blocker, not a tuning footnote
- [x] **Historical test on the previous network-enabled firmware:** local alarm fired with WiFi disabled and sensor classification did not stall during Telegram delivery; current firmware has no Wi-Fi or Telegram code
- [x] Test the relapse path: trigger ALARMED → let it reach RECOVERING → trigger another fall before it reaches NORMAL, confirm it jumps back to ALARMED and sends a fresh alert — observed live during Phase 6 testing (`RECOVERING -> ALARMED (predicted=fall)` in the serial log), fresh alert sent successfully
- [ ] Test recovery false-clear resistance: brief "standing" misreads during ALARMED should reset the confirm counter, not silence the alarm — deliberately inject a few noisy frames and confirm this holds
- [ ] If wearable: test battery life under continuous sampling + occasional WiFi bursts, and log it (open-source users will ask)
- [ ] Log every test run (setup, result, date) somewhere in `/docs` — this becomes the validation section of the writeup, not something to reconstruct from memory later

## Phase 8 — Documentation & Open-Source Release

- [ ] Write the README from the notes you've collected phase by phase — don't write it from scratch at the end: problem statement, BOM with links, wiring diagram + photos, setup instructions (PlatformIO, Edge Impulse), and a demo GIF/video of a simulated fall triggering the alert
- [ ] Publish the wiring diagram (Fritzing/Wokwi export) and pin table in `/docs`
- [ ] Document the dataset: class list, collection method per class, final sample counts, and either the exported dataset or clear instructions for reproducing it (raw motion data is usually fine to share; note any privacy considerations if it includes identifiable video/audio, which this project doesn't)
- [ ] Include the trained model export (or a link/version note if it's too large for git) so people can flash and test without retraining from zero
- [ ] Document known limitations plainly — false positive rate, what "dizzy" simulation doesn't capture about real dizziness, and battery life if wearable; remote alerts are out of scope for the current firmware
- [ ] Add a CONTRIBUTING.md if you want outside contributions, and confirm the LICENSE file from Phase 1 is in place
- [ ] Do a final clean-clone test: pull the repo fresh on another machine (or ask someone else to), follow only the README, and see how far they get without asking you anything — fix whatever trips them up
- [ ] Publish: push to GitHub, write a short launch post (blog/LinkedIn/forum) summarizing the problem, the approach, and linking the repo and demo video
