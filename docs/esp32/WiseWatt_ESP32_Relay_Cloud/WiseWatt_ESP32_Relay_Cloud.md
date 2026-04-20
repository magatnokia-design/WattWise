#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>
#include <time.h>
#include <sys/time.h>

// ---------------------------
// USER CONFIGURATION
// ---------------------------
static const char* WIFI_SSID = "KIANO2.4G";
static const char* WIFI_PASSWORD = "Nokiamagat@22";

static const char* DEVICE_ID = "ESP32_ROOM_A";
static const char* DEVICE_TOKEN = "N8m3X2pQ7vL4kR1sT9yW6aB3cD5eF0gH";

static const char* ENDPOINT_UPDATE_METRICS = "https://asia-southeast1-wattwise-fe394.cloudfunctions.net/updateOutletMetrics";
static const char* ENDPOINT_GET_COMMAND = "https://asia-southeast1-wattwise-fe394.cloudfunctions.net/getDeviceCommand";
static const char* ENDPOINT_ACK_COMMAND = "https://asia-southeast1-wattwise-fe394.cloudfunctions.net/ackDeviceCommand";

// Relay wiring (active LOW)
static const int RELAY_1_PIN = 23; // CH1
static const int RELAY_2_PIN = 22; // CH2

// PZEM UART wiring (one PZEM per outlet)
// PZEM1 => Outlet 1 monitoring
static const int PZEM_1_RX_PIN = 16; // ESP32 RX from PZEM1 TX
static const int PZEM_1_TX_PIN = 17; // ESP32 TX to   PZEM1 RX
// PZEM2 => Outlet 2 monitoring
static const int PZEM_2_RX_PIN = 26; // ESP32 RX from PZEM2 TX
static const int PZEM_2_TX_PIN = 27; // ESP32 TX to   PZEM2 RX

// Timing
static const unsigned long COMMAND_POLL_INTERVAL_ACTIVE_MS = 700;
static const unsigned long COMMAND_POLL_INTERVAL_IDLE_MS = 3000;
static const unsigned long METRICS_INTERVAL_ACTIVE_MS = 2000;
static const unsigned long METRICS_INTERVAL_IDLE_MS = 20000;
static const unsigned long ACTIVE_BURST_WINDOW_MS = 20000;
static const unsigned long ACK_RETRY_INTERVAL_MS = 2000;
static const uint8_t MAX_ACK_RETRIES = 5;
static const unsigned long PZEM_WARNING_INTERVAL_MS = 10000;
static const uint8_t HTTP_MAX_RETRIES = 2;
static const unsigned long HTTP_RETRY_DELAY_MS = 300;
static const unsigned long TIME_SYNC_RETRY_INTERVAL_MS = 60000;
static const uint8_t NTP_SYNC_MAX_RETRIES = 10;

// Controller metadata
static const char* FIRMWARE_VERSION = "relay-cloud-dualpzem-1.1.0";

bool relay1On = false;
bool relay2On = false;
bool simulatedTelemetryEnabled = false;

unsigned long lastCommandPollAtMs = 0;
unsigned long lastMetricsAtMs = 0;
unsigned long activeBurstUntilMs = 0;
unsigned long lastAckRetryAtMs = 0;
unsigned long lastPzem1WarnAtMs = 0;
unsigned long lastPzem2WarnAtMs = 0;
unsigned long lastSimEnergyUpdateAtMs = 0;
unsigned long lastTimeSyncAttemptAtMs = 0;

bool pzem1PreviouslyReachable = true;
bool pzem2PreviouslyReachable = true;

float simulatedEnergyKwh1 = 0.0f;
float simulatedEnergyKwh2 = 0.0f;

String lastSeenCommandId = "";
String pendingAckCommandId = "";
String pendingAckStatus = "";
String pendingAckDetails = "";
uint8_t pendingAckRetryCount = 0;

HardwareSerial pzemSerial1(2);
HardwareSerial pzemSerial2(1);
PZEM004Tv30 pzem1(pzemSerial1, PZEM_1_RX_PIN, PZEM_1_TX_PIN);
PZEM004Tv30 pzem2(pzemSerial2, PZEM_2_RX_PIN, PZEM_2_TX_PIN);

