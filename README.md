# 🚑 AERIS - Ambulance Emergency Response Intelligent System

**Software-Only Emergency Routing & Intelligent Traffic Coordination Platform**

![AERIS Banner](https://img.shields.io/badge/AERIS-v2.1-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Production%20Ready-success?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## 🌟 Overview

AERIS is a cutting-edge **Ambulance Emergency Response Intelligent System** that provides real-time software ambulance tracking, intelligent traffic signal coordination, and multi-role dashboards for emergency response coordination. **This is a complete, self-contained software-only system** — every component, including traffic signal state, ambulance movement, routing, and hospital/police coordination, runs entirely in software. There is no physical hardware, camera, microphone, sensor, or GPS device anywhere in this project.

### 🎯 Key Features

- ✅ **Real-Time Ambulance Tracking** - Live software-simulated ambulance movement on interactive OpenStreetMap
- ✅ **Intelligent Routing** - Dijkstra algorithm for optimal path calculation, with live rerouting around reported roadblocks
- ✅ **Green Corridor System** - Automatic software traffic-signal state coordination along the ambulance route (virtual signals, see below)
- ✅ **Operator-Authorized Emergencies** - Emergency sessions are created directly by the authenticated ambulance operator (JWT + RBAC), no hardware verification step
- ✅ **Multi-Role Dashboards** - Driver, Police, Hospital, and Admin interfaces
- ✅ **Real-Time Updates** - Server-Sent Events (SSE) push updates live to every connected dashboard
- ✅ **Dark Theme UI** - Modern, professional interface with smooth animations
- ✅ **Sound Notifications** - Audio alerts for emergency events
- ✅ **100% Software** - No hardware dependency anywhere; the "signal control engine" is a software service that models exactly what a real controller would do

---

## 🏗️ Architecture

```
AERIS/
├── backend/          # Node.js + Express + TypeScript
│   ├── server.ts     # Main server with REST APIs
│   └── Dijkstra      # Route calculation engine
│
├── frontend/         # React + TypeScript + Vite
│   ├── pages/        # Role-based dashboards
│   │   ├── Login.tsx
│   │   ├── Driver.tsx
│   │   ├── Police.tsx
│   │   ├── Hospital.tsx
│   │   └── Admin.tsx
│   ├── components/
│   │   ├── AmbulanceMap.tsx    # Leaflet.js map
│   │   ├── Nav.tsx
│   │   ├── Toast.tsx
│   │   └── TrafficLight.tsx
│   └── utils/
│       └── sound.ts   # Audio notification system
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Modern browser (Chrome/Edge/Firefox)

### Installation

```bash
# Clone repository
git clone <your-repo-url>
cd Project

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Environment

```bash
# Required: the backend refuses to boot without JWT_SECRET
copy backend\.env.example backend\.env
# Then set JWT_SECRET inside backend\.env - generate with:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Running the Application

On Windows, `start-aeris.bat` launches all three services (checks for
`backend\.env` first). Manually, one terminal per service:

**Terminal 1 - Signal engine:**
```bash
cd backend
npm run dev:signals
# Health: http://localhost:4001/health
```

**Terminal 2 - Backend:**
```bash
cd backend
npm run dev
# Server runs on http://localhost:4000
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
# App runs on http://localhost:5173
```

Run `diagnose.bat` (Windows) or `diagnose.sh` to verify all three services.

### Login Credentials

| Role | Username | Password | Notes |
|------|----------|----------|-------|
| 🚑 Driver | `driver` | `driver123` | Dispatched from Indiranagar Metro |
| 🚑 Driver | `driver2` | `driver123` | Dispatched from Silk Board Junction |
| 🚑 Driver | `driver3` | `driver123` | Dispatched from Indiranagar Metro |
| 👮 Police | `police` | `police123` | |
| 🏥 Hospital | `hospital` | `hospital123` | Manipal Hospital staff |
| 🏥 Hospital | `hospital2` | `hospital123` | St. John's Medical College staff |
| 🏥 Hospital | `hospital3` | `hospital123` | Victoria Hospital staff |
| 🏥 Hospital | `hospital4` | `hospital123` | Sakra World Hospital staff |
| 🏥 Hospital | `hospital5` | `hospital123` | Aster CMI Hospital staff |
| 🏥 Hospital | `hospital6` | `hospital123` | Fortis Hospital staff |
| 🏥 Hospital | `hospital7` | `hospital123` | Aster Whitefield staff |
| 👨‍💼 Admin | `admin` | `admin123` | |

Each hospital login can only manage bed capacity and acknowledge/prep
patients for **their own** hospital - a `hospital2` login gets a 403 if it
tries to touch Manipal's data, for example. Admin can manage all seven.

---

## 📱 Features Breakdown

### 🗺️ Interactive Map (Leaflet.js + OpenStreetMap)

- **Real-time ambulance tracking** with animated marker
- **Hospital marker** with fixed destination
- **Route polyline** with color-coded emergency status
- **Traffic signal markers** showing live RED/GREEN states
- **Ambulance trail** showing path history
- **Auto-pan** following ambulance during emergency
- **Dark theme** map tiles for professional look
- **Map legend** for easy understanding

### 🚦 Traffic Signal Control

- **11 software signals** at real graph junctions across the Bengaluru network
- **Route-aware GREEN corridor** - only signals on an active emergency route participate, when the ambulance approaches
- **Manual override** by Police (auto-release after 30s)
- **Real-time state sync** across all dashboards
- **Software signal control engine** - models exactly what a real controller would do, no hardware required

### 🔐 Software Emergency Authorization

- Emergencies are created directly by the **authenticated ambulance operator**: select a hospital, provide patient information, press **ACTIVATE EMERGENCY**
- Backend validates JWT + RBAC (driver/admin only), then creates the session: Dijkstra route → green corridor → hospital notification → police monitoring → live SSE updates
- No camera, microphone, sensor, or hardware confirmation step exists anywhere in this flow

### 🎛️ Role-Based Dashboards

#### 🚑 Driver Dashboard
- Emergency activation button (operator-initiated, JWT-authorized)
- Hospital selection + route selection (Dijkstra-computed options)
- Live ambulance position on map
- Emergency status panel (SYSTEM READY / EMERGENCY ACTIVE with ETA, distance, route, corridor)
- Traffic signal corridor status
- Route progress tracker

#### 👮 Police Dashboard
- Citywide signal monitoring
- Manual signal override controls
- Live ambulance tracking on map
- Emergency corridor status
- Signal statistics (Green/Red/Yellow counts)

#### 🏥 Hospital Dashboard
- Inbound emergency alerts
- Live ETA countdown timer
- Ambulance position tracking
- Bay preparation checklist
- Patient severity selector
- Arrival notifications

#### 👨‍💼 Admin Dashboard
- Full system overview
- All active sessions
- System logs (last 100 entries)
- Signal control engine status
- Session management
- System reset controls

---

## 🛠️ Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - REST API framework
- **TypeScript** - Type-safe development
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **Dijkstra Algorithm** - Route optimization

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Leaflet.js** - Interactive maps
- **OpenStreetMap** - Map tiles
- **Axios** - HTTP client
- **React Router** - Navigation
- **Lucide React** - Icons

### Map & Software Position Simulation
- **Leaflet.js** - Map rendering
- **OpenStreetMap** - Free map tiles
- **Dark theme tiles** - CartoDB Dark Matter
- **Real Bengaluru coordinates** - Verified junctions, hospitals, and dispatch bases
- **Smooth interpolation** - Software ambulance movement between route nodes

---

## 🎨 UI/UX Features

- **Dark Theme** - Professional emergency control center aesthetic
- **Smooth Animations** - Fade-in, slide-in, pulse effects
- **Responsive Design** - Works on desktop and tablets
- **Real-time Updates** - Server-Sent Events (SSE), no polling
- **Toast Notifications** - Success/Error/Warning alerts
- **Sound Effects** - Emergency siren, success beeps
- **Loading States** - Spinners and skeleton screens
- **Color-Coded Status** - Red (emergency), Green (safe), Yellow (warning)

---

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Emergency Management
- `POST /api/emergency/start` - Start emergency session
- `POST /api/emergency/stop` - Stop emergency session
- `GET /api/routes` - Get available routes
- `GET /api/graph` - Road graph (nodes, coordinates, edges) - single source of truth for clients

### Traffic Control
- `POST /api/signal/override` - Manual signal override (Police only)
- `GET /api/status` - Get full system state

### Roadblock Reporting
- `POST /api/roadblock` - Report a blocked road segment (Police/Admin) - triggers live Dijkstra rerouting
- `DELETE /api/roadblock` - Reopen a previously reported road
- `GET /api/roadblock` - List currently blocked segments

### Patient & Hospital
- `POST /api/emergency/:rid/acknowledge` - Hospital acknowledges an incoming emergency
- `POST /api/emergency/:rid/prep` - Toggle a bay-preparation task

### Admin
- `DELETE /api/session/:rid` - Delete session (Admin only)
- `POST /api/system/reset` - System reset (Admin only)
- `GET /api/logs` - Get system logs
- `GET /api/signal-engine` - Get signal control engine status

---

## 💻 Software-Only Architecture

**This project has no hardware component.** Every part of AERIS runs as software:

- The signal control engine (`backend/signal-controller-sim.ts`) is a standalone Node.js service that receives signal commands over HTTP and tracks virtual signal state. Signals shown in the UI (e.g. S1 = GREEN) are software state, not physical traffic lights.
- Ambulance movement is a software route/movement simulation along Dijkstra-computed graph nodes — no GPS device or phone sensor input.
- Emergency activation is a software authorization decision (authenticated operator + JWT/RBAC) — no camera, microphone, YOLO, ONNX, FFT, or sensor verification exists.
- Only three services run: signal engine (:4001), backend API (:4000), frontend (:5173).

---

## 📊 System Specifications

- **City Graph:** 21 nodes (junctions + hospital destinations)
- **Traffic Signals:** 11 software signals at real graph junctions
- **Hospitals:** 7 simulated destinations (Manipal, St. John's, Victoria, Sakra, Aster CMI, Fortis, Aster Whitefield)
- **Route Options:** Dijkstra-optimal route plus a genuine alternate where the graph allows one
- **Update Frequency:** 2 seconds
- **Coordinate Precision:** 5 decimal places (software simulation)
- **Session Capacity:** Unlimited concurrent sessions
- **Log Retention:** Last 100 entries

---

## 🎯 Use Cases

1. **Emergency Response Coordination** - Real-time ambulance tracking
2. **Traffic Management** - Intelligent signal control
3. **Hospital Preparation** - Advance notification system
4. **Training & Simulation** - Emergency response training
5. **Research & Development** - Smart city traffic systems
6. **College Projects** - Full-stack demonstration

---

## 🐛 Troubleshooting

### White Page Issue
```bash
# Clear Vite cache
cd frontend
rmdir /s /q node_modules\.vite
npm run dev
```

### Backend Connection Failed
- Ensure backend is running on port 4000
- Check firewall settings
- Verify `http://localhost:4000/api/status` is accessible

### Map Not Loading
- Check internet connection (OpenStreetMap requires internet)
- Verify Leaflet CSS is loaded in index.html
- Clear browser cache

---

## 📝 License

MIT License - Free for educational and commercial use

---

## 👥 Contributors

Built with ❤️ for emergency response systems

---

## 🙏 Acknowledgments

- OpenStreetMap contributors
- Leaflet.js team
- React community
- Emergency response professionals

---

## 📞 Support

For issues and questions:
- Check TROUBLESHOOTING.md
- Review API documentation
- Test with provided credentials

---

**AERIS v2.1** - Making Emergency Response Smarter 🚑💨
#   A E R I S  
 #   A E R I S  
 