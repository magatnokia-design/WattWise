# 📝 **Firebase Schema Documentation**

---

## **Paste this into `docs/firebase-schema.md`:**

```markdown
# WattWise - Firebase Firestore Schema Design

## Overview
This document defines the complete Firestore database structure for WattWise app. All collections are designed for real-time monitoring with ESP32 integration.

---

## Collections Structure

### 1. **users** (Collection)
**Path:** `/users/{userId}`

Stores user profile, preferences, and app settings.

**Fields:**
```javascript
{
  uid: string,                    // Firebase Auth UID
  email: string,                  // User email
  name: string,                   // Display name
  createdAt: timestamp,           // Account creation date
  lastLogin: timestamp,           // Last login timestamp
  onboardingComplete: boolean,    // Has completed onboarding
  electricityRate: number,        // Cost per kWh (default: 0)
  monthlyBudget: number,          // Monthly budget in currency (default: 0)
  preferences: {
    notificationsEnabled: boolean,
    darkMode: boolean,            // Future feature
    language: string,             // Default: 'en'
  }
}
```

**Indexes:**
- `email` (ascending)
- `createdAt` (descending)

**Security Rules:**
- Read/Write: Only authenticated user (uid matches document ID)

---

### 2. **outlets** (Subcollection)
**Path:** `/users/{userId}/outlets/{outletId}`

Stores real-time metrics and status for each outlet (outlet1, outlet2).

**Document IDs:** `outlet1`, `outlet2`

**Fields:**
```javascript
{
  outletNumber: number,           // 1 or 2
  status: string,                 // 'on' | 'off'
  applianceName: string,          // User-defined name (default: 'Outlet 1/2')
  voltage: number,                // Current voltage (V)
  current: number,                // Current amperage (A)
  power: number,                  // Current power (W)
  energy: number,                 // Cumulative energy today (kWh)
  totalEnergy: number,            // Lifetime total energy (kWh)
  lastUpdated: timestamp,         // Last ESP32 update
  autoDetectedAppliance: string,  // Future: AI-detected appliance type
}
```

**Indexes:**
- `lastUpdated` (descending)
- Composite: `status` + `lastUpdated`

**Security Rules:**
- Read: Authenticated user (uid matches parent document)
- Write: Server-side only (ESP32 via Cloud Functions)

**Real-time Listener:** Yes (Dashboard screen)

---

### 3. **history_logs** (Subcollection)
**Path:** `/users/{userId}/history_logs/{logId}`

Stores activity events (ON/OFF actions).

**Fields:**
```javascript
{
  timestamp: timestamp,           // Event time
  outlet: number,                 // 1 or 2
  outletName: string,             // Appliance name at time of event
  action: string,                 // 'on' | 'off'
  source: string,                 // 'manual' | 'schedule' | 'auto_cutoff'
  power: number,                  // Power at time of event (W)
}
```

**Indexes:**
- Composite: `outlet` + `timestamp` (descending)
- `timestamp` (descending)

**Security Rules:**
- Read: Authenticated user
- Write: Server-side only

**Pagination:** 20 items per page

---

### 4. **history_daily** (Subcollection)
**Path:** `/users/{userId}/history_daily/{date}`

Stores daily energy consumption summary.

**Document ID:** Date string (YYYY-MM-DD format, e.g., `2025-01-15`)

**Fields:**
```javascript
{
  date: string,                   // YYYY-MM-DD
  outlet1Energy: number,          // Outlet 1 daily kWh
  outlet2Energy: number,          // Outlet 2 daily kWh
  totalEnergy: number,            // Total daily kWh
  cost: number,                   // Total daily cost
  peakPower: number,              // Peak power usage (W)
  peakHour: number,               // Hour of peak (0-23)
  createdAt: timestamp,
}
```

**Indexes:**
- `date` (descending)

**Security Rules:**
- Read: Authenticated user
- Write: Server-side only (Cloud Function triggered at midnight)

**Retention:** Keep last 12 months, auto-delete older

---

### 5. **schedules** (Subcollection)
**Path:** `/users/{userId}/schedules/{scheduleId}`

Stores countdown timers and scheduled ON/OFF actions.

**Fields:**
```javascript
{
  outlet: number,                 // 1 or 2
  type: string,                   // 'countdown' | 'scheduled'
  active: boolean,                // Is timer active
  
  // For countdown type:
  countdownDuration: number,      // Total seconds
  countdownRemaining: number,     // Remaining seconds
  countdownStartedAt: timestamp,  // When countdown started
  
  // For scheduled type:
  scheduledTime: string,          // HH:MM format (24-hour)
  scheduledDays: array,           // [0-6] (0=Sunday, 6=Saturday)
  
  action: string,                 // 'on' | 'off'
  createdAt: timestamp,
  lastTriggered: timestamp,       // Last execution time
}
```

**Indexes:**
- Composite: `active` + `type` + `outlet`
- `createdAt` (descending)

**Security Rules:**
- Read: Authenticated user
- Write: Authenticated user + validation rules

**Cloud Function Triggers:**
- Check scheduled timers every minute
- Update countdown timers in real-time

---

### 6. **budget** (Subcollection)
**Path:** `/users/{userId}/budget/{month}`

Stores monthly budget tracking.

**Document ID:** Month string (YYYY-MM format, e.g., `2025-01`)

**Fields:**
```javascript
{
  month: string,                  // YYYY-MM
  monthlyBudget: number,          // Set budget for month
  currentSpending: number,        // Current total spending
  outlet1Spending: number,        // Outlet 1 spending
  outlet2Spending: number,        // Outlet 2 spending
  dailyAverage: number,           // Average daily spending
  projectedTotal: number,         // Projected end-of-month total
  lastUpdated: timestamp,
  alerts: array,                  // Alert history
  thresholds: {
    fifty: boolean,               // 50% alert triggered
    seventyFive: boolean,         // 75% alert triggered
    ninety: boolean,              // 90% alert triggered
    hundred: boolean,             // 100% alert triggered
  }
}
```

**Indexes:**
- `month` (descending)

**Security Rules:**
- Read: Authenticated user
- Write: Server-side only (auto-updated from daily usage)

---

### 7. **notifications** (Subcollection)
**Path:** `/users/{userId}/notifications/{notificationId}`

Stores app notifications/alerts.

**Fields:**
```javascript
{
  type: string,                   // 'high_usage' | 'warning' | 'cutoff' | 'budget' | 'schedule' | 'device'
  title: string,                  // Notification title
  message: string,                // Notification message
  outlet: number,                 // 1 or 2 (null for general alerts)
  read: boolean,                  // Has user read it
  timestamp: timestamp,           // Created time
  metadata: object,               // Additional data (power, threshold, etc.)
}
```

**Indexes:**
- Composite: `read` + `timestamp` (descending)
- `timestamp` (descending)

**Security Rules:**
- Read: Authenticated user
- Write: Server-side only (user can update `read` field only)

**Retention:** Keep last 30 days, auto-delete older

**Real-time Listener:** Yes (NotificationPanel)

---

### 8. **power_safety** (Document)
**Path:** `/users/{userId}/power_safety`

Stores power safety management settings and current status.

**Fields:**
```javascript
{
  // Current safety stage
  currentStage: string,           // 'normal' | 'warning' | 'limit' | 'cutoff'
  
  // Protection settings
  autoProtectionEnabled: boolean, // Auto cut-off enabled
  
  // Thresholds
  thresholds: {
    voltageMin: number,           // Minimum safe voltage (V)
    voltageMax: number,           // Maximum safe voltage (V)
    currentMax: number,           // Maximum safe current (A)
    powerMax: number,             // Maximum safe power (W)
  },
  
  // Current readings (for comparison)
  outlet1: {
    voltage: number,
    current: number,
    power: number,
  },
  outlet2: {
    voltage: number,
    current: number,
    power: number,
  },
  
  // Alert history
  alerts: array,                  // Recent safety alerts
  lastCutoff: timestamp,          // Last auto cut-off event
  lastUpdated: timestamp,
}
```

**Indexes:** None (single document)

**Security Rules:**
- Read: Authenticated user
- Write: User can update `autoProtectionEnabled` and `thresholds`, server updates readings

**Real-time Listener:** Yes (PowerSafetyScreen)

---

### 9. **reference_comparison** (Subcollection)
**Path:** `/users/{userId}/reference_comparison/{month}`

Stores previous bill data for month-over-month comparison.

**Document ID:** Month string (YYYY-MM format, e.g., `2024-12`)

**Fields:**
```javascript
{
  month: string,                  // YYYY-MM
  previousBillKWh: number,        // Total kWh from previous bill
  previousBillCost: number,       // Total cost from previous bill
  outlet1Energy: number,          // Outlet 1 energy (optional)
  outlet2Energy: number,          // Outlet 2 energy (optional)
  notes: string,                  // User notes
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

**Indexes:**
- `month` (descending)

**Security Rules:**
- Read/Write: Authenticated user

**Retention:** Keep last 12 months

---

## Data Flow Architecture

### **ESP32 → Firebase Flow:**

```
ESP32 Sensors
    ↓
Read Voltage, Current, Power
    ↓
Send to Firebase via HTTP/MQTT
    ↓
Cloud Function validates data
    ↓
Update /users/{userId}/outlets/{outletId}
    ↓
Trigger updates:
  - Check safety thresholds → Update power_safety
  - Log ON/OFF events → Add to history_logs
  - Update daily totals → Update history_daily
  - Check budget → Update budget/{month}
  - Create notifications if needed
```

### **App → Firebase Flow:**

```
User Action (Toggle outlet, Edit name, Set timer)
    ↓
App calls Cloud Function
    ↓
Function validates request
    ↓
Send command to ESP32 (via Firebase Realtime Database)
    ↓
ESP32 executes command
    ↓
ESP32 sends confirmation back
    ↓
Update Firestore documents
```

---

## Real-time Listeners Strategy

**To avoid lag (critical requirement):**

### **Active Listeners:**
1. **Dashboard Screen:**
   - `/users/{userId}/outlets/{outletId}` (both outlets)
   - `/users/{userId}/notifications` (unread count only)
   
2. **NotificationPanel:**
   - `/users/{userId}/notifications` (limit 20, paginated)

3. **PowerSafetyScreen:**
   - `/users/{userId}/power_safety`

**NO real-time listeners on:**
- History screens (fetch on load only)
- Analytics (fetch on tab change)
- Budget tracking (fetch on load)
- Reference comparison (static data)

### **Optimization Rules:**
- Debounce real-time updates (max 1 update per second)
- Use `onSnapshot` with error handling
- Detach listeners on screen blur
- Implement offline persistence for critical data

---

## Cloud Functions Required

### **1. `updateOutletMetrics`**
**Trigger:** HTTP request from ESP32
**Purpose:** Update real-time outlet data
**Actions:**
- Validate ESP32 device token
- Update `/outlets/{outletId}`
- Check safety thresholds
- Create alerts if needed

### **2. `processOutletToggle`**
**Trigger:** HTTPS callable from app
**Purpose:** Send ON/OFF command to ESP32
**Actions:**
- Validate user permission
- Send command to ESP32
- Log event to history_logs
- Return success/failure

### **3. `processDailyRollup`**
**Trigger:** Cloud Scheduler (runs at midnight)
**Purpose:** Create daily summary
**Actions:**
- Aggregate outlet data for previous day
- Create `/history_daily/{date}` document
- Update `/budget/{month}` spending
- Clean old logs (>30 days)

### **4. `checkScheduledTimers`**
**Trigger:** Cloud Scheduler (runs every minute)
**Purpose:** Execute scheduled timers
**Actions:**
- Query active scheduled timers
- Check if time matches
- Send ON/OFF command to ESP32
- Update `lastTriggered` timestamp

### **5. `handleBudgetAlerts`**
**Trigger:** Firestore write to `/budget/{month}`
**Purpose:** Send budget threshold notifications
**Actions:**
- Check spending vs budget
- Create notification if threshold crossed
- Update threshold flags

### **6. `handleSafetyAlerts`**
**Trigger:** Firestore write to `/power_safety`
**Purpose:** Send safety notifications
**Actions:**
- Check if stage changed
- Create high-priority notification
- Auto cut-off if enabled and stage = 'cutoff'

### **7. `ackDeviceCommand`**
**Trigger:** HTTP request from ESP32
**Purpose:** Acknowledge command delivery/execution status
**Actions:**
- Validate deviceId + deviceToken
- Validate fresh timestamp
- Update `/users/{userId}/device_commands/{commandId}` ack fields
- Mark command as executed when status is `executed`

---

## Security Rules Template

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    // Users collection
    match /users/{userId} {
      allow read, write: if isOwner(userId);
      
      // Outlets subcollection (read-only for users)
      match /outlets/{outletId} {
        allow read: if isOwner(userId);
        allow write: if false; // Server-side only
      }
      
      // History subcollections (read-only for users)
      match /history_logs/{logId} {
        allow read: if isOwner(userId);
        allow write: if false;
      }
      
      match /history_daily/{date} {
        allow read: if isOwner(userId);
        allow write: if false;
      }
      
      // Schedules (user can read/write)
      match /schedules/{scheduleId} {
        allow read, write: if isOwner(userId);
      }
      
      // Budget (read-only for users)
      match /budget/{month} {
        allow read: if isOwner(userId);
        allow write: if false;
      }
      
      // Notifications (users can update 'read' field only)
      match /notifications/{notificationId} {
        allow read: if isOwner(userId);
        allow update: if isOwner(userId) 
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
        allow create, delete: if false;
      }
      
      // Power safety (users can update settings only)
      match /power_safety {
        allow read: if isOwner(userId);
        allow update: if isOwner(userId)
          && request.resource.data.diff(resource.data).affectedKeys()
            .hasOnly(['autoProtectionEnabled', 'thresholds']);
      }
      
      // Reference comparison (user can read/write)
      match /reference_comparison/{month} {
        allow read, write: if isOwner(userId);
      }
    }
  }
}
```

---

## Indexes to Create

**Via Firebase Console → Firestore → Indexes:**

1. **history_logs:**
   - Collection: `history_logs`
   - Fields: `outlet` (Ascending), `timestamp` (Descending)

2. **notifications:**
   - Collection: `notifications`
   - Fields: `read` (Ascending), `timestamp` (Descending)

3. **outlets:**
   - Collection: `outlets`
   - Fields: `status` (Ascending), `lastUpdated` (Descending)

4. **schedules:**
   - Collection: `schedules`
   - Fields: `active` (Ascending), `type` (Ascending), `outlet` (Ascending)

---

## Data Migration Plan

**Phase 1:** Create collections structure in Firebase Console
**Phase 2:** Update all hook files (replace TODO comments)
**Phase 3:** Implement Cloud Functions
**Phase 4:** Deploy security rules
**Phase 5:** Test with simulated ESP32 data
**Phase 6:** Connect real ESP32 hardware

---

## Performance Considerations

### **Read Optimization:**
- Limit queries to 20-50 documents
- Use pagination for history logs
- Cache static data (user settings, thresholds)
- Use composite indexes for complex queries

### **Write Optimization:**
- Batch writes when possible
- Debounce ESP32 updates (max 1/second)
- Use transactions for safety-critical updates
- Queue non-urgent writes

### **Storage Optimization:**
- Auto-delete logs older than 30 days
- Compress old history data (monthly archives)
- Limit notification history to 100 items
- Use subcollections to avoid document size limits

---

## ESP32 Data Format

**ESP32 sends data every 1 second via HTTP POST:**

```json
{
  "deviceId": "ESP32_UNIQUE_ID",
  "timestamp": 1705334400,
  "outlets": [
    {
      "number": 1,
      "voltage": 220.5,
      "current": 0.45,
      "power": 99.2,
      "status": "on",
      "energy": 0.5
    },
    {
      "number": 2,
      "voltage": 220.3,
      "current": 0.0,
      "power": 0.0,
      "status": "off",
      "energy": 0.0
    }
  ]
}
```

**Cloud Function validates:**
- Device ID matches user's registered ESP32
- Timestamp is recent (within 10 seconds)
- Values are within safe ranges
- Required fields present

---

## Offline Support

**AsyncStorage Cache (for offline mode):**
- User preferences
- Last known outlet status
- Recent notifications (last 10)
- Current month budget data

**Sync strategy:**
- Queue writes when offline
- Retry failed writes on reconnect
- Show offline indicator in UI
- Prevent critical actions (toggle outlets) when offline

---

## Testing Strategy

### **Unit Tests:**
- Firestore service functions
- Data validation logic
- Security rules simulation

### **Integration Tests:**
- Cloud Functions with test data
- Real-time listener performance
- Offline/online transitions

### **Load Tests:**
- Simulate 1000 ESP32 updates/second
- Test query performance with 10,000+ logs
- Measure real-time listener latency

---

**End of Schema Documentation**
```

---

## **Next Steps:**

Now that schema is documented, we have 2 options:

### **Option A: Create Firestore Service Layer** (Coding)
- Build `src/services/firebase/firestoreService.js`
- Implement all CRUD operations for each collection
- Replace TODO comments in existing hooks
- **Time:** ~1 hour

### **Option B: ESP32 Integration Planning** (Documentation)
- Define ESP32 hardware setup
- Plan Arduino code structure
- Document WiFi connection flow
- Define command protocol (app → ESP32)
- **Time:** ~30 minutes