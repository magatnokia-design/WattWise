#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>
#include <time.h>
#include <sys/time.h>
#include <ctype.h>
#include <esp_system.h>

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
static const char* HTTPS_TIME_FALLBACK_URL = "https://worldtimeapi.org/api/timezone/Etc/UTC";
static const char* HTTPS_DATE_FALLBACK_GOOGLE = "https://www.google.com/generate_204";
static const char* HOST_WORLDTIMEAPI = "worldtimeapi.org";
static const char* HOST_GOOGLE = "www.google.com";
static const char* HOST_CLOUD_FUNCTIONS = "asia-southeast1-wattwise-fe394.cloudfunctions.net";
static const char* NTP_FALLBACK_IP_1 = "162.159.200.1";   // Cloudflare time
static const char* NTP_FALLBACK_IP_2 = "162.159.200.123"; // Cloudflare time
static const char* NTP_FALLBACK_IP_3 = "216.239.35.0";    // Google time
static const char* HTTP_DATE_FALLBACK_IP_PRIMARY = "http://1.1.1.1/cdn-cgi/trace";
static const char* HTTP_DATE_FALLBACK_IP_SECONDARY = "http://1.0.0.1/cdn-cgi/trace";

// Relay wiring (active LOW)
static const int RELAY_CH1_PIN = 23; // Physical channel 1
static const int RELAY_CH2_PIN = 22; // Physical channel 2

// Logical outlet -> physical relay mapping.
// Keep labels one-to-one: outlet1->relay CH1, outlet2->relay CH2.
static const int OUTLET_1_RELAY_PIN = RELAY_CH1_PIN;
static const int OUTLET_2_RELAY_PIN = RELAY_CH2_PIN;

// PZEM UART wiring (one PZEM per outlet)
// PZEM1 => Outlet 1 monitoring
static const int PZEM_1_RX_PIN = 16; // ESP32 RX from PZEM1 TX
static const int PZEM_1_TX_PIN = 17; // ESP32 TX to   PZEM1 RX
// PZEM2 => Outlet 2 monitoring
static const int PZEM_2_RX_PIN = 26; // ESP32 RX from PZEM2 TX
static const int PZEM_2_TX_PIN = 27; // ESP32 TX to   PZEM2 RX
static const uint32_t PZEM_UART_BAUD = 9600;

// Logical outlet -> PZEM channel mapping.
// Sensor wiring is crossed on this build, so map logical outlets to the
// opposite PZEM channels to keep dashboard readings aligned with outlet labels.
static const uint8_t OUTLET_1_PZEM_CHANNEL = 2;
static const uint8_t OUTLET_2_PZEM_CHANNEL = 1;

// Timing
static const unsigned long COMMAND_POLL_INTERVAL_ACTIVE_MS = 400;
static const unsigned long COMMAND_POLL_INTERVAL_IDLE_MS = 1200;
static const unsigned long METRICS_INTERVAL_ACTIVE_MS = 1500;
static const unsigned long METRICS_INTERVAL_IDLE_MS = 5000;
static const unsigned long ACTIVE_BURST_WINDOW_MS = 20000;
static const unsigned long ACK_RETRY_INTERVAL_MS = 2000;
static const uint8_t MAX_ACK_RETRIES = 5;
static const unsigned long PZEM_WARNING_INTERVAL_MS = 10000;
static const uint8_t HTTP_MAX_RETRIES = 2;
static const unsigned long HTTP_RETRY_DELAY_MS = 300;
static const uint16_t HTTP_TIMEOUT_COMMAND_MS = 7000;
static const uint16_t HTTP_TIMEOUT_ACK_MS = 7000;
static const uint16_t HTTP_TIMEOUT_METRICS_MS = 12000;
static const unsigned long TIME_SYNC_RETRY_INTERVAL_MS = 60000;
static const uint8_t NTP_SYNC_MAX_RETRIES = 14;
static const uint8_t TIME_SYNC_RECOVERY_ATTEMPTS = 2;
static const unsigned long COMMAND_BACKOFF_AFTER_ERROR_MS = 2000;
static const unsigned long METRICS_BACKOFF_AFTER_ERROR_MS = 3000;
static const uint16_t METRICS_SUCCESS_LOG_EVERY = 20;
static const float MAX_OUTLET_POWER_W = 500.0f;
static const unsigned long OVERPOWER_GRACE_MS = 3000;
static const float MAX_TOTAL_POWER_W = 1000.0f;
static const unsigned long TOTAL_OVERPOWER_GRACE_MS = 3000;