struct OutletTelemetry {
  float voltage;
  float current;
  float power;
  float energy;
  bool meterReachable;
};

void sendTelemetry();
void processSerialConsole();
void handleSerialCommand(const String& rawCommand);
void printControllerStatus();
void updateSimulatedEnergy();
OutletTelemetry readOrSimulateOutletTelemetry(uint8_t outletNumber);
bool syncTimeFromHttpsFallback();

float sanitizeMetric(float value) {
  if (isnan(value) || isinf(value) || value < 0.0f) {
    return 0.0f;
  }
  return value;
}

OutletTelemetry readOutletTelemetry(uint8_t outletNumber) {
  PZEM004Tv30* meter = (outletNumber == 1) ? &pzem1 : &pzem2;

  float voltage = meter->voltage();
  float current = meter->current();
  float power = meter->power();
  float energy = meter->energy();

  bool meterReachable = !(isnan(voltage) && isnan(current) && isnan(power) && isnan(energy));

  OutletTelemetry telemetry;
  telemetry.voltage = sanitizeMetric(voltage);
  telemetry.current = sanitizeMetric(current);
  telemetry.power = sanitizeMetric(power);
  telemetry.energy = sanitizeMetric(energy);
  telemetry.meterReachable = meterReachable;

  return telemetry;
}

void updateSimulatedEnergy() {
  if (!simulatedTelemetryEnabled) {
    lastSimEnergyUpdateAtMs = millis();
    return;
  }

  unsigned long nowMs = millis();
  if (lastSimEnergyUpdateAtMs == 0) {
    lastSimEnergyUpdateAtMs = nowMs;
    return;
  }

  float deltaHours = (nowMs - lastSimEnergyUpdateAtMs) / 3600000.0f;
  lastSimEnergyUpdateAtMs = nowMs;

  if (relay1On) {
    const float simulatedPowerW1 = 72.0f;
    simulatedEnergyKwh1 += (simulatedPowerW1 * deltaHours) / 1000.0f;
  }
  if (relay2On) {
    const float simulatedPowerW2 = 95.0f;
    simulatedEnergyKwh2 += (simulatedPowerW2 * deltaHours) / 1000.0f;
  }
}

OutletTelemetry readOrSimulateOutletTelemetry(uint8_t outletNumber) {
  if (!simulatedTelemetryEnabled) {
    return readOutletTelemetry(outletNumber);
  }

  OutletTelemetry telemetry;
  bool outletOn = (outletNumber == 1) ? relay1On : relay2On;
  telemetry.voltage = outletOn ? 229.8f : 0.0f;
  telemetry.power = outletOn ? ((outletNumber == 1) ? 72.0f : 95.0f) : 0.0f;
  telemetry.current = outletOn ? (telemetry.power / 229.8f) : 0.0f;
  telemetry.energy = (outletNumber == 1) ? simulatedEnergyKwh1 : simulatedEnergyKwh2;
  telemetry.meterReachable = true;
  return telemetry;
}

void printControllerStatus() {
  Serial.print("[STATUS] FW=");
  Serial.print(FIRMWARE_VERSION);
  Serial.print("  WiFi=");
  Serial.print(WiFi.status() == WL_CONNECTED ? "connected" : "disconnected");
  Serial.print("  Relay1=");
  Serial.print(relay1On ? "ON" : "OFF");
  Serial.print("  Relay2=");
  Serial.print(relay2On ? "ON" : "OFF");
  Serial.print("  TelemetryMode=");
  Serial.println(simulatedTelemetryEnabled ? "SIMULATED" : "PZEM");
}

