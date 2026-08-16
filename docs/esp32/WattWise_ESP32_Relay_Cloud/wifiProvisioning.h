#pragma once

/*
 * Wi-Fi provisioning for the WattWise Hub.
 *
 * WHY THIS EXISTS
 *
 * Wi-Fi credentials used to be compiled into the firmware from secrets.h. That
 * had two costs: anyone who could read the flash could read the home network
 * password, and nobody but the developer could ever set a unit up - changing
 * routers meant re-flashing over USB. Credentials now live in NVS, written at
 * runtime through a captive portal.
 *
 * WHAT THIS DOES NOT DO
 *
 * NVS is not encrypted by default. Someone with physical access and a USB cable
 * can still dump the credentials. This is a real improvement - a leaked .bin no
 * longer carries anyone's password, and each unit provisions itself - but it is
 * not secure storage, and the security write-up should say so rather than imply
 * otherwise. Flash encryption is a separate, one-way change and is deliberately
 * out of scope here.
 *
 * THE PORTAL IS WPA2, NOT OPEN
 *
 * An open provisioning AP lets anyone in range point the Hub at a network of
 * their choosing. The AP password is a per-unit value from secrets.h, meant to
 * be printed on the sticker. It is not derived from the MAC address: the MAC is
 * broadcast as the BSSID, so a MAC-derived password would be no password at all.
 */

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>

// GPIO0 is the BOOT button on every ESP32 dev board. It is also the flash-mode
// strapping pin, which is why it is only ever READ, and only after boot has
// finished - driving it or reading it early would interfere with the bootloader.
static const int BOOT_BUTTON_PIN = 0;
static const unsigned long FACTORY_RESET_HOLD_MS = 5000;

static const char* NVS_NAMESPACE = "wattwise";
static const char* NVS_KEY_SSID = "wifi_ssid";
static const char* NVS_KEY_PASSWORD = "wifi_pass";

// A portal left up forever is an open door. If nobody provisions within this
// window the Hub reboots and retries its stored network, so a transient outage
// cannot strand it in AP mode.
static const unsigned long PORTAL_TIMEOUT_MS = 10UL * 60UL * 1000UL;

static Preferences wifiPrefs;
static WebServer portalServer(80);
static DNSServer portalDns;

static String storedSsid;
static String storedPassword;

// ---------------------------------------------------------------------------
// Credential storage
// ---------------------------------------------------------------------------

bool loadWifiCredentials() {
  wifiPrefs.begin(NVS_NAMESPACE, true); // read-only
  storedSsid = wifiPrefs.getString(NVS_KEY_SSID, "");
  storedPassword = wifiPrefs.getString(NVS_KEY_PASSWORD, "");
  wifiPrefs.end();

  return storedSsid.length() > 0;
}

void saveWifiCredentials(const String& ssid, const String& password) {
  wifiPrefs.begin(NVS_NAMESPACE, false);
  wifiPrefs.putString(NVS_KEY_SSID, ssid);
  wifiPrefs.putString(NVS_KEY_PASSWORD, password);
  wifiPrefs.end();

  storedSsid = ssid;
  storedPassword = password;

  // The SSID is echoed because it helps a user confirm they picked the right
  // network. The password never is, on a console anyone can attach to.
  Serial.print("[PROV] Saved credentials for SSID: ");
  Serial.println(ssid);
}

void clearWifiCredentials() {
  wifiPrefs.begin(NVS_NAMESPACE, false);
  wifiPrefs.remove(NVS_KEY_SSID);
  wifiPrefs.remove(NVS_KEY_PASSWORD);
  wifiPrefs.end();

  storedSsid = "";
  storedPassword = "";

  Serial.println("[PROV] Cleared stored Wi-Fi credentials.");
}

const String& provisionedSsid() { return storedSsid; }
const String& provisionedPassword() { return storedPassword; }

// ---------------------------------------------------------------------------
// Portal identity
// ---------------------------------------------------------------------------

/** `WattWise-Hub-A4C1` - the suffix makes two units distinguishable in a list. */
String provisioningApName() {
  uint8_t mac[6];
  WiFi.macAddress(mac);

  char suffix[5];
  snprintf(suffix, sizeof(suffix), "%02X%02X", mac[4], mac[5]);

  return String("WattWise-Hub-") + suffix;
}