const IPAddress WIFI_DNS_PRIMARY(1, 1, 1, 1);
const IPAddress WIFI_DNS_SECONDARY(8, 8, 8, 8);

// Controller metadata
static const char* FIRMWARE_VERSION = "relay-cloud-dualpzem-1.2.6";

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

unsigned long commandBackoffUntilMs = 0;
unsigned long metricsBackoffUntilMs = 0;
uint16_t metricsSuccessCount = 0;
unsigned long outlet1OverPowerSinceMs = 0;
unsigned long outlet2OverPowerSinceMs = 0;
unsigned long totalOverPowerSinceMs = 0;

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
void enforceOutletPowerLimit(uint8_t outletNumber, const OutletTelemetry& telemetry, unsigned long nowMs);
void enforceTotalPowerLimit(const OutletTelemetry& outlet1Telemetry, const OutletTelemetry& outlet2Telemetry, unsigned long nowMs);
bool syncTimeFromHttpsFallback();
bool syncTimeFromHttpDate(const char* url, const char* sourceLabel, const char* hostForDns = nullptr);
bool syncTimeFromPlainHttpDate(const char* url, const char* sourceLabel);
bool applyHttpDateHeaderAsSystemTime(const String& httpDate, const char* sourceLabel);
bool applyUnixSecondsAsSystemTime(long long unixSeconds, const char* sourceLabel);
bool resolveOutletMapping(const String& outletId, uint8_t& outletNumber, int& relayPin);
bool postJson(const char* url, const String& payload, int& statusCode, String& responseBody, uint16_t timeoutMs);
int relayPinForOutlet(uint8_t outletNumber);
uint8_t relayChannelForPin(int relayPin);
uint8_t meterChannelForOutlet(uint8_t outletNumber);
PZEM004Tv30* meterForOutlet(uint8_t outletNumber);
bool resolveHostAndLog(const char* host, const char* label, IPAddress& resolvedIp);
void printNetworkDiagnostics();
bool forceReconnectWiFi();
bool applyPreferredDnsAndReconnect();
const char* resetReasonToLabel(esp_reset_reason_t reason);
void printBootResetReason();

const char* resetReasonToLabel(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON:
      return "POWERON";
    case ESP_RST_EXT:
      return "EXTERNAL_PIN";
    case ESP_RST_SW:
      return "SOFTWARE";
    case ESP_RST_PANIC:
      return "PANIC";
    case ESP_RST_INT_WDT:
      return "INT_WDT";
    case ESP_RST_TASK_WDT:
      return "TASK_WDT";
    case ESP_RST_WDT:
      return "OTHER_WDT";
    case ESP_RST_DEEPSLEEP:
      return "DEEPSLEEP";
    case ESP_RST_BROWNOUT:
      return "BROWNOUT";
    case ESP_RST_SDIO:
      return "SDIO";
    default:
      return "UNKNOWN";
  }
}

void printBootResetReason() {
  esp_reset_reason_t reason = esp_reset_reason();
  Serial.print("[BOOT] Reset reason code=");
  Serial.print((int)reason);
  Serial.print(" label=");
  Serial.println(resetReasonToLabel(reason));
}

int relayPinForOutlet(uint8_t outletNumber) {
  return (outletNumber == 1) ? OUTLET_1_RELAY_PIN : OUTLET_2_RELAY_PIN;
}

uint8_t relayChannelForPin(int relayPin) {
  if (relayPin == RELAY_CH1_PIN) return 1;
  if (relayPin == RELAY_CH2_PIN) return 2;
  return 0;
}

uint8_t meterChannelForOutlet(uint8_t outletNumber) {
  return (outletNumber == 1) ? OUTLET_1_PZEM_CHANNEL : OUTLET_2_PZEM_CHANNEL;
}

PZEM004Tv30* meterForOutlet(uint8_t outletNumber) {
  return (meterChannelForOutlet(outletNumber) == 1) ? &pzem1 : &pzem2;
}