void handleSerialCommand(const String& rawCommand) {
  String command = rawCommand;
  command.trim();
  command.toLowerCase();
  if (command.length() == 0) return;

  if (command == "help") {
    Serial.println("[CMD] help | status | telemetry | relay1 on|off | relay2 on|off | sim on|off");
    return;
  }

  if (command == "status") {
    printControllerStatus();
    return;
  }

  if (command == "telemetry") {
    sendTelemetry();
    return;
  }

  if (command == "relay1 on") {
    applyRelayState(1, true);
    return;
  }
  if (command == "relay1 off") {
    applyRelayState(1, false);
    return;
  }
  if (command == "relay2 on") {
    applyRelayState(2, true);
    return;
  }
  if (command == "relay2 off") {
    applyRelayState(2, false);
    return;
  }

  if (command == "sim on") {
    simulatedTelemetryEnabled = true;
    lastSimEnergyUpdateAtMs = millis();
    Serial.println("[SIM] Enabled simulated telemetry mode.");
    printControllerStatus();
    return;
  }
  if (command == "sim off") {
    simulatedTelemetryEnabled = false;
    Serial.println("[SIM] Disabled simulated telemetry mode (using real PZEM readings).");
    printControllerStatus();
    return;
  }

  Serial.print("[CMD] Unknown command: ");
  Serial.println(rawCommand);
}

void processSerialConsole() {
  static String commandBuffer = "";

  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (commandBuffer.length() > 0) {
        handleSerialCommand(commandBuffer);
        commandBuffer = "";
      }
    } else {
      commandBuffer += c;
      if (commandBuffer.length() > 80) {
        commandBuffer = "";
        Serial.println("[CMD] Input too long; buffer cleared.");
      }
    }
  }
}

unsigned long long nowEpochMs() {
  time_t nowSec = time(nullptr);
  return (unsigned long long)nowSec * 1000ULL;
}

bool hasValidTime() {
  return time(nullptr) > 1700000000;
}

bool syncTimeFromHttpsFallback() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  if (!https.begin(client, "https://worldtimeapi.org/api/timezone/Etc/UTC")) {
    Serial.println("[TIME] HTTPS fallback begin() failed.");
    return false;
  }

  https.setTimeout(12000);
  int statusCode = https.GET();
  if (statusCode < 200 || statusCode >= 300) {
    Serial.print("[TIME] HTTPS fallback HTTP ");
    Serial.println(statusCode);
    https.end();
    return false;
  }

  String response = https.getString();
  https.end();

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, response);
  if (err) {
    Serial.print("[TIME] HTTPS fallback JSON parse failed: ");
    Serial.println(err.c_str());
    return false;
  }

  long long unixSeconds = doc["unixtime"] | 0;
  if (unixSeconds < 1700000000LL) {
    Serial.println("[TIME] HTTPS fallback unixtime invalid.");
    return false;
  }

  struct timeval tv;
  tv.tv_sec = (time_t)unixSeconds;
  tv.tv_usec = 0;
  settimeofday(&tv, nullptr);

  if (hasValidTime()) {
    Serial.println("[TIME] HTTPS fallback sync OK");
    return true;
  }

  Serial.println("[TIME] HTTPS fallback applied but time still invalid.");
  return false;
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("[WiFi] Connecting");
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 60) {
    delay(500);
    Serial.print(".");
    retries++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WiFi] Failed to connect");
  }
}

void syncTime() {
  unsigned long nowMs = millis();
  if (lastTimeSyncAttemptAtMs != 0 && (nowMs - lastTimeSyncAttemptAtMs) < TIME_SYNC_RETRY_INTERVAL_MS) {
    return;
  }
  lastTimeSyncAttemptAtMs = nowMs;

  configTime(8 * 3600, 0, "pool.ntp.org", "time.google.com");
  Serial.print("[NTP] Syncing time");

  int retries = 0;
  while (!hasValidTime() && retries < NTP_SYNC_MAX_RETRIES) {
    delay(500);
    Serial.print(".");
    retries++;
  }
  Serial.println();

  if (hasValidTime()) {
    Serial.println("[NTP] Time sync OK");
  } else {
    Serial.println("[NTP] Time sync failed. Trying HTTPS fallback...");
    if (!syncTimeFromHttpsFallback()) {
      Serial.println("[NTP] Time sync failed. Cloud requests may be rejected.");
    }
  }
}

