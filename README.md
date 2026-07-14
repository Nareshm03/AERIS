# 🚑 AERIS - Ambulance Emergency Response Intelligent System

[![AERIS Version](https://img.shields.io/badge/AERIS-v2.1-blue.svg?style=for-the-badge&logo=opsgenie)](https://github.com/Nareshm03/AERIS)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-success.svg?style=for-the-badge&logo=githubactions)](https://github.com/Nareshm03/AERIS)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://github.com/Nareshm03/AERIS)
[![Node Version](https://img.shields.io/badge/Node.js-18%2B-darkgreen.svg?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![React Version](https://img.shields.io/badge/React-19-blue.svg?style=for-the-badge&logo=react)](https://react.dev)

AERIS is a cutting-edge, full-stack **Ambulance Emergency Response Intelligent System** designed to minimize emergency response times. It provides real-time GPS tracking, automated "Green Corridor" traffic signal preemption using Dijkstra-based route optimization, dual-verification (YOLO camera + siren frequency detection) simulations, and dedicated dashboards for drivers, traffic police, hospitals, and system administrators.

---

## 🌟 Key Features

*   📍 **Real-Time GPS Tracking** – Live ambulance movement tracked on an interactive Leaflet/OpenStreetMap interface.
*   🛣️ **Intelligent Routing** – Dynamic calculation of the optimal path using a Dijkstra-based route engine.
*   🚦 **Green Corridor System** – Automatic traffic signal synchronization to clear the path ahead of the approaching ambulance.
*   🔍 **Dual Verification Engine** – Simulates verification via camera vision (YOLO simulation) & siren sound (FFT frequency validation) to prevent false overrides.
*   🎛️ **Role-Based Dashboards** – Custom interfaces tailored for **Drivers**, **Police Controllers**, **Receiving Hospitals**, and **System Administrators**.
*   🔊 **Audio Alerts & Waves** – Real-time siren waveform visualization and sound notifications for critical events.
*   🔌 **Hardware-Ready** – Modular architecture with built-in API integration templates for physical ESP32 traffic controllers.

---

## 🏗️ Project Architecture

```
AERIS/
├── backend/                  # Express + TypeScript Server
│   ├── server.ts             # Main API & routing configurations
│   ├── simple-server.ts      # Minimal fallback server implementation
│   ├── esp32-sim.ts          # Simulation script for ESP32 hardware interactions
│   └── tsconfig.json         # TypeScript compiler options
│
├── frontend/                 # React + TypeScript + Vite Client
│   ├── src/
│   │   ├── pages/            # Role-Based Views
│   │   │   ├── Login.tsx     # Session authentication page
│   │   │   ├── Driver.tsx    # Route selection & emergency status
│   │   │   ├── Police.tsx    # Signal override & city grid stats
│   │   │   ├── Hospital.tsx  # Inbound ETAs & emergency checklists
│   │   │   └── Admin.tsx     # Session management & active log outputs
│   │   ├── components/       # Shared UI Widgets
│   │   │   ├── InteractiveMap.tsx  # Interactive Leaflet Map component
│   │   │   ├── SirenWaveform.tsx   # Visual FFT waveform simulator
│   │   │   ├── TrafficLight.tsx    # Live junction status controller
│   │   │   └── SSEStatus.tsx       # Live server synchronization status
│   │   └── utils/
│   │       └── sound.ts      # Sound synthesizer and alerts utility
│   └── index.html            # Application entrypoint HTML
│
├── start-aeris.bat           # Quick launcher script (Windows)
├── diagnose.bat              # Diagnostic script (Windows)
└── README.md                 # Project documentation
```

---

## 🚀 Quick Start

### Prerequisites
*   [Node.js](https://nodejs.org/) (v18 or higher)
*   [npm](https://www.npmjs.com/) (packaged with Node.js)

### Installation

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/Nareshm03/AERIS.git
    cd AERIS
    ```

2.  **Install Dependencies:**
    *   **Backend:**
        ```bash
        cd backend
        npm install
        ```
    *   **Frontend:**
        ```bash
        cd ../frontend
        npm install
        ```

---

## 🏃 Running the Application

You can launch both the frontend and backend servers concurrently using the provided quick-start script (on Windows), or manually in separate terminal windows.

### Method 1: Using the Startup Script (Windows)
Simply run the script in the root directory:
```bash
./start-aeris.bat
```

### Method 2: Manual Startup

**Terminal 1 (Backend Server):**
```bash
cd backend
npm run dev
# Running on http://localhost:4000
```

**Terminal 2 (Frontend Client):**
```bash
cd frontend
npm run dev
# Running on http://localhost:5173
```

---

## 🔑 Login Credentials

The prototype features a role-based login system. Use these credentials to sign in to the corresponding dashboards:

| Icon | Role | Username | Password |
| :---: | :--- | :--- | :--- |
| 🚑 | **Driver** | `driver` | `driver123` |
| 👮 | **Police** | `police` | `police123` |
| 🏥 | **Hospital** | `hospital` | `hospital123` |
| 👨‍💼 | **Admin** | `admin` | `admin123` |

---

## 📱 Detailed Dashboards breakdown

### 🚑 Driver Dashboard
*   **Emergency Mode Switch:** Activating this starts tracking and route optimization.
*   **Route Selector:** Choose from 3 pre-calculated, optimized path alternatives to the destination.
*   **Junction Waypoints:** Shows real-time checkpoints, distance metrics, and the green corridor status.

### 👮 Police Dashboard
*   **City Junction Grid:** Detailed overview of the 6 city traffic signal systems.
*   **Manual Override Control:** Temporarily force any signal to Green (automatically releases back to standard mode after 30 seconds).
*   **System Analytics:** Live charts tracking traffic signal configurations and current priority flags.

### 🏥 Hospital Dashboard
*   **Active ETA Tracker:** Live countdown calculations updating every 2 seconds based on GPS simulation.
*   **Emergency Checklist:** Interactive check boxes to manage ER readiness (e.g., "Prepare Bay 1", "Notify Trauma Team").
*   **Patient Condition Details:** Set severity level to prepare specific emergency protocols.

### 👨‍💼 Admin Dashboard
*   **Live Session Logger:** Outputs the last 100 system events (e.g., logins, route changes, emergency signals).
*   **Session Management:** Control active sessions and execute global system resets.
*   **Hardware Interface Logs:** Monitor the integration logs for connected physical microcontroller modules.

---

## 🛠️ Technology Stack

### Backend API
*   **Runtime:** Node.js
*   **Framework:** Express.js (TypeScript configured)
*   **Engine:** Custom Dijkstra graph calculation module
*   **Auth:** JWT-based user session validation

### Frontend Client
*   **Framework:** React 19 (Vite bundler)
*   **Map API:** Leaflet.js & OpenStreetMap
*   **Visual Assets:** Lucide React icons, HSL-based dynamic dark CSS themes
*   **Data Fetching:** Axios client with smart polling mechanisms

---

## 🔌 Hardware ESP32 Integration Schema

The backend of AERIS contains hooks designed to forward traffic light preemption commands to microcontrollers (like ESP32) running local traffic signals via HTTP endpoints:

```json
POST /api/esp32/signal
{
  "junctionId": "Junction_B",
  "state": "GREEN",
  "duration": 30
}
```

```cpp
// ESP32 Handler snippet (C++)
void setTrafficLight(String state) {
  if (state == "GREEN") {
    digitalWrite(RED_PIN, LOW);
    digitalWrite(GREEN_PIN, HIGH);
  }
}
```

---

## 🔧 Troubleshooting

### White Screen on Frontend Launch
This can occur due to Vite cached modules. Clean your local directory and restart:
```bash
cd frontend
rmdir /s /q node_modules\.vite
npm run dev
```

### Backend Port Conflicts
If port `4000` is already in use by another application:
1.  Open [backend/server.ts](backend/server.ts).
2.  Modify the `PORT` variable to another available port (e.g., `4050`).
3.  Update the api client configuration in [frontend/src/api.ts](frontend/src/api.ts).

---

## 📝 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

*AERIS v2.1 — Making Emergency Response Smarter 🚑💨*