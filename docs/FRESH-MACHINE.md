# Fresh machine

Going from a bare Windows install to a working WattWise environment: the phone
app, the web client, and the ESP32 Hub.

Written 28 Aug 2026, the day after a full Windows reset, from the actual
recovery rather than from memory. Everything here was run.

---

## Read this first: almost nothing is lost

A reset destroys a lot of *time* and almost no *information*. Exactly one file
in either repo cannot be recovered from somewhere else:

```
docs/esp32/WattWise_ESP32_Relay_Cloud/secrets.h
```

It holds `DEVICE_ID`, `DEVICE_TOKEN` and `PROVISION_AP_PASSWORD`. It is
gitignored by design, so it is not on GitHub and never should be. **Keep a copy
in a password manager.** That is the entire backup story.

Everything else regenerates:

| Gone after a reset | How it comes back |
|---|---|
| `node_modules/` (three of them) | `npm ci` |
| Global CLIs and their logins | Reinstall, re-authenticate |
| `%LOCALAPPDATA%\Arduino15` (~3 GB) | `arduino-cli core install` |
| `android/` | `npx expo prebuild` |
| `.vercel/`, `.env.local` (web) | `vercel link` |
| `~/.android/debug.keystore` | See "the keystore" below |
| Git identity (`user.name` / `user.email`) | Reconfigure - see step 1 |
| Claude Code memory | Rewritten as you work |

Secrets that live off-machine and survive untouched: the Brevo SMTP password
(Google Secret Manager), the Android signing keystore (GitHub Actions secret),
and the Firebase web API keys (public identifiers, committed on purpose).

### The keystore

`ANDROID_DEBUG_KEYSTORE_BASE64` in GitHub Actions is the **only** copy of the
key that signs release APKs, and GitHub secrets are write-only - it cannot be
read back. Do not delete it. If it is ever lost, every future build gets a new
signature and every tester must uninstall before updating.

---

## 1. Git identity

Nothing else works properly until this is set. Recover the exact values from the
history rather than guessing, so authorship stays consistent:

```powershell
git log -3 --format="%an <%ae>"
git config --global user.name  "<name from above>"
git config --global user.email "<email from above>"
```

## 2. Node

Node **24** and npm 11. `functions/package.json` pins `engines.node` to 24, and
`test/vite-resolve-hook.js` uses `module.registerHooks`, which needs 22.15+.

Do not downgrade to match the CI workflows - they run Node 20 but never execute
the root test suite, so that mismatch never surfaces there.

## 3. CLIs

npm globals first - these need no elevation:

```powershell
npm install -g firebase-tools
npm install -g vercel
```

Then winget:

```powershell
winget install --id GitHub.cli
winget install --id EclipseAdoptium.Temurin.17.JDK
winget install --id ArduinoSA.CLI
```

**JDK must be 17.** RN 0.81 / Expo SDK 54 do not build on newer JDKs
(`build-apk.yml` pins Temurin 17). It is needed for `firebase emulators:start`
*and* for local dev-client builds - the only remaining route to a dev client,
since EAS quota is exhausted and CI only produces release APKs.

### The PATH trap

winget updates the machine PATH, but an already-running terminal keeps its old
copy - and in VS Code, opening a new terminal *tab* inherits from the VS Code
process, which is also stale. Refresh in place:

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

That fixes one window. Fully quitting and reopening VS Code fixes it for good.

## 4. The three logins

These need a browser and cannot be automated.

```powershell
gh auth login
```

GitHub.com, then HTTPS, then browser. Answer **yes** to the prompt about
authenticating Git with your GitHub credentials - both remotes are HTTPS and the
credential store is empty after a reset, so this is what repairs `git push`.

```powershell
firebase login --no-localhost
```

**Use `--no-localhost`.** The plain form starts a localhost listener and waits
for a browser redirect that does not always arrive; it hangs with no error. The
`--no-localhost` flow prints a URL and takes a pasted code instead.

```powershell
cd C:\App\wattwise-web
vercel login
vercel link
```

At `vercel link`, pick the **existing** project - it is tagged as linked by git.
Creating a new one gives you a second project deploying to a URL nobody visits
while `wattwise.site` stays on the original.

Verify: `gh auth status`, `firebase projects:list` (expect `wattwise-fe394`),
`vercel whoami`.

## 5. Dependencies