bool postJson(const char* url, const String& payload, int& statusCode, String& responseBody) {
  statusCode = 0;
  responseBody = "";

  for (uint8_t attempt = 1; attempt <= HTTP_MAX_RETRIES; attempt++) {
    if (WiFi.status() != WL_CONNECTED) {
      connectWiFi();
      if (WiFi.status() != WL_CONNECTED) {
        statusCode = -1000;
        if (attempt < HTTP_MAX_RETRIES) {
          delay(HTTP_RETRY_DELAY_MS);
          continue;
        }
        return false;
      }
    }

    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient https;
    if (!https.begin(client, url)) {
      statusCode = -1001;
      if (attempt < HTTP_MAX_RETRIES) {
        delay(HTTP_RETRY_DELAY_MS);
        continue;
      }
      return false;
    }

    // Cloud Functions can occasionally cold-start; allow a longer response window.
    https.setTimeout(20000);

    https.addHeader("Content-Type", "application/json");
    https.addHeader("x-device-token", DEVICE_TOKEN);

    statusCode = https.POST(payload);
    responseBody = https.getString();
    https.end();

    if (statusCode > 0) {
      return true;
    }

    Serial.print("[HTTP] POST transport error code=");
    Serial.print(statusCode);
    Serial.print(" (");
    if (statusCode == -1000) {
      Serial.print("wifi_not_connected");
    } else if (statusCode == -1001) {
      Serial.print("https_begin_failed");
    } else {
      Serial.print(HTTPClient::errorToString(statusCode));
    }
    Serial.print(") attempt ");
    Serial.print(attempt);
    Serial.print("/");
    Serial.println(HTTP_MAX_RETRIES);

    if (attempt < HTTP_MAX_RETRIES) {
      delay(HTTP_RETRY_DELAY_MS);
    }
  }

  return false;
}

void applyRelayState(uint8_t outletNumber, bool turnOn) {
  int pin = (outletNumber == 1) ? RELAY_1_PIN : RELAY_2_PIN;

  // Active LOW relay: LOW = ON, HIGH = OFF
  digitalWrite(pin, turnOn ? LOW : HIGH);

  if (outletNumber == 1) {
    relay1On = turnOn;
  } else {
    relay2On = turnOn;
  }

  activeBurstUntilMs = millis() + ACTIVE_BURST_WINDOW_MS;

  Serial.print("[Relay] outlet");
  Serial.print(outletNumber);
  Serial.print(" => ");
  Serial.println(turnOn ? "ON" : "OFF");
}

bool sendCommandAck(const String& commandId, const char* status, const char* details) {
  if (!hasValidTime()) {
    syncTime();
    if (!hasValidTime()) return false;
  }

  StaticJsonDocument<384> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["timestamp"] = nowEpochMs();
  doc["commandId"] = commandId;
  doc["status"] = status;
  doc["details"] = details;

  String payload;
  serializeJson(doc, payload);

  int statusCode = 0;
  String response;
  bool ok = postJson(ENDPOINT_ACK_COMMAND, payload, statusCode, response);

  Serial.print("[ACK] HTTP ");
  Serial.println(statusCode);
  if (!ok) {
    Serial.println("[ACK] Request failed");
    return false;
  }

  if (statusCode >= 200 && statusCode < 300) {
    Serial.println("[ACK] Success");
    return true;
  }

  Serial.print("[ACK] Error body: ");
  Serial.println(response);
  return false;
}

void queuePendingAck(const String& commandId, const char* status, const char* details) {
  pendingAckCommandId = commandId;
  pendingAckStatus = String(status);
  pendingAckDetails = String(details);
  pendingAckRetryCount = 0;
  lastAckRetryAtMs = 0;
}

void flushPendingAckIfNeeded() {
  if (pendingAckCommandId.length() == 0) {
    return;
  }

  unsigned long nowMs = millis();
  if (lastAckRetryAtMs != 0 && (nowMs - lastAckRetryAtMs) < ACK_RETRY_INTERVAL_MS) {
    return;
  }

  lastAckRetryAtMs = nowMs;

  bool ok = sendCommandAck(
    pendingAckCommandId,
    pendingAckStatus.c_str(),
    pendingAckDetails.c_str()
  );

  if (ok) {
    pendingAckCommandId = "";
    pendingAckStatus = "";
    pendingAckDetails = "";
    pendingAckRetryCount = 0;
    return;
  }

  pendingAckRetryCount++;
  if (pendingAckRetryCount >= MAX_ACK_RETRIES) {
    Serial.print("[ACK] Dropping pending ack after retries for command: ");
    Serial.println(pendingAckCommandId);
    pendingAckCommandId = "";
    pendingAckStatus = "";
    pendingAckDetails = "";
    pendingAckRetryCount = 0;
  }
}

