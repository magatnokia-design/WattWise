// ---------------------------
// SECRETS TEMPLATE - safe to commit
// ---------------------------
// Copy this file to secrets.h (same folder) and fill in the real values.
// secrets.h is gitignored so credentials never reach the repository.

#pragma once

// NOTE: WIFI_SSID and WIFI_PASSWORD used to live here and no longer do.
// The Hub asks for the network at runtime through its setup portal and keeps
// the answer in NVS, so a home network password is never compiled into a
// firmware image. See wifiProvisioning.h.

static const char* DEVICE_ID = "ESP32_ROOM_A";
// Must match the deviceToken stored on the user document in Firestore.
static const char* DEVICE_TOKEN = "YOUR_DEVICE_TOKEN";

// Password for the Hub's own setup network (WattWise-Hub-XXXX), printed on the
// unit sticker. This guards the setup portal only - it is not a network
// credential, and it is not the device token.
//
// Use a per-unit random value. Do NOT derive it from the MAC address: the MAC
// is broadcast as the AP's BSSID, so a MAC-derived password protects nothing.
// Minimum 8 characters, or the ESP32 refuses to start a WPA2 AP.
static const char* PROVISION_AP_PASSWORD = "CHANGE_ME_8_PLUS_CHARS";