bool resolveOutletMapping(const String& outletId, uint8_t& outletNumber, int& relayPin) {
  String normalized = outletId;
  normalized.trim();
  normalized.toLowerCase();

  if (normalized == "outlet1" || normalized == "1") {
    outletNumber = 1;
    relayPin = relayPinForOutlet(1);
    return true;
  }

  if (normalized == "outlet2" || normalized == "2") {
    outletNumber = 2;
    relayPin = relayPinForOutlet(2);
    return true;
  }

  outletNumber = 0;
  relayPin = -1;
  return false;
}

bool resolveHostAndLog(const char* host, const char* label, IPAddress& resolvedIp) {
  if (!host || !label) return false;

  int resolutionStatus = WiFi.hostByName(host, resolvedIp);
  if (resolutionStatus != 1) {
    Serial.print("[NET] DNS failed for ");
    Serial.print(label);
    Serial.print(" host=");
    Serial.println(host);
    return false;
  }

  Serial.print("[NET] DNS ");
  Serial.print(label);
  Serial.print(" => ");
  Serial.println(resolvedIp);
  return true;
}

void printNetworkDiagnostics() {
  Serial.print("[NET] WiFi status=");
  Serial.println(WiFi.status() == WL_CONNECTED ? "connected" : "disconnected");

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  Serial.print("[NET] IP=");
  Serial.println(WiFi.localIP());
  Serial.print("[NET] Gateway=");
  Serial.println(WiFi.gatewayIP());
  Serial.print("[NET] DNS1=");
  Serial.println(WiFi.dnsIP(0));
  Serial.print("[NET] DNS2=");
  Serial.println(WiFi.dnsIP(1));

  IPAddress resolvedIp;
  resolveHostAndLog(HOST_WORLDTIMEAPI, "worldtimeapi", resolvedIp);
  resolveHostAndLog(HOST_GOOGLE, "google", resolvedIp);
  resolveHostAndLog(HOST_CLOUD_FUNCTIONS, "cloudfunctions", resolvedIp);
}

bool forceReconnectWiFi() {
  Serial.println("[WiFi] Reconnecting for time-sync recovery...");
  WiFi.disconnect(false, true);
  delay(300);
  connectWiFi();
  return WiFi.status() == WL_CONNECTED;
}

bool applyPreferredDnsAndReconnect() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  IPAddress localIp = WiFi.localIP();
  IPAddress gatewayIp = WiFi.gatewayIP();
  IPAddress subnetMask = WiFi.subnetMask();

  if ((uint32_t)localIp == 0 || (uint32_t)gatewayIp == 0 || (uint32_t)subnetMask == 0) {
    Serial.println("[WiFi] DNS override skipped (missing IP/gateway/subnet).");
    return false;
  }

  Serial.print("[WiFi] Applying DNS override: ");
  Serial.print(WIFI_DNS_PRIMARY);
  Serial.print(" / ");
  Serial.println(WIFI_DNS_SECONDARY);

  WiFi.disconnect(false, false);
  delay(200);

  bool configured = WiFi.config(localIp, gatewayIp, subnetMask, WIFI_DNS_PRIMARY, WIFI_DNS_SECONDARY);
  if (!configured) {
    Serial.println("[WiFi] DNS override WiFi.config failed.");
    return false;
  }

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Reconnecting with DNS override");

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 40) {
    delay(250);
    Serial.print(".");
    retries++;
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] DNS override reconnect failed.");
    return false;
  }

  Serial.print("[WiFi] DNS override active. DNS1=");
  Serial.print(WiFi.dnsIP(0));
  Serial.print(" DNS2=");
  Serial.println(WiFi.dnsIP(1));
  return true;
}

float sanitizeMetric(float value) {
  if (isnan(value) || isinf(value) || value < 0.0f) {
    return 0.0f;
  }
  return value;
}

