# WattWise

A smart energy monitor for an apartment room: two mains outlets under app
control, with live power measurement, appliance detection, scheduling, a safety
cutoff, budget tracking and PELCO III billing.

Three components, two repositories:

| Component | Lives in | What it is |
|---|---|---|
| **App** | this repo, `src/` | React Native / Expo 54, the Android client |
| **Backend** | this repo, `functions/` | Firebase Cloud Functions v2, Node 24 |
| **Hub** | this repo, `docs/esp32/` | ESP32 firmware - **not a separate repo** |
| **Web** | `C:\App\wattwise-web` | Vite + React browser client, deployed on Vercel |

The Hub catching people out is common enough to state plainly: the firmware is
an Arduino sketch inside this repository, built with `arduino-cli`. There is no
fourth repo.

Both clients talk to the same Firebase project (`wattwise-fe394`). The ESP32
talks to Cloud Functions over plain HTTP and has no idea which client queued the
command it just picked up - which is the whole reason two clients work at all.

---

## Start here

| If you want to | Read |
|---|---|
| Set up a machine from scratch | **[docs/FRESH-MACHINE.md](docs/FRESH-MACHINE.md)** |
| Work on the code | **[CLAUDE.md](CLAUDE.md)** - constraints, architecture, commands |
| Understand the data model | `docs/firebase-schema.md` (stale in places - trust the code) |
| Touch anything auth or email | `docs/email-senders.md` |

`CLAUDE.md` is the working reference and is kept current. It carries the hard
constraints, the device command flow, the ESP32 toolchain, and the traps that
have already cost this project time.

## Quick commands

```powershell
npm start                 # Expo dev server
npm run verify            # lint + app tests + functions lint/tests
npm run verify:functions  # backend only
npm run device:qr         # regenerate the ESP32 pairing QR from secrets.h
```

The Android release APK is built in **GitHub Actions only**, never on a laptop,
and never without being asked - it costs runner minutes and puts an installable
artifact in front of testers. See the Commands section of `CLAUDE.md`.

## Hard constraints

Stated in full in `CLAUDE.md`; the ones that surprise people:

- **Exactly two outlets**, `outlet1` and `outlet2`, stable ids, never more.
- **Low-voltage appliances only.** 500 W per outlet, 1000 W combined, enforced
  both on the device and in the backend.
- `outlet1` drives relay CH1 on **GPIO23**; `outlet2` drives CH2 on **GPIO22**.
  The **PZEM sensor channels are crossed on purpose** - `outlet1` reads PZEM 2 -
  because the loom is wired that way. Relays straight, sensors crossed.
- **Appliance identification is suggestion-first** and is never load-bearing.
  Energy, cost and the safety cutoff are all measured directly and never read
  the appliance name.

## What is not in this repository

`secrets.h` (device token and setup-network password) is gitignored and exists
only on the developer machine and in a password manager. `.env` files, the
generated `android/` folder, and the pairing QR images are likewise local.

Nothing else of consequence is missing - see the inventory at the top of
[docs/FRESH-MACHINE.md](docs/FRESH-MACHINE.md).