void executeCommand(const String& commandId, const String& action, const String& outletId) {
  if (commandId.length() == 0 || action.length() == 0 || outletId.length() == 0) {
    sendCommandAck(commandId, "rejected", "Invalid command payload");
    return;
  }

  uint8_t outletNumber = 0;
  if (outletId == "outlet1") outletNumber = 1;
  if (outletId == "outlet2") outletNumber = 2;

  if (outletNumber == 0) {
    sendCommandAck(commandId, "rejected", "Unknown outletId");
    return;
  }

  bool turnOn = (action == "on");
  applyRelayState(outletNumber, turnOn);

  // Push a status update immediately so app UI reflects relay state faster.
  sendTelemetry();

  // Mark as seen after execution to avoid duplicate relay toggles on polling.
  lastSeenCommandId = commandId;

  bool acked = sendCommandAck(commandId, "executed", "Relay switched");
  if (!acked) {
    queuePendingAck(commandId, "executed", "Relay switched");
  }
}

void pollLatestCommand() {
  if (!hasValidTime()) {
    syncTime();
    if (!hasValidTime()) return;
  }

  StaticJsonDocument<320> req;
  req["deviceId"] = DEVICE_ID;
  req["timestamp"] = nowEpochMs();
  req["lastCommandId"] = lastSeenCommandId;

  String payload;
  serializeJson(req, payload);

  int statusCode = 0;
  String response;
  bool ok = postJson(ENDPOINT_GET_COMMAND, payload, statusCode, response);
  if (!ok) {
    Serial.print("[CMD] Poll failed code=");
    Serial.print(statusCode);
    Serial.print(" (");
    if (statusCode == -1000) {
      Serial.print("wifi_not_connected");
    } else if (statusCode == -1001) {
      Serial.print("https_begin_failed");
    } else {
      Serial.print(HTTPClient::errorToString(statusCode));
    }
    Serial.println(")");
    return;
  }

  if (statusCode < 200 || statusCode >= 300) {
    Serial.print("[CMD] HTTP ");
    Serial.println(statusCode);
    Serial.println(response);
    return;
  }

  StaticJsonDocument<1024> doc;
  DeserializationError err = deserializeJson(doc, response);
  if (err) {
    Serial.print("[CMD] JSON parse failed: ");
    Serial.println(err.c_str());
    return;
  }

  bool hasCommand = doc["hasCommand"] | false;
  if (!hasCommand) return;

  const char* commandId = doc["command"]["commandId"] | "";
  const char* action = doc["command"]["action"] | "";
  const char* outletId = doc["command"]["outletId"] | "";

  String commandIdStr = String(commandId);
  if (commandIdStr.length() == 0) return;

  if (commandIdStr == lastSeenCommandId) {
    // Already executed and acknowledged.
    return;
  }

  Serial.print("[CMD] Received command: ");
  Serial.println(commandIdStr);

  executeCommand(commandIdStr, String(action), String(outletId));
}