Three `package.json` files across two repos. The Hub is C++ and has none.

```powershell
cd C:\App\WattWise
npm ci
npm ci --prefix functions

cd C:\App\wattwise-web
npm ci
```

`npm ci`, not `npm install` - both lockfiles are `lockfileVersion: 3` and should
be honoured exactly. `functions/node_modules` is not optional even for frontend
work: `npm run lint:app` reaches into it for ESLint, and `firebase.json` runs
`npm --prefix functions run lint` as a predeploy hook.

## 6. Prove it works before changing anything

```powershell
cd C:\App\WattWise
npm run verify

cd C:\App\wattwise-web
npm run verify
```

Expect roughly 73 app + 286 functions + 184 web tests, all passing, and a clean
production build for the web. If these are green the restore is genuinely
complete - do not start editing before they are.

## 7. ESP32 toolchain

See the **ESP32 toolchain** section in `CLAUDE.md` for the reasoning behind each
line. The commands:

```powershell
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32
arduino-cli lib install "ArduinoJson@6.21.5"
arduino-cli lib install "PZEM004Tv30"
```

Three traps, each of which has already cost this project time:

1. **Pin ArduinoJson to 6.21.5.** The sketch uses `StaticJsonDocument<N>` and
   `createNestedObject()`, both removed in 7.x. An unpinned install silently
   upgrades and the build then fails with template errors that never name the
   real cause. `arduino-cli lib upgrade` is denied in `.claude/settings.json`
   for exactly this reason.
2. **The library is `PZEM004Tv30`**, not the repo name `PZEM-004T-v30`, and
   **not** `data/PZEM004T-master.zip` in the sketch folder - that zip is a
   different, incompatible library that ships `PZEM004T.h`.
3. **Compile and upload must share an explicit build path.** The cache directory
   is a hash of the build options, so a `compile` that passes `--libraries` and
   a plain `upload` resolve to different directories - and upload then flashes
   an *older* binary while reporting a verified hash.

The core is around 3 GB unpacked; it pulls toolchains for the whole ESP32
family, not just the classic ESP32 this build uses.

## 8. Restore secrets.h, and re-pair if the token changed

Copy `secrets.example.h` to `secrets.h` and fill in your saved values.

**Put them in `secrets.h`, never in `secrets.example.h`.** The example file is
tracked, so editing it puts your device token on a public GitHub repo. This
almost happened on 28 Aug 2026 and was caught before the commit.

If the token has to change, rotate it **through the app**, not by hand.
`linkDeviceToAccount` writes all three token fields in one transaction:

```
devices/{deviceId}.deviceToken
users/{userId}.deviceToken
users/{userId}.device.token
```

`deviceSecurity.js` accepts **any** of them, plus a legacy `users/{userId}.esp32.token`
that nothing writes any more. Editing Firestore by hand risks leaving one
behind, and one stale field is enough to keep an old token working.

```powershell
npm run device:qr
```

That reads `secrets.h` and writes `docs/esp32/qr/` (gitignored). Scan the QR in
the app under Settings, device QR scanner.

**If the AP password is lost it cannot be recovered** - it is compiled in and
deliberately not derived from the MAC. Choose a new one, reflash, and correct
the unit sticker. Until that is done, do not hold BOOT for 5 seconds and do not
change the Wi-Fi network: both drop the Hub into a setup portal you cannot log
into.

A normal sketch upload preserves NVS, so stored Wi-Fi credentials survive and
the Hub rejoins the network on boot. **Never use an erase-all-flash option** -
that wipes NVS and forces re-provisioning.

---

## Optional, and only if you need it

`gcloud` is required solely by `functions/scripts/resetAutoDetection.js`, which
uses Application Default Credentials. `firebase login` does **not** provide ADC
to the Admin SDK. Skip it until that script is actually needed.

---

## Checklist

```
[ ] git user.name / user.email set from history
[ ] node --version -> v24.x
[ ] gh auth status / firebase projects:list / vercel whoami all succeed
[ ] npm ci in WattWise, WattWise/functions, wattwise-web
[ ] npm run verify green in both repos
[ ] arduino-cli core list -> esp32:esp32
[ ] arduino-cli lib list -> ArduinoJson 6.21.5, PZEM004Tv30
[ ] secrets.h restored from backup
[ ] arduino-cli compile succeeds (~84% of program storage)
```
