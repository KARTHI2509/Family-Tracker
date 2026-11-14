# 📡 FamilyTracker — Complete REST & WebSocket API Specification

This document defines the complete contract between the backend API and frontend clients.

---

## 🔐 1. Authentication Endpoints

### 1.1 Register User
- **Method:** `POST`
- **Endpoint:** `/api/auth/register`
- **Auth Required:** No
- **Rate Limit:** 30 req / 15 min
- **Request Body:**
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "securePassword123",
    "phone": "+1234567890" // optional
  }
  ```
- **Success Response (201 Created):**
  ```json
  {
    "message": "Account created successfully.",
    "token": "eyJhbGciOi...",
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+1234567890",
      "avatar_color": "#4F46E5",
      "family_id": null,
      "created_at": "2026-11-14T14:00:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: `{ "error": "Valid email address is required." }`
  - `409 Conflict`: `{ "error": "An account with this email already exists." }`

---

### 1.2 Login User
- **Method:** `POST`
- **Endpoint:** `/api/auth/login`
- **Auth Required:** No
- **Rate Limit:** 30 req / 15 min
- **Request Body:**
  ```json
  {
    "email": "jane@example.com",
    "password": "securePassword123"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "message": "Logged in successfully.",
    "token": "eyJhbGciOi...",
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "avatar_color": "#4F46E5",
      "family_id": 2,
      "family_name": "Doe Family"
    },
    "family": {
      "id": 2,
      "name": "Doe Family",
      "invite_code": "8A2B9C"
    }
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: `{ "error": "Invalid email or password." }`

---

### 1.3 Get Current User Profile
- **Method:** `GET`
- **Endpoint:** `/api/auth/me`
- **Auth Required:** Yes (`Bearer <token>`)
- **Success Response (200 OK):**
  ```json
  {
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "avatar_color": "#4F46E5",
      "family_id": 2,
      "family_name": "Doe Family"
    },
    "family": {
      "id": 2,
      "name": "Doe Family",
      "invite_code": "8A2B9C",
      "created_by": 1
    }
  }
  ```

---

## 👥 2. Family Management Endpoints

### 2.1 Create Family
- **Method:** `POST`
- **Endpoint:** `/api/family/create`
- **Auth Required:** Yes (`Bearer <token>`)
- **Request Body:**
  ```json
  { "name": "Doe Family" }
  ```
- **Success Response (201 Created):**
  ```json
  {
    "message": "Family created successfully.",
    "family": {
      "id": 2,
      "name": "Doe Family",
      "invite_code": "8A2B9C",
      "created_by": 1,
      "created_at": "2026-11-14T14:00:00.000Z"
    },
    "invite_code": "8A2B9C",
    "inviteCode": "8A2B9C"
  }
  ```

---

### 2.2 Join Family
- **Method:** `POST`
- **Endpoint:** `/api/family/join`
- **Auth Required:** Yes (`Bearer <token>`)
- **Request Body:**
  ```json
  { "inviteCode": "8A2B9C" } // or { "invite_code": "8A2B9C" }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "message": "Successfully joined the family.",
    "family": { "id": 2, "name": "Doe Family", "invite_code": "8A2B9C" },
    "members": [ ... ]
  }
  ```

---

### 2.3 Get Family Members with Locations
- **Method:** `GET`
- **Endpoint:** `/api/family/members`
- **Auth Required:** Yes
- **Success Response (200 OK):**
  ```json
  {
    "members": [
      {
        "id": 1,
        "name": "Jane Doe",
        "email": "jane@example.com",
        "avatar_color": "#4F46E5",
        "family_id": 2,
        "latest_location": {
          "latitude": 37.7749,
          "longitude": -122.4194,
          "accuracy": 12,
          "speed": 0,
          "battery_level": 88,
          "is_charging": 0,
          "timestamp": "2026-11-14T14:10:00.000Z"
        }
      }
    ]
  }
  ```

---

### 2.4 Get Family Invite Code
- **Method:** `GET`
- **Endpoint:** `/api/family/invite-code`
- **Auth Required:** Yes
- **Success Response (200 OK):**
  ```json
  {
    "invite_code": "8A2B9C",
    "inviteCode": "8A2B9C",
    "family_name": "Doe Family"
  }
  ```

---

### 2.5 Leave Family
- **Method:** `POST`
- **Endpoint:** `/api/family/leave`
- **Auth Required:** Yes
- **Success Response (200 OK):**
  ```json
  { "message": "Left family successfully." }
  ```

---

## 📍 3. Location Management Endpoints

### 3.1 Update Location
- **Method:** `POST`
- **Endpoint:** `/api/location/update`
- **Auth Required:** Yes
- **Request Body:**
  ```json
  {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "accuracy": 15,
    "speed": 18.5,
    "battery_level": 74,
    "is_charging": 1,
    "address": "San Francisco, CA" // optional
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "message": "Location updated successfully.",
    "location": { ... },
    "geofence_events": [ ... ],
    "alerts": [ ... ]
  }
  ```

---

### 3.2 Get Latest Locations
- **Method:** `GET`
- **Endpoint:** `/api/location/latest`
- **Auth Required:** Yes
- **Success Response (200 OK):**
  ```json
  { "locations": [ ... ] }
  ```

---

### 3.3 Get Location History
- **Method:** `GET`
- **Endpoint:** `/api/location/history/:userId?from=...&to=...&limit=500`
- **Auth Required:** Yes (must be in same family)
- **Success Response (200 OK):**
  ```json
  {
    "history": [ ... ],
    "locations": [ ... ]
  }
  ```

---

## 🛡️ 4. Safe Zones (Geofencing) Endpoints

### 4.1 Create Safe Zone
- **Method:** `POST`
- **Endpoint:** `/api/geofence/create`
- **Auth Required:** Yes
- **Request Body:**
  ```json
  {
    "name": "Home",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radius": 300,
    "color": "#4F46E5"
  }
  ```
- **Success Response (201 Created):**
  ```json
  { "message": "Safe zone created successfully.", "geofence": { ... } }
  ```

---

### 4.2 List Safe Zones
- **Method:** `GET`
- **Endpoint:** `/api/geofence/list`
- **Auth Required:** Yes
- **Success Response (200 OK):**
  ```json
  { "geofences": [ ... ] }
  ```

---

### 4.3 Delete Safe Zone
- **Method:** `DELETE`
- **Endpoint:** `/api/geofence/:id`
- **Auth Required:** Yes (must belong to family)
- **Success Response (200 OK):**
  ```json
  { "message": "Safe zone deleted successfully." }
  ```

---

## 🆘 5. Emergency SOS Endpoints

### 5.1 Trigger Emergency SOS
- **Method:** `POST`
- **Endpoint:** `/api/sos/trigger`
- **Auth Required:** Yes
- **Request Body:**
  ```json
  {
    "latitude": 37.7749, // null if GPS disabled
    "longitude": -122.4194 // null if GPS disabled
  }
  ```
- **Success Response (201 Created):**
  ```json
  {
    "message": "SOS triggered successfully.",
    "sos": {
      "id": 1,
      "userId": 1,
      "user_id": 1,
      "userName": "Jane Doe",
      "user_name": "Jane Doe",
      "latitude": 37.7749,
      "longitude": -122.4194,
      "isActive": 1,
      "is_active": 1,
      "triggeredAt": "2026-11-14T14:15:00.000Z"
    }
  }
  ```

---

### 5.2 Cancel Emergency SOS
- **Method:** `POST`
- **Endpoint:** `/api/sos/cancel`
- **Auth Required:** Yes
- **Success Response (200 OK):**
  ```json
  {
    "message": "SOS cancelled successfully.",
    "sos": { "id": 1, "userId": 1, "cancelledAt": "..." }
  }
  ```

---

### 5.3 Get Active SOS Events
- **Method:** `GET`
- **Endpoint:** `/api/sos/active`
- **Auth Required:** Yes
- **Success Response (200 OK):**
  ```json
  {
    "activeSOSEvents": [ ... ]
  }
  ```

---

## 🔔 6. Safety Alerts Endpoints

### 6.1 List Alerts
- **Method:** `GET`
- **Endpoint:** `/api/alerts?limit=50&offset=0`
- **Auth Required:** Yes
- **Success Response (200 OK):**
  ```json
  {
    "alerts": [ ... ],
    "total": 12,
    "unreadCount": 3,
    "limit": 50,
    "offset": 0
  }
  ```

---

### 6.2 Mark Alert as Read
- **Method:** `PUT`
- **Endpoint:** `/api/alerts/:id/read`
- **Auth Required:** Yes
- **Success Response (200 OK):**
  ```json
  { "message": "Alert marked as read.", "alertId": 5 }
  ```

---

### 6.3 Mark All Alerts as Read
- **Method:** `PUT`
- **Endpoint:** `/api/alerts/read-all`
- **Auth Required:** Yes
- **Success Response (200 OK):**
  ```json
  { "message": "All alerts marked as read.", "updated": 3 }
  ```

---

## ⚡ 7. Real-time WebSocket (Socket.IO) Events

Connection is authenticated via `auth: { token: "<JWT_TOKEN>" }` handshake.
Upon connection, users are automatically placed into their family room `family:<familyId>`.

| Event | Direction | Payload Contract | Description |
|---|---|---|---|
| `location:update` | Server $\rightarrow$ Client | `{ userId, user_id, userName, user_name, avatarColor, latitude, longitude, accuracy, speed, batteryLevel, isCharging, timestamp }` | Broadcast whenever a family member's location updates |
| `member:online` | Server $\rightarrow$ Client | `{ userId, user_id, userName, user_name, avatarColor, timestamp }` | Sent when a family member logs in / connects |
| `member:offline` | Server $\rightarrow$ Client | `{ userId, user_id, userName, user_name, timestamp }` | Sent when all sockets for a member disconnect |
| `online:members` | Server $\rightarrow$ Client | `[ userId1, userId2, ... ]` | Initial list of currently connected family members |
| `sos:triggered` | Server $\rightarrow$ Client | `{ id, userId, user_id, userName, latitude, longitude, isActive, triggeredAt }` | Emergency panic broadcast |
| `sos:cancelled` | Server $\rightarrow$ Client | `{ id, userId, user_id, userName, cancelledAt }` | Emergency cancelled broadcast |
| `alert:new` | Server $\rightarrow$ Client | `{ id, familyId, userId, userName, type, title, message, isRead, createdAt }` | New safety alert generated |
| `geofence:created` | Server $\rightarrow$ Client | `{ id, familyId, name, latitude, longitude, radius, color, createdBy }` | New safe zone added to family map |
| `geofence:deleted` | Server $\rightarrow$ Client | `{ id }` | Safe zone removed from family map |
| `member:left` | Server $\rightarrow$ Client | `{ userId, user_id, userName, user_name }` | Sent when a member leaves the family |

