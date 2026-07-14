# 🚑 AERIS - Ambulance Emergency Response Intelligent System

**Full-Stack Real-Time Emergency Response System with Live GPS Tracking**

![AERIS Banner](https://img.shields.io/badge/AERIS-v2.1-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Production%20Ready-success?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## 🌟 Overview

AERIS is a cutting-edge **Ambulance Emergency Response Intelligent System** that provides real-time ambulance tracking, intelligent traffic signal control, and multi-role dashboards for emergency response coordination. Built as a software prototype with hardware-ready architecture for future ESP32 integration.

### 🎯 Key Features

- ✅ **Real-Time GPS Tracking** - Live ambulance movement on interactive OpenStreetMap
- ✅ **Intelligent Routing** - Dijkstra algorithm for optimal path calculation
- ✅ **Green Corridor System** - Automatic traffic signal control along ambulance route
- ✅ **Dual Verification** - Camera (YOLO simulation) + Siren detection with fail-safe logic
- ✅ **Multi-Role Dashboards** - Driver, Police, Hospital, and Admin interfaces
- ✅ **Real-Time Updates** - 2-second polling with live UI synchronization
- ✅ **Dark Theme UI** - Modern, professional interface with smooth animations
- ✅ **Sound Notifications** - Audio alerts for emergency events
- ✅ **Hardware Ready** - Modular architecture for ESP32 traffic signal integration

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

### Running the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
# Server runs on http://localhost:4000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# App runs on http://localhost:5173
```

### Login Credentials

| Role | Username | Password |
|------|----------|----------|
| 🚑 Driver | `driver` | `driver123` |
| 👮 Police | `police` | `police123` |
| 🏥 Hospital | `hospital` | `hospital123` |
| 👨‍💼 Admin | `admin` | `admin123` |

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

- **6 Junction Signals** across city network
- **Automatic GREEN corridor** when ambulance approaches
- **Manual override** by Police (auto-release after 30s)
- **Real-time state sync** across all dashboards
- **ESP32-ready** signal control API

### 🔍 Dual Detection System

**Camera Detection (YOLO Simulation):**
- Confidence: 82-96% during active emergency
- Threshold: ≥75% for verification
- Visual confidence bar in UI

**Siren Detection (Audio FFT Simulation):**
- Frequency: 850-1050 Hz during active siren
- Threshold: ≥700 Hz for verification
- Live waveform visualization

**Fail-Safe Logic:**
- Emergency ON + (Camera OR Siren) = Verified
- Both fail → Manual override mode active
- Real-time status updates

### 🎛️ Role-Based Dashboards

#### 🚑 Driver Dashboard
- Emergency activation button
- Route selection (3 pre-computed routes)
- Live GPS position on map
- Detection status (Camera + Siren)
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
- ESP32 hardware status
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

### Map & GPS
- **Leaflet.js** - Map rendering
- **OpenStreetMap** - Free map tiles
- **Dark theme tiles** - CartoDB Dark Matter
- **GPS coordinates** - Simulated Delhi locations
- **Smooth interpolation** - Between waypoints

---

## 🎨 UI/UX Features

- **Dark Theme** - Professional emergency control center aesthetic
- **Smooth Animations** - Fade-in, slide-in, pulse effects
- **Responsive Design** - Works on desktop and tablets
- **Real-time Updates** - 2-second polling interval
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

### Traffic Control
- `POST /api/signal/override` - Manual signal override (Police only)
- `GET /api/status` - Get full system state

### Detection
- `POST /api/detect/camera` - Camera detection endpoint
- `POST /api/detect/siren` - Siren detection endpoint

### Admin
- `DELETE /api/session/:rid` - Delete session (Admin only)
- `POST /api/system/reset` - System reset (Admin only)
- `GET /api/logs` - Get system logs
- `GET /api/esp32` - Get ESP32 hardware status

---

## 🔮 Future Hardware Integration

### ESP32 Traffic Signal Controller

The system is designed for easy ESP32 integration:

```typescript
// Backend sends HTTP POST to ESP32
POST http://localhost:4001/signal
{
  "signal": "Signal A",
  "color": "GREEN"
}

// ESP32 receives and controls GPIO pins
// GPIO mapping: S1→GPIO5, S2→GPIO10, etc.
```

**Hardware Setup:**
1. ESP32 with WiFi module
2. Relay modules for signal control
3. Power supply for traffic lights
4. Network connectivity to backend

---

## 📊 System Specifications

- **City Graph:** 8 nodes (junctions)
- **Traffic Signals:** 6 controllable signals
- **Route Options:** 3 pre-computed paths
- **Update Frequency:** 2 seconds
- **GPS Precision:** 5 decimal places
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
 