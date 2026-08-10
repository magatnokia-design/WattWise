# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WattWise (repo folder `C:\App\WattWise`; Firebase project ID is still `wattwise-fe394` — an
earlier name — see `.firebaserc` and `src/services/firebase/config.js`) is a smart energy
monitoring app for apartment rooms with ESP32-based outlet control. It covers exactly 2
outlets, live telemetry, appliance auto-detection, scheduling, safety cutoff, budget tracking,
notifications, usage analytics, and a rate-plan/billing flow. The React Native/Expo app is the
user-facing control plane; Firebase Cloud Functions handle trusted hardware ingestion, command
dispatch, scheduled jobs, and notification triggers.

## Commands

Run from the repo root unless noted.

```powershell
# Frontend (Expo)
npm start                 # expo start
npm run android            # expo start --android
npm run ios                # expo start --ios
npm run web                 # expo start --web

# Functions - lint + test (run from repo root or functions/)
npm run verify:functions    # lints and tests functions/ from the root
cd functions; npm run lint  # eslint . (eslint-config-google)
cd functions; npm test       # node --test (Node's built-in test runner, not Jest)
cd functions; node --test test/applianceDetector.test.js   # run a single test file
cd functions; firebase emulators:start --only functions     # npm run serve
cd functions; firebase functions:shell                       # npm run shell
cd functions; firebase deploy --only functions               # npm run deploy
cd functions; firebase functions:log                          # npm run logs
```

There is no frontend test suite or linter configured in the root `package.json` — testing
infrastructure exists only under `functions/`.

## Hard Constraints (never violate without explicit confirmation)

- Exactly **2 outlets** (`outlet1`, `outlet2`), stable IDs, never more.
- **Low-voltage appliances only** (chargers, laptops, fans, TVs, LED lamps, consoles).
- `outlet1` -> relay CH2 -> **GPIO22**. `outlet2` -> relay CH1 -> **GPIO23**. Do not swap these
  (see `docs/esp32/WattWise_ESP32_Relay_Cloud/WattWise_ESP32_Relay_Cloud.ino`).
- Theme is green/white only, from `src/constants/colors.js`. Primary `#10B981`. UI is minimal:
  white cards, rounded corners, subdued borders, dim-overlay modals, emoji bottom-tab icons.
- **No mock/dummy data with intervals.** Use `0` or real Firebase data.
- Functions runtime is pinned to `asia-southeast1` with limited concurrency
  (`setGlobalOptions` in `functions/index.js`: `maxInstances: 10`, `memory: '256MiB'`,
  `timeoutSeconds: 60`). The hardware path (ESP32 HTTP endpoints) requires strict request
  validation, fresh timestamps, and device-token checks via `functions/src/lib/deviceSecurity.js`
  - don't relax these for convenience.
- Appliance detection is **suggestion-first** - it never auto-renames or auto-acts without user
  confirmation. Resets go through the explicit `clearAutoDetection` callable, not ad hoc writes.

## Architecture

### Device command flow (poll-based, not push)

ESP32 does not receive pushed commands. Instead:

1. App calls the `processOutletToggle` callable, which (via
   `functions/src/lib/deviceCommandDispatcher.js`) resolves the target device and writes a
   pending command to `users/{userId}/device_commands/{commandId}`.
2. ESP32 polls `getDeviceCommand` (HTTP) to fetch its latest pending command.
3. ESP32 calls `ackDeviceCommand` (HTTP) to report delivery/execution status; this updates the
   ack fields and marks the command executed.
4. `markStaleDeviceCommands` (scheduled, every minute) times out commands that never got
   acknowledged.
5. `handleDeviceCommandEmails` (Firestore trigger on `device_commands/{commandId}`) sends
   failure-notification emails by queueing them to the `mail` collection.

Telemetry flows the other direction: ESP32 posts sensor readings to `updateOutletMetrics`
(HTTP), which validates the device via `deviceSecurity.js` (timestamp freshness, per-device
token with grace-period rotation, rate/replay guards) before writing to
`users/{userId}/outlets/{outletId}`.

