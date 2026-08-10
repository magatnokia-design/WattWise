# Device QR pairing

The Settings screen can link an ESP32 to a user account by scanning a QR code,
instead of typing the device ID and token by hand. Scanning writes exactly the
same state as manual entry, so both routes are interchangeable.

## What the QR must contain

The device ID and the device token — the same two values `secrets.h` holds and
that `deviceSecurity.js` validates on every hardware request.

Any of three encodings is accepted (`src/screens/Settings/utils/deviceQr.js`):

**JSON** (recommended)

```json
{"deviceId":"ESP32_ROOM_A","token":"<device-token>"}
```

`device_id` / `device_token` / `id` / `deviceToken` are also accepted as keys.

**URI with query parameters**

```
wattwise://device?deviceId=ESP32_ROOM_A&token=<device-token>
```

**Delimited pair** — separator may be `|`, `,` or `;`

```
ESP32_ROOM_A|<device-token>
```

## Rules the scanner enforces

- Device ID and token must both be present.
- Token must be at least 8 characters, matching the manual-entry modal.
- Fields are trimmed and capped at 128 characters.
- Anything else is rejected with a specific message and a Try again button.

A single QR stays in frame for many camera frames, so the scanner locks after
the first successful read and will not submit the same pairing repeatedly.

## Generating the code

Use the bundled generator. It runs offline, so the device token never leaves
your machine — do **not** paste the token into an online QR generator.

```powershell
npm run device:qr
```

It reads `DEVICE_ID` and `DEVICE_TOKEN` straight out of
`docs/esp32/WattWise_ESP32_Relay_Cloud/secrets.h`, so the printed label cannot
drift from what is actually flashed to the board. To generate for a different
unit without editing `secrets.h`:

```powershell
node scripts/generate-device-qr.js --deviceId ESP32_ROOM_B --token <token>
```

Output lands in `docs/esp32/qr/` (gitignored):

| File | Use |
| --- | --- |
| `<deviceId>.html` | Printable label — open it and press Ctrl+P |
| `<deviceId>.svg` | Vector, best quality for printing at any size |
| `<deviceId>.png` | Raster image, for pasting into documentation |

A scannable QR is also drawn in the terminal, so you can test pairing straight
off the screen before printing anything.

Codes are generated at error-correction level **H**, so a scuffed or partly
obscured label still scans.

## End-to-end workflow

1. Flash the ESP32 with its `secrets.h` values.
2. Run `npm run device:qr`.
3. Open `docs/esp32/qr/<deviceId>.html` and print it.
4. Put the label inside the enclosure and ship the unit.
5. The user opens **Settings → Device → Scan device QR** and points the camera
   at the label. The device is now bound to their account.

## Security note

**The QR carries the device token in plain text.** Anyone who photographs it can
impersonate the device: post fake telemetry, pollute billing data, and trip the
safety cutoff. Treat the printed code like a password:

- Put it inside the enclosure or under the lid, not on an outward-facing surface.
- Do not commit generated QR images to the repository.
- Re-flash with a fresh token if a code is exposed, then re-scan to re-pair.

Scanning a new code re-pairs the account to that device, which is why there is no
separate unlink action in Settings.

## Moving a device to another account

Security rules only let a client write a `devices/{deviceId}` document it already
owns, so a second account scanning the same unit is rejected client-side. When
that happens the app falls back to the `linkDeviceToAccount` callable, which
verifies the scanned token against the stored one and transfers ownership with
admin privileges, detaching the device from the previous account.

The practical effect: **scanning the label from a different account just works**,
as long as the token on the label matches the device. Useful when creating a
fresh test account against the same hardware. No need to log back into the old
account to release it first.

## Rebuild requirement

`expo-camera` contains native code. After pulling this change, rebuild the dev
client before the scanner will run:

```powershell
eas build --profile development --platform android
```

Until then the scanner screen will fail to load the camera module. Manual entry
under **Settings → Device → Enter details manually** keeps working meanwhile.
