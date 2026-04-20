# Android-First Hardening Guide

This project now applies stricter backend protections for real hardware usage. Use this checklist while continuing feature development.

## 1) Strict ESP32 Authentication

Required for all ESP32 HTTP calls:
- deviceId in request body
- deviceToken in body or x-device-token header
- fresh timestamp (within 15s skew)

Endpoints:
- updateOutletMetrics
- ackDeviceCommand

If the linked token is missing or invalid, requests are rejected.

## 2) Device Command Lifecycle

Commands are now tracked in Firestore at:
- users/{uid}/device_commands/{commandId}

Fields used for lifecycle:
- issuedAt
- delivery.channel
- delivery.lastAckStatus
- acknowledgment.status
- acknowledgment.deviceTimestampMs
- executedAt (when ack status is executed)

ESP32 should acknowledge commands via:
- POST ackDeviceCommand

Payload shape:
{
  "deviceId": "ESP32_ROOM_A",
  "deviceToken": "your-shared-token",
  "timestamp": 1713331200123,
  "commandId": "abc123",
  "status": "executed",
  "details": "Outlet switched successfully"
}

## 3) Anti-Abuse Protections

Metrics ingestion now includes:
- replay/out-of-order payload rejection
- minimum interval rate-limit per device
- numeric range validation for voltage/current/power/energy
- payload size checks for outlet data

## 4) Keep Moving Without Manual Retesting

Since development is continuous, run these automated checks often:

From project root:
- npm --prefix functions run lint
- npm --prefix functions test

Before deploying functions:
- npx -y firebase-tools@latest deploy --only functions

## 5) Android Release Readiness Priorities

1. Keep ESP32 linking mandatory in settings (deviceId + token).
2. Track command ack ratios (issued vs executed) per test day.
3. Verify command latency under weak network.
4. Verify fallback behavior when RTDB write fails (Firestore queue remains).
5. Run final Android hardware pass before capstone submission:
   - manual toggle
   - scheduled toggle
   - safety cutoff
   - command ack updates
   - metrics stream stability
