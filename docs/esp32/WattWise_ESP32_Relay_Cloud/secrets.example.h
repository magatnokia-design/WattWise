// ---------------------------
// SECRETS TEMPLATE - safe to commit
// ---------------------------
// Copy this file to secrets.h (same folder) and fill in the real values.
// secrets.h is gitignored so credentials never reach the repository.

#pragma once

static const char* WIFI_SSID = "YOUR_WIFI_SSID";
static const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

static const char* DEVICE_ID = "ESP32_ROOM_A";
// Must match the deviceToken stored on the user document in Firestore.
static const char* DEVICE_TOKEN = "YOUR_DEVICE_TOKEN";