OutletTelemetry readOutletTelemetry(uint8_t outletNumber) {
  PZEM004Tv30* meter = meterForOutlet(outletNumber);

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

void enforceOutletPowerLimit(uint8_t outletNumber, const OutletTelemetry& telemetry, unsigned long nowMs) {
  unsigned long* overPowerSince = (outletNumber == 1) ? &outlet1OverPowerSinceMs : &outlet2OverPowerSinceMs;
  bool relayOn = (outletNumber == 1) ? relay1On : relay2On;

  if (!relayOn || !telemetry.meterReachable) {
    *overPowerSince = 0;
    return;
  }

  if (telemetry.power <= MAX_OUTLET_POWER_W) {
    *overPowerSince = 0;
    return;
  }

  if (*overPowerSince == 0) {
    *overPowerSince = nowMs;
    return;
  }

  if (nowMs - *overPowerSince < OVERPOWER_GRACE_MS) {
    return;
  }

  Serial.print("[SAFE] Outlet");
  Serial.print(outletNumber);
  Serial.print(" power ");
  Serial.print(telemetry.power, 1);
  Serial.print("W > ");
  Serial.print(MAX_OUTLET_POWER_W, 1);
  Serial.println("W. Shutting off.");

  *overPowerSince = 0;
  applyRelayState(outletNumber, false);
}

void enforceTotalPowerLimit(const OutletTelemetry& outlet1Telemetry, const OutletTelemetry& outlet2Telemetry, unsigned long nowMs) {
  if (!relay1On && !relay2On) {
    totalOverPowerSinceMs = 0;
    return;
  }

  float totalPower = 0.0f;
  const float outlet1Power = (relay1On && outlet1Telemetry.meterReachable) ? outlet1Telemetry.power : 0.0f;
  const float outlet2Power = (relay2On && outlet2Telemetry.meterReachable) ? outlet2Telemetry.power : 0.0f;
  totalPower = outlet1Power + outlet2Power;

  if (totalPower <= MAX_TOTAL_POWER_W) {
    totalOverPowerSinceMs = 0;
    return;
  }

  if (totalOverPowerSinceMs == 0) {
    totalOverPowerSinceMs = nowMs;
    return;
  }

  if (nowMs - totalOverPowerSinceMs < TOTAL_OVERPOWER_GRACE_MS) {
    return;
  }

  uint8_t outletToCut = 0;
  if (outlet1Power >= outlet2Power && relay1On) {
    outletToCut = 1;
  } else if (relay2On) {
    outletToCut = 2;
  }

  if (outletToCut == 0) {
    totalOverPowerSinceMs = 0;
    return;
  }

  Serial.print("[SAFE] Total power ");
  Serial.print(totalPower, 1);
  Serial.print("W > ");
  Serial.print(MAX_TOTAL_POWER_W, 1);
  Serial.print("W. Shutting off outlet ");
  Serial.println(outletToCut);

  totalOverPowerSinceMs = 0;
  applyRelayState(outletToCut, false);
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

bool applyUnixSecondsAsSystemTime(long long unixSeconds, const char* sourceLabel) {
  if (unixSeconds < 1700000000LL || unixSeconds > 4102444800LL) {
    Serial.print("[TIME] ");
    Serial.print(sourceLabel);
    Serial.println(" returned invalid unix time.");
    return false;
  }

  struct timeval tv;
  tv.tv_sec = (time_t)unixSeconds;
  tv.tv_usec = 0;
  settimeofday(&tv, nullptr);

  if (hasValidTime()) {
    Serial.print("[TIME] ");
    Serial.print(sourceLabel);
    Serial.println(" sync OK");
    return true;
  }

  Serial.print("[TIME] ");
  Serial.print(sourceLabel);
  Serial.println(" applied but time still invalid.");
  return false;
}

int monthAbbrevToIndex(const char* monthAbbrev) {
  if (!monthAbbrev) return -1;

  char normalized[4] = {0, 0, 0, 0};
  for (int i = 0; i < 3; i++) {
    if (!monthAbbrev[i]) return -1;
    normalized[i] = (char)toupper((unsigned char)monthAbbrev[i]);
  }

  static const char* MONTHS[12] = {
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
  };

  for (int i = 0; i < 12; i++) {
    if (strncmp(normalized, MONTHS[i], 3) == 0) {
      return i;
    }
  }

  return -1;
}

bool isLeapYear(int year) {
  return ((year % 4 == 0) && (year % 100 != 0)) || (year % 400 == 0);
}

bool applyHttpDateHeaderAsSystemTime(const String& httpDate, const char* sourceLabel) {
  char weekday[4] = {0};
  char monthAbbrev[4] = {0};
  int day = 0;
  int year = 0;
  int hour = 0;
  int minute = 0;
  int second = 0;

  int matched = sscanf(
    httpDate.c_str(),
    "%3s, %d %3s %d %d:%d:%d GMT",
    weekday,
    &day,
    monthAbbrev,
    &year,
    &hour,
    &minute,
    &second
  );

  if (matched != 7) {
    Serial.print("[TIME] Failed to parse Date header from ");
    Serial.print(sourceLabel);
    Serial.print(": ");
    Serial.println(httpDate);
    return false;
  }

  int monthIndex = monthAbbrevToIndex(monthAbbrev);
  if (monthIndex < 0 || year < 1970 || day < 1 || day > 31 ||
      hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 60) {
    Serial.print("[TIME] Date header out of range from ");
    Serial.print(sourceLabel);
    Serial.print(": ");
    Serial.println(httpDate);
    return false;
  }

  static const int DAYS_IN_MONTH[12] = {
    31, 28, 31, 30, 31, 30,
    31, 31, 30, 31, 30, 31
  };

  int maxDay = DAYS_IN_MONTH[monthIndex];
  if (monthIndex == 1 && isLeapYear(year)) {
    maxDay = 29;
  }
  if (day > maxDay) {
    Serial.print("[TIME] Date header day invalid from ");
    Serial.print(sourceLabel);
    Serial.print(": ");
    Serial.println(httpDate);
    return false;
  }

  long long daysSinceEpoch = 0;
  for (int y = 1970; y < year; y++) {
    daysSinceEpoch += isLeapYear(y) ? 366 : 365;
  }

  for (int m = 0; m < monthIndex; m++) {
    daysSinceEpoch += DAYS_IN_MONTH[m];
    if (m == 1 && isLeapYear(year)) {
      daysSinceEpoch += 1;
    }
  }

  daysSinceEpoch += (day - 1);

  long long unixSeconds =
    (daysSinceEpoch * 86400LL) +
    ((long long)hour * 3600LL) +
    ((long long)minute * 60LL) +
    (long long)second;

  return applyUnixSecondsAsSystemTime(unixSeconds, sourceLabel);
}

bool syncTimeFromHttpDate(const char* url, const char* sourceLabel, const char* hostForDns) {
  if (hostForDns && *hostForDns) {
    IPAddress resolvedIp;
    resolveHostAndLog(hostForDns, sourceLabel, resolvedIp);
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  if (!https.begin(client, url)) {
    Serial.print("[TIME] ");
    Serial.print(sourceLabel);
    Serial.println(" begin() failed.");
    return false;
  }

  const char* headerKeys[] = { "Date" };
  https.collectHeaders(headerKeys, 1);
  https.setTimeout(12000);

  int statusCode = https.GET();
  String dateHeader = https.header("Date");
  https.end();

  if (statusCode <= 0) {
    Serial.print("[TIME] ");
    Serial.print(sourceLabel);
    Serial.print(" HTTP ");
    Serial.println(statusCode);
    Serial.print("[TIME] ");
    Serial.print(sourceLabel);
    Serial.print(" error: ");
    Serial.println(HTTPClient::errorToString(statusCode));
    return false;
  }

  if (dateHeader.length() == 0) {
    Serial.print("[TIME] ");
    Serial.print(sourceLabel);
    Serial.println(" missing Date header.");
    return false;
  }

  return applyHttpDateHeaderAsSystemTime(dateHeader, sourceLabel);
}

bool syncTimeFromPlainHttpDate(const char* url, const char* sourceLabel) {
  HTTPClient http;
  if (!http.begin(url)) {
    Serial.print("[TIME] ");
    Serial.print(sourceLabel);
    Serial.println(" begin() failed.");
    return false;
  }

  const char* headerKeys[] = { "Date" };
  http.collectHeaders(headerKeys, 1);
  http.setTimeout(10000);

  int statusCode = http.GET();
  String dateHeader = http.header("Date");
  http.end();

  if (statusCode <= 0) {
    Serial.print("[TIME] ");
    Serial.print(sourceLabel);
    Serial.print(" HTTP ");
    Serial.println(statusCode);
    Serial.print("[TIME] ");
    Serial.print(sourceLabel);
    Serial.print(" error: ");
    Serial.println(HTTPClient::errorToString(statusCode));
    return false;
  }

  if (dateHeader.length() == 0) {
    Serial.print("[TIME] ");
    Serial.print(sourceLabel);
    Serial.println(" missing Date header.");
    return false;
  }

  return applyHttpDateHeaderAsSystemTime(dateHeader, sourceLabel);
}

bool syncTimeFromHttpsFallback() {
  IPAddress resolvedIp;
  resolveHostAndLog(HOST_WORLDTIMEAPI, "worldtimeapi", resolvedIp);

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  if (!https.begin(client, HTTPS_TIME_FALLBACK_URL)) {
    Serial.println("[TIME] HTTPS fallback begin() failed.");
    return false;
  }

  https.setTimeout(12000);
  int statusCode = https.GET();
  if (statusCode < 200 || statusCode >= 300) {
    Serial.print("[TIME] HTTPS fallback HTTP ");
    Serial.println(statusCode);
    if (statusCode <= 0) {
      Serial.print("[TIME] HTTPS fallback error: ");
      Serial.println(HTTPClient::errorToString(statusCode));
    }
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

  return applyUnixSecondsAsSystemTime(unixSeconds, "HTTPS fallback JSON");
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, WIFI_DNS_PRIMARY, WIFI_DNS_SECONDARY);
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
    Serial.print("[WiFi] Gateway: ");
    Serial.println(WiFi.gatewayIP());
    Serial.print("[WiFi] DNS1: ");
    Serial.println(WiFi.dnsIP(0));
    Serial.print("[WiFi] DNS2: ");
    Serial.println(WiFi.dnsIP(1));
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

  bool dnsOverrideApplied = false;

  for (uint8_t recoveryAttempt = 0; recoveryAttempt < TIME_SYNC_RECOVERY_ATTEMPTS; recoveryAttempt++) {
    if (recoveryAttempt > 0) {
      if (!forceReconnectWiFi()) {
        continue;
      }
    }

    if (!dnsOverrideApplied && WiFi.dnsIP(0) != WIFI_DNS_PRIMARY) {
      Serial.println("[NTP] Resolver looks unstable. Trying preferred DNS override...");
      dnsOverrideApplied = applyPreferredDnsAndReconnect();
    }

    configTime(8 * 3600, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
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
      return;
    }

    Serial.println("[NTP] DNS NTP sync failed. Trying IP NTP fallback...");
    configTime(8 * 3600, 0, NTP_FALLBACK_IP_1, NTP_FALLBACK_IP_2, NTP_FALLBACK_IP_3);
    Serial.print("[NTP] Syncing time via IP NTP");

    retries = 0;
    while (!hasValidTime() && retries < NTP_SYNC_MAX_RETRIES) {
      delay(500);
      Serial.print(".");
      retries++;
    }
    Serial.println();

    if (hasValidTime()) {
      Serial.println("[NTP] IP NTP sync OK");
      return;
    }

    Serial.println("[NTP] Time sync failed. Trying HTTPS JSON fallback...");

    if (syncTimeFromHttpsFallback()) {
      return;
    }

    Serial.println("[NTP] JSON fallback failed. Trying HTTPS Date fallback...");
    if (syncTimeFromHttpDate(HTTPS_DATE_FALLBACK_GOOGLE, "HTTPS Date (google)", HOST_GOOGLE)) {
      return;
    }
    if (syncTimeFromHttpDate(ENDPOINT_GET_COMMAND, "HTTPS Date (getCommand)", HOST_CLOUD_FUNCTIONS)) {
      return;
    }
    if (syncTimeFromHttpDate(ENDPOINT_UPDATE_METRICS, "HTTPS Date (metrics)", HOST_CLOUD_FUNCTIONS)) {
      return;
    }

    Serial.println("[NTP] HTTPS Date fallback failed. Trying HTTP Date via IP fallback...");
    if (syncTimeFromPlainHttpDate(HTTP_DATE_FALLBACK_IP_PRIMARY, "HTTP Date (1.1.1.1)")) {
      return;
    }
    if (syncTimeFromPlainHttpDate(HTTP_DATE_FALLBACK_IP_SECONDARY, "HTTP Date (1.0.0.1)")) {
      return;
    }

    Serial.print("[NTP] Recovery attempt ");
    Serial.print(recoveryAttempt + 1);
    Serial.println(" failed.");
    printNetworkDiagnostics();
  }

  Serial.println("[NTP] Time sync failed. Cloud requests may be rejected.");
}

bool postJson(const char* url, const String& payload, int& statusCode, String& responseBody, uint16_t timeoutMs) {
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

    https.setTimeout(timeoutMs);

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
  int pin = relayPinForOutlet(outletNumber);
  uint8_t relayChannel = relayChannelForPin(pin);
  uint8_t meterChannel = meterChannelForOutlet(outletNumber);

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
  Serial.print(" relayCH=");
  Serial.print(relayChannel);
  Serial.print(" pin=");
  Serial.print(pin);
  Serial.print(" meter=PZEM");
  Serial.print(meterChannel);
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
  bool ok = postJson(ENDPOINT_ACK_COMMAND, payload, statusCode, response, HTTP_TIMEOUT_ACK_MS);

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
  int relayPin = -1;
  bool outletResolved = resolveOutletMapping(outletId, outletNumber, relayPin);

  if (!outletResolved || relayPin < 0) {
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
  if (millis() < commandBackoffUntilMs) {
    return;
  }

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
  bool ok = postJson(ENDPOINT_GET_COMMAND, payload, statusCode, response, HTTP_TIMEOUT_COMMAND_MS);
  if (!ok) {
    commandBackoffUntilMs = millis() + COMMAND_BACKOFF_AFTER_ERROR_MS;
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
  if (millis() < metricsBackoffUntilMs) {
    return;
  }

  updateSimulatedEnergy();

  if (!hasValidTime()) {
    syncTime();
    if (!hasValidTime()) return;
  }

  OutletTelemetry outlet1Telemetry = readOrSimulateOutletTelemetry(1);
  OutletTelemetry outlet2Telemetry = readOrSimulateOutletTelemetry(2);
  uint8_t outlet1MeterChannel = meterChannelForOutlet(1);
  uint8_t outlet2MeterChannel = meterChannelForOutlet(2);
  unsigned long nowMs = millis();

  enforceOutletPowerLimit(1, outlet1Telemetry, nowMs);
  enforceOutletPowerLimit(2, outlet2Telemetry, nowMs);
  enforceTotalPowerLimit(outlet1Telemetry, outlet2Telemetry, nowMs);

  if (!simulatedTelemetryEnabled && !outlet1Telemetry.meterReachable) {
    unsigned long nowMs = millis();
    if (pzem1PreviouslyReachable || (nowMs - lastPzem1WarnAtMs >= PZEM_WARNING_INTERVAL_MS)) {
      Serial.print("[PZEM");
      Serial.print(outlet1MeterChannel);
      Serial.println("] Outlet1 read failed (check AC L/N + VCC/GND + RX/TX)");
      lastPzem1WarnAtMs = nowMs;
    }
    pzem1PreviouslyReachable = false;
  } else {
    if (!pzem1PreviouslyReachable && !simulatedTelemetryEnabled) {
      Serial.print("[PZEM");
      Serial.print(outlet1MeterChannel);
      Serial.println("] Outlet1 reading restored.");
    }
    pzem1PreviouslyReachable = true;
  }

  if (!simulatedTelemetryEnabled && !outlet2Telemetry.meterReachable) {
    unsigned long nowMs = millis();
    if (pzem2PreviouslyReachable || (nowMs - lastPzem2WarnAtMs >= PZEM_WARNING_INTERVAL_MS)) {
      Serial.print("[PZEM");
      Serial.print(outlet2MeterChannel);
      Serial.println("] Outlet2 read failed (check AC L/N + VCC/GND + RX/TX)");
      lastPzem2WarnAtMs = nowMs;
    }
    pzem2PreviouslyReachable = false;
  } else {
    if (!pzem2PreviouslyReachable && !simulatedTelemetryEnabled) {
      Serial.print("[PZEM");
      Serial.print(outlet2MeterChannel);
      Serial.println("] Outlet2 reading restored.");
    }
    pzem2PreviouslyReachable = true;
  }

  StaticJsonDocument<700> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["timestamp"] = nowEpochMs();

  JsonArray outlets = doc.createNestedArray("outlets");

  JsonObject outlet1 = outlets.createNestedObject();
  outlet1["number"] = 1;
  outlet1["outletId"] = "outlet1";
  outlet1["voltage"] = outlet1Telemetry.voltage;
  outlet1["current"] = outlet1Telemetry.current;
  outlet1["power"] = outlet1Telemetry.power;
  outlet1["energy"] = outlet1Telemetry.energy;
  outlet1["status"] = relay1On ? "on" : "off";

  JsonObject outlet2 = outlets.createNestedObject();
  outlet2["number"] = 2;
  outlet2["outletId"] = "outlet2";
  outlet2["voltage"] = outlet2Telemetry.voltage;
  outlet2["current"] = outlet2Telemetry.current;
  outlet2["power"] = outlet2Telemetry.power;
  outlet2["energy"] = outlet2Telemetry.energy;
  outlet2["status"] = relay2On ? "on" : "off";

  String payload;
  serializeJson(doc, payload);

  int statusCode = 0;
  String response;
  bool ok = postJson(ENDPOINT_UPDATE_METRICS, payload, statusCode, response, HTTP_TIMEOUT_METRICS_MS);

  if (!ok) {
    metricsBackoffUntilMs = millis() + METRICS_BACKOFF_AFTER_ERROR_MS;
    metricsSuccessCount = 0;
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

  if (statusCode >= 200 && statusCode < 300) {
    metricsSuccessCount++;
    if (metricsSuccessCount == 1 || (metricsSuccessCount % METRICS_SUCCESS_LOG_EVERY) == 0) {
      Serial.print("[METRICS] HTTP ");
      Serial.print(statusCode);
      Serial.print(" ok_count=");
      Serial.println(metricsSuccessCount);
    }
    return;
  }

  if (statusCode < 200 || statusCode >= 300) {
    metricsSuccessCount = 0;
    Serial.print("[METRICS] Error body: ");
    Serial.println(response);
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  printBootResetReason();

  Serial.println();
  Serial.println("========================================");
  Serial.println("WiseWatt ESP32 Controller Boot");
  Serial.print("Firmware: ");
  Serial.println(FIRMWARE_VERSION);
  Serial.println("Serial commands: help");
  Serial.println("========================================");
  Serial.println("[MAP] Control: outlet1->relay1, outlet2->relay2");
  Serial.println("[MAP] Sensor: outlet1->PZEM2, outlet2->PZEM1");
  Serial.print("[MAP] Outlet1 relayCH=");
  Serial.print(relayChannelForPin(OUTLET_1_RELAY_PIN));
  Serial.print(" pin=");
  Serial.print(OUTLET_1_RELAY_PIN);
  Serial.print(" meter=PZEM");
  Serial.print(OUTLET_1_PZEM_CHANNEL);
  Serial.print("  Outlet2 relayCH=");
  Serial.print(relayChannelForPin(OUTLET_2_RELAY_PIN));
  Serial.print(" pin=");
  Serial.print(OUTLET_2_RELAY_PIN);
  Serial.print(" meter=PZEM");
  Serial.println(OUTLET_2_PZEM_CHANNEL);

  pinMode(RELAY_CH1_PIN, OUTPUT);
  pinMode(RELAY_CH2_PIN, OUTPUT);

  // Default OFF for active LOW relay board.
  digitalWrite(RELAY_CH1_PIN, HIGH);
  digitalWrite(RELAY_CH2_PIN, HIGH);

  relay1On = false;
  relay2On = false;

  // Explicitly initialize both UART ports so each PZEM stays pinned to its outlet.
  pzemSerial1.begin(PZEM_UART_BAUD, SERIAL_8N1, PZEM_1_RX_PIN, PZEM_1_TX_PIN);
  pzemSerial2.begin(PZEM_UART_BAUD, SERIAL_8N1, PZEM_2_RX_PIN, PZEM_2_TX_PIN);

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

  bool realtimeMode = (nowMs < activeBurstUntilMs) || relay1On || relay2On || (pendingAckCommandId.length() > 0);

  unsigned long currentCommandPollInterval = realtimeMode
    ? COMMAND_POLL_INTERVAL_ACTIVE_MS
    : COMMAND_POLL_INTERVAL_IDLE_MS;

  if (nowMs - lastCommandPollAtMs >= currentCommandPollInterval) {
    pollLatestCommand();
    lastCommandPollAtMs = nowMs;
  }

  flushPendingAckIfNeeded();

  unsigned long currentMetricsInterval = realtimeMode
    ? METRICS_INTERVAL_ACTIVE_MS
    : METRICS_INTERVAL_IDLE_MS;

  if (nowMs - lastMetricsAtMs >= currentMetricsInterval) {
    sendTelemetry();
    lastMetricsAtMs = nowMs;
  }

  delay(20);
}