// ---------------------------------------------------------------------------
// Portal pages
// ---------------------------------------------------------------------------

/*
 * Green/white/yellow, matching the app and the website. Inlined and minimal on
 * purpose: every byte here is flash, and the sketch was already at 81% before
 * provisioning existed.
 */
static const char PORTAL_STYLE[] PROGMEM =
  "<style>"
  "*{box-sizing:border-box}"
  "body{margin:0;padding:24px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;"
  "background:#F9FAFB;color:#111827}"
  ".c{max-width:420px;margin:0 auto;background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:20px}"
  "h1{margin:0 0 4px;font-size:20px}"
  ".s{margin:0 0 18px;font-size:13px;color:#6B7280}"
  "label{display:block;font-size:13px;font-weight:600;margin:14px 0 6px}"
  "select,input{width:100%;padding:11px;font-size:15px;border:1px solid #E5E7EB;"
  "border-radius:8px;background:#fff;color:#111827}"
  "button{width:100%;margin-top:18px;padding:13px;font-size:15px;font-weight:700;color:#fff;"
  "background:#10B981;border:0;border-radius:10px}"
  ".n{margin-top:16px;padding:10px 12px;background:#FEF3C7;border-radius:8px;font-size:12px;line-height:1.5}"
  ".r{margin-top:8px;font-size:12px}.r a{color:#059669}"
  "</style>";

// Scan results are cached as ready-made <option> markup. Rebuilding them per
// request would mean a 2-4s blocking scan on every hit - and a phone fires
// several captive-portal probes the moment it joins, so the portal would feel
// broken exactly when first impressions are formed.
static String cachedNetworkOptions;

void refreshNetworkScan() {
  // Scanning in AP_STA keeps the portal reachable while the radio scans; a plain
  // AP mode scan would drop the phone that is trying to configure the Hub.
  const int found = WiFi.scanNetworks(false, false);

  cachedNetworkOptions = "";

  if (found <= 0) {
    cachedNetworkOptions += F("<option value=''>No networks found - tap Rescan</option>");
  } else {
    for (int i = 0; i < found && i < 15; i++) {
      const String ssid = WiFi.SSID(i);
      if (ssid.length() == 0) continue;

      cachedNetworkOptions += F("<option value='");
      cachedNetworkOptions += ssid;
      cachedNetworkOptions += F("'>");
      cachedNetworkOptions += ssid;
      cachedNetworkOptions += F(" (");
      cachedNetworkOptions += WiFi.RSSI(i);
      cachedNetworkOptions += F(" dBm)</option>");
    }
  }

  WiFi.scanDelete();

  Serial.print("[PROV] Scan complete, networks found: ");
  Serial.println(found < 0 ? 0 : found);
}

void handlePortalRoot() {
  String page;
  page.reserve(3000);
  page += F("<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<title>WattWise Hub setup</title>");
  page += FPSTR(PORTAL_STYLE);
  page += F("</head><body><div class='c'>"
            "<h1>WattWise Hub</h1>"
            "<p class='s'>Choose the Wi-Fi network this Hub should use.</p>"
            "<form method='POST' action='/save'>"
            "<label for='ssid'>Network</label><select id='ssid' name='ssid'>");

  page += cachedNetworkOptions;

  page += F("</select>"
            "<div class='r'><a href='/rescan'>Rescan networks</a></div>"
            "<label for='hidden'>Or type a hidden network name</label>"
            "<input id='hidden' name='hidden' placeholder='Leave blank to use the list above'>"
            "<label for='pass'>Password</label>"
            "<input id='pass' name='pass' type='password' placeholder='Network password'>"
            "<button type='submit'>Save and connect</button>"
            "</form>"
            "<div class='n'>The Hub restarts after saving and joins your network. "
            "To change it later, hold the BOOT button for 5 seconds.</div>"
            "</div></body></html>");

  portalServer.send(200, "text/html", page);
}

