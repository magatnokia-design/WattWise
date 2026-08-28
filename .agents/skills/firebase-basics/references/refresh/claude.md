> # ⚠️ OUTDATED - DO NOT USE AS PROJECT REFERENCE
>
> This file is **not** the firebase-basics skill doc it is supposed to be. A
> WattWise handoff note was written over the vendored file at some point, so the
> real skill-refresh instructions for Claude Code are missing (compare its
> siblings `antigravity.md`, `gemini-cli.md`, `other-agents.md`, which still
> hold theirs).
>
> **Its content is also wrong.** It states `outlet1 -> relay CH2 -> GPIO22`,
> which is backwards. The real mapping is `outlet1 -> relay CH1 -> GPIO23`,
> settled on 2026-08-15 by serial output from the running device and confirmed
> by the firmware source. It also carries the resolved “WiseWatt vs WattWise”
> name confusion and a stale next-steps list.
>
> **`/CLAUDE.md` at the repo root is the authority.** Read that instead.

# WiseWatt / WattWise — Claude Code Project Memory

> ⚠️ NAME CONFLICT UNRESOLVED: an earlier handoff called this project
> "WattWise" (Firebase project `wattwise-fe394`). A more recent agent-read
> handoff (sourced directly from `README.md` / `package.json` on disk) calls
> it "WiseWatt" (repo at `C:\App\WiseWatt`). Confirm which is current — repo
> folder name and Firebase project ID don't have to match, but worth a quick
> check. Using **WiseWatt** below since that source read the live files.

## Project

Smart energy monitoring app for apartment rooms, ESP32-based outlet control
(exactly 2 outlets), live telemetry, appliance auto-detection, scheduling,
safety cutoff, budget tracking, notifications, usage analytics, and a
rate-plan/billing flow. Mobile app is the user-facing control plane; Firebase
Cloud Functions handle trusted hardware ingestion, command dispatch,
scheduled jobs, and notification triggers.

## Hard Constraints (never violate without explicit confirmation)

- Exactly **2 outlets** (`outlet1`, `outlet2`), stable IDs, never more.
- **Low-voltage appliances only** (chargers, laptops, fans, TVs, LED lamps,
  consoles).
- `outlet1` → relay CH2 → **GPIO22**. `outlet2` → relay CH1 → **GPIO23**.
  Do not swap these. (Confirm this still holds — sourced from the older doc,
  not re-verified against current firmware.)
- Theme is green/white only, from `src/constants/colors.js`. Primary
  `#10B981`. UI is minimal: white cards, rounded corners, subdued borders,
  dim-overlay modals, emoji bottom-tab icons.
- **No mock/dummy data with intervals.** Use `0` or real Firebase data.
- Functions runtime pinned to `asia-southeast1`, limited concurrency.
  Hardware path (ESP32) requires strict request validation, fresh
  timestamps, and device-token checks — don't relax these for convenience.
- Appliance detection is **suggestion-first** — never auto-renames or
  auto-acts without user confirmation. Resets go through the explicit
  `clearAutoDetection` path, not ad hoc writes.

## Tech Stack

- **Client:** React Native 0.81, Expo 54, React 19, JavaScript
- **Backend:** Firebase Cloud Functions v2, Node 24, `firebase-admin` +
  `firebase-functions`
- **Data/auth:** Firestore + Firebase Authentication
- **Testing:** Node's built-in test runner (not Jest)
- **Linting:** ESLint + `eslint-config-google`
- **Hardware:** ESP32 (ESP-WROOM-32) + 2x PZEM-004T sensors + 2-channel
  active-LOW relay

## Naming Conventions

- camelCase throughout (JS + Firestore fields)
- `use...` for hooks, `update...` for mutations, `clear...` for resets,
  `handle...` for UI callbacks

## Folder Structure

**Frontend** — screen-first under `src/`: `screens/`, `components/`
(shared UI), `constants/`, `navigation/`, `services/firebase/`.

**Backend** — function-first under `functions/src/`: `http/`, `scheduled/`,
`triggers/`, `lib/` (shared logic, e.g. `applianceDetector.js`, `billing.js`).
`functions/index.js` is the export registry / runtime config entry point.
Tests live in `functions/test/`, not colocated with `lib/`.

## Firestore Structure

```
users/{userId}
  /outlets/{outletId}          # outlet1, outlet2 only
  /history_logs/{logId}
  /history_daily/{date}
  /budget/{month}
  /notifications/{notificationId}
  /power_safety/settings
```
(Schedules / reference_comparison collections existed in the older doc —
confirm still present; not mentioned in the latest read.)

## Current Feature Surface

### Rate-plan / billing (just completed, wired end-to-end)
- `SettingsScreen.js` opens `RatePlanModal` (`src/screens/Settings/components/`)
- Persists `rateProfileId` via `useSettings.js` → `outletService.js`
- Shared calculation logic duplicated by design across client
  (`src/utils/billing.js`) and backend (`functions/src/lib/billing.js`) —
  `calculatePelcoIIIBill` (PELCO III tariff), driven by `RATE_PROFILES`
- `AnalyticsScreen.js` now computes bill totals through the shared helper
  using the selected profile
- **Pending:** end-to-end smoke test against real data so Settings,
  Analytics, and Firestore agree on the same profile/totals; no dedicated
  tests yet for the billing calculator

### Auto-detection reset (just completed)
- Client can clear stale appliance suggestions per outlet or for both
- Backend: `functions/src/http/clearAutoDetection.js` writes the reset payload
- One-off cleanup script: `functions/scripts/resetAutoDetection.js` — needs
  to be run against any environment with pre-existing stale suggestion data
- **Pending:** validate on live data; no dedicated tests yet for this path

## Workflow Rules for Claude Code

- Read a file's current content before modifying it — don't trust doc
  descriptions of "what a file does" over the file itself.
- Windows/PowerShell dev environment — give PowerShell commands, not bash.
- Note: two Copilot-memory files exist at
  `.../GitHub.copilot-chat/memory-tool/memories/repo/` —
  `outlet-telemetry-freshness.md` and `hardware-readiness-notes.md`. These
  are Copilot's own memory, not Claude's, but their *content* is useful
  project context worth reading once and folding in here if relevant.
- No syntax/lint errors currently reported on touched files (billing +
  auto-detection-reset work) as of the last check — but that check preceded
  smoke testing.

## Immediate Next Steps (in order)

1. Run `functions` lint/test pass
2. Smoke-test Settings rate-plan selection end-to-end
3. Confirm Analytics cost calculations match selected profile
4. Add focused tests for the billing calculator and the clear-auto-detection
   path (both are now shared behavior surfaces between app and backend)
5. Run `resetAutoDetection.js` against any environment with stale
   auto-detection data
6. Deploy Functions once the above is clean

## Later / Deferred

- Billing/analytics polish: clearer bill breakdowns, better monthly
  comparison views, possible multi-tariff-profile support
- Phase 6: Documentation (README, API docs, deployment guide, user manual)
- Web platform build via Expo (`npx expo export --platform web`), needs a
  Hosting block added to `firebase.json`