void sendTelemetry() {
  updateSimulatedEnergy();

  if (!hasValidTime()) {
    syncTime();
    if (!hasValidTime()) return;
  }

  OutletTelemetry outlet1Telemetry = readOrSimulateOutletTelemetry(1);
  OutletTelemetry outlet2Telemetry = readOrSimulateOutletTelemetry(2);

  if (!simulatedTelemetryEnabled && !outlet1Telemetry.meterReachable) {
    unsigned long nowMs = millis();
    if (pzem1PreviouslyReachable || (nowMs - lastPzem1WarnAtMs >= PZEM_WARNING_INTERVAL_MS)) {
      Serial.println("[PZEM1] Read failed (check AC L/N + VCC/GND + RX/TX)");
      lastPzem1WarnAtMs = nowMs;
    }
    pzem1PreviouslyReachable = false;
  } else {
    if (!pzem1PreviouslyReachable && !simulatedTelemetryEnabled) {
      Serial.println("[PZEM1] Reading restored.");
    }
    pzem1PreviouslyReachable = true;
  }

  if (!simulatedTelemetryEnabled && !outlet2Telemetry.meterReachable) {
    unsigned long nowMs = millis();
    if (pzem2PreviouslyReachable || (nowMs - lastPzem2WarnAtMs >= PZEM_WARNING_INTERVAL_MS)) {
      Serial.println("[PZEM2] Read failed (check AC L/N + VCC/GND + RX/TX)");
      lastPzem2WarnAtMs = nowMs;
    }
    pzem2PreviouslyReachable = false;
  } else {
    if (!pzem2PreviouslyReachable && !simulatedTelemetryEnabled) {
      Serial.println("[PZEM2] Reading restored.");
    }
    pzem2PreviouslyReachable = true;
  }

  StaticJsonDocument<700> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["timestamp"] = nowEpochMs();

  JsonArray outlets = doc.createNestedArray("outlets");

  JsonObject outlet1 = outlets.createNestedObject();
  outlet1["number"] = 1;
  outlet1["voltage"] = outlet1Telemetry.voltage;
  outlet1["current"] = outlet1Telemetry.current;
  outlet1["power"] = outlet1Telemetry.power;
  outlet1["energy"] = outlet1Telemetry.energy;
  outlet1["status"] = relay1On ? "on" : "off";

  JsonObject outlet2 = outlets.createNestedObject();
  outlet2["number"] = 2;
  outlet2["voltage"] = outlet2Telemetry.voltage;
  outlet2["current"] = outlet2Telemetry.current;
  outlet2["power"] = outlet2Telemetry.power;
  outlet2["energy"] = outlet2Telemetry.energy;
  outlet2["status"] = relay2On ? "on" : "off";

  String payload;
  serializeJson(doc, payload);

  int statusCode = 0;
  String response;
  bool ok = postJson(ENDPOINT_UPDATE_METRICS, payload, statusCode, response);

  Serial.print("[METRICS] HTTP ");
  Serial.println(statusCode);
  if (!ok) {
    Serial.print("[METRICS] Request failed code=");
    Serial.print(statusCode);
    Serial.print(" (");
    if (statusCode == -1000) {
      Serial.print("wifi_not_connected");
    } else if (statusCode == -1001) {
      Serial.print("https_begin_failed");
    } else {
      Serial.print(HTTPClient::errorToString(statusCode));
    }
    Serial.println(")");
    return;
  }

  if (statusCode < 200 || statusCode >= 300) {
    Serial.print("[METRICS] Error body: ");
    Serial.println(response);
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);

  Serial.println();
  Serial.println("========================================");
  Serial.println("WiseWatt ESP32 Controller Boot");
  Serial.print("Firmware: ");
  Serial.println(FIRMWARE_VERSION);
  Serial.println("Serial commands: help");
  Serial.println("========================================");

  pinMode(RELAY_1_PIN, OUTPUT);
  pinMode(RELAY_2_PIN, OUTPUT);

  // Default OFF for active LOW relay board.
  digitalWrite(RELAY_1_PIN, HIGH);
  digitalWrite(RELAY_2_PIN, HIGH);

  relay1On = false;
  relay2On = false;

  connectWiFi();
  syncTime();
  printControllerStatus();

  // Send initial telemetry immediately.
  sendTelemetry();
  lastMetricsAtMs = millis();
}

void loop() {
  processSerialConsole();

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    delay(250);
    return;
  }

  unsigned long nowMs = millis();

  unsigned long currentCommandPollInterval = (nowMs < activeBurstUntilMs)
    ? COMMAND_POLL_INTERVAL_ACTIVE_MS
    : COMMAND_POLL_INTERVAL_IDLE_MS;

  if (nowMs - lastCommandPollAtMs >= currentCommandPollInterval) {
    pollLatestCommand();
    lastCommandPollAtMs = nowMs;
  }

  flushPendingAckIfNeeded();

  unsigned long currentMetricsInterval = (nowMs < activeBurstUntilMs)
    ? METRICS_INTERVAL_ACTIVE_MS
    : METRICS_INTERVAL_IDLE_MS;

  if (nowMs - lastMetricsAtMs >= currentMetricsInterval) {
    sendTelemetry();
    lastMetricsAtMs = nowMs;
  }

  delay(20);
}