void handlePortalSave() {
  String ssid = portalServer.arg("hidden");
  ssid.trim();
  if (ssid.length() == 0) ssid = portalServer.arg("ssid");

  const String password = portalServer.arg("pass");

  if (ssid.length() == 0) {
    portalServer.send(400, "text/html",
      F("<!DOCTYPE html><html><body style='font-family:sans-serif;padding:24px'>"
        "<h2>Pick a network</h2><p>Go back and choose or type a network name.</p>"
        "</body></html>"));
    return;
  }

  saveWifiCredentials(ssid, password);

  String page;
  page += F("<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<title>Saved</title>");
  page += FPSTR(PORTAL_STYLE);
  page += F("</head><body><div class='c'><h1>Saved</h1>"
            "<p class='s'>The Hub is restarting and will join <b>");
  page += ssid;
  page += F("</b>.</p><div class='n'>This setup network is closing. Reconnect your phone "
            "to your normal Wi-Fi.</div></div></body></html>");

  portalServer.send(200, "text/html", page);

  // Let the browser actually receive the page before the radio drops.
  delay(1200);
  Serial.println("[PROV] Credentials stored. Restarting.");
  ESP.restart();
}

void handlePortalRescan() {
  refreshNetworkScan();
  portalServer.sendHeader("Location", "/", true);
  portalServer.send(302, "text/plain", "");
}

/*
 * Captive-portal probe handler. Phones request a known URL on join (iOS
 * /hotspot-detect.html, Android /generate_204) and show the "Sign in to network"
 * sheet when the reply is not what they expected. A 302 to the portal both
 * triggers that sheet and keeps probes cheap - serving the whole page to every
 * background probe would be wasted work on a device with 199 KB of flash spare.
 */
void handlePortalNotFound() {
  portalServer.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
  portalServer.send(302, "text/plain", "");
}

// ---------------------------------------------------------------------------
// Portal lifecycle
// ---------------------------------------------------------------------------

/** Blocks until credentials are saved (which reboots) or the window expires. */
void runProvisioningPortal(const char* apPassword) {
  const String apName = provisioningApName();

  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(apName.c_str(), apPassword);
  delay(300);

  const IPAddress apIp = WiFi.softAPIP();

  Serial.println();
  Serial.println("[PROV] ---------------------------------------------");
  Serial.print("[PROV] No stored Wi-Fi. Setup network: ");
  Serial.println(apName);
  Serial.print("[PROV] Open http://");
  Serial.println(apIp);
  Serial.println("[PROV] AP password is on the unit sticker.");
  Serial.println("[PROV] ---------------------------------------------");

  // Scanned once up front so the first page load is instant.
  refreshNetworkScan();

  portalDns.start(53, "*", apIp);

  portalServer.on("/", handlePortalRoot);
  portalServer.on("/rescan", handlePortalRescan);
  portalServer.on("/save", HTTP_POST, handlePortalSave);
  portalServer.onNotFound(handlePortalNotFound);
  portalServer.begin();

  const unsigned long startedAtMs = millis();

  while (millis() - startedAtMs < PORTAL_TIMEOUT_MS) {
    portalDns.processNextRequest();
    portalServer.handleClient();
    delay(2);
  }

  Serial.println("[PROV] Portal timed out. Restarting.");
  ESP.restart();
}

// ---------------------------------------------------------------------------
// Factory reset button
// ---------------------------------------------------------------------------

void beginFactoryResetButton() {
  // INPUT_PULLUP: the button shorts GPIO0 to ground, so pressed reads LOW.
  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);
}

/**
 * Call once per loop. Holding BOOT for five seconds wipes stored credentials
 * and reboots into the portal.
 *
 * Five seconds rather than a tap: GPIO0 is the flash-mode pin, so it gets
 * pressed during normal flashing, and a short press must never be destructive.
 */
void pollFactoryResetButton() {
  static unsigned long pressedAtMs = 0;
  static bool announced = false;

  if (digitalRead(BOOT_BUTTON_PIN) == LOW) {
    if (pressedAtMs == 0) {
      pressedAtMs = millis();
      announced = false;
      return;
    }

    const unsigned long heldMs = millis() - pressedAtMs;

    if (!announced && heldMs >= 1000) {
      Serial.println("[PROV] BOOT held - keep holding to clear Wi-Fi settings.");
      announced = true;
    }

    if (heldMs >= FACTORY_RESET_HOLD_MS) {
      Serial.println("[PROV] Factory reset: clearing Wi-Fi and restarting.");
      clearWifiCredentials();
      delay(200);
      ESP.restart();
    }
    return;
  }

  pressedAtMs = 0;
  announced = false;
}