All three ESP32-facing endpoints (`updateOutletMetrics`, `ackDeviceCommand`, `getDeviceCommand`)
are plain `onRequest` HTTP functions with CORS enabled, not callables, since the device can't use
the Firebase client SDK.

### Backend structure (`functions/`)

Function-first layout under `functions/src/`:
- `http/` - HTTP endpoints (ESP32-facing) and HTTPS callables (app-facing)
- `scheduled/` - `onSchedule` cron jobs (all `Asia/Manila` timezone)
- `triggers/` - `onDocumentWritten` Firestore triggers
- `lib/` - shared logic: `deviceSecurity.js` (device auth/validation), `deviceCommandDispatcher.js`
  (command writes), `applianceDetector.js`, `billing.js`, `mailQueue.js` (queues email docs
  to the top-level `mail` collection for the Firestore "Trigger Email" extension to send)

`functions/index.js` is the single export registry and runtime config entry point - every
exported function's trigger config (region inherited from `setGlobalOptions`, schedule, Firestore
document path, secrets) lives there, not in the handler files. When adding a function, register
it there with the same doc-comment style (`Called from:` / trigger description) used for the
existing exports.

Tests live in `functions/test/`, not colocated with `lib/`, and use Node's built-in test runner
(`node --test`), not Jest.

### Frontend structure (`src/`)

Screen-first layout: `screens/<ScreenName>/` typically contains the screen component plus its own
`components/`, `hooks/`, and `utils/` subfolders (see `Settings/`, `Dashboard/`, `BudgetTracking/`,
`History/`, etc.). Shared UI lives in `components/common/` and `components/ui/`. All Firebase
access goes through `src/services/firebase/*Service.js` modules (one per domain: `outletService`,
`userService`, `budgetService`, `historyService`, `safetyService`, `scheduleService`,
`notificationService`, `comparisonService`) - screens/hooks should not call `firebase/firestore`
or `httpsCallable` directly.

Billing/rate-plan calculation logic is intentionally duplicated by design between the client
(`src/utils/billing.js`) and backend (`functions/src/lib/billing.js`): `calculatePelcoIIIBill`
(PELCO III tariff) driven by `RATE_PROFILES`. Keep both in sync when changing tariff logic - the
Settings screen (`RatePlanModal`), `useSettings.js` -> `outletService.js`, and the Analytics
screen's bill totals all depend on the two implementations agreeing.

### Firestore layout

`docs/firebase-schema.md` is the original design doc (some of it, e.g. the ESP32-command-via-
Realtime-Database section, is superseded by the poll-based `device_commands` flow above - trust
the code over that doc for data flow). Current top-level structure under `users/{userId}`:
- `outlets/{outletId}` - `outlet1`/`outlet2` only, live telemetry + auto-detection state
- `device_commands/{commandId}` - pending/acked device commands (see flow above)
- `history_logs/{logId}`, `history_daily/{date}` - event log and daily rollups
  (`processDailyRollup`, scheduled at midnight `Asia/Manila`)
- `budget/{month}` - monthly budget tracking, updated via `handleBudgetAlerts` trigger
- `notifications/{notificationId}`
- `power_safety/settings` - safety thresholds/state, `handleSafetyAlerts` trigger handles
  auto-cutoff
- `schedules/{scheduleId}`, `reference_comparison/{month}` - present per the frontend
  (`ReferenceComparison`, `Timer` screens) though not re-verified against the schema doc

## Naming Conventions

- camelCase throughout (JS + Firestore fields)
- `use...` for hooks, `update...` for mutations, `clear...` for resets, `handle...` for UI
  callbacks and Firestore triggers

## Workflow Notes

- Read a file's current content before modifying it - don't trust doc descriptions of "what a
  file does" over the file itself (this repo has several stale/aspirational docs, notably
  `docs/firebase-schema.md`).
- Windows/PowerShell dev environment - give PowerShell commands, not bash.
