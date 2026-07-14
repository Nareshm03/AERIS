#!/bin/bash

# AERIS System Diagnostic Script
# Run this to check if everything is working correctly

echo "🔍 AERIS System Diagnostics"
echo "=========================="
echo ""

# Check if backend is running
echo "1. Checking Backend..."
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/routes/computed 2>/dev/null)
if [ "$BACKEND_STATUS" = "200" ]; then
    echo "   ✅ Backend is running on port 4000"
else
    echo "   ❌ Backend is NOT running (Expected 200, got $BACKEND_STATUS)"
    echo "   → Start with: cd backend && npm run dev"
fi
echo ""

# Check if frontend is running
echo "2. Checking Frontend..."
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null)
if [ "$FRONTEND_STATUS" = "200" ]; then
    echo "   ✅ Frontend is running on port 5173"
else
    echo "   ❌ Frontend is NOT running (Expected 200, got $FRONTEND_STATUS)"
    echo "   → Start with: cd frontend && npm run dev"
fi
echo ""

# Check routes endpoint
echo "3. Checking Routes API..."
ROUTES=$(curl -s http://localhost:4000/api/routes/computed 2>/dev/null)
if [ ! -z "$ROUTES" ]; then
    echo "   ✅ Routes API responding"
    echo "   → Routes: $(echo $ROUTES | grep -o '"path":\[[^]]*\]' | head -1)"
else
    echo "   ❌ Routes API not responding"
fi
echo ""

# Check if ports are in use
echo "4. Checking Ports..."
if command -v lsof &> /dev/null; then
    PORT_4000=$(lsof -ti:4000 2>/dev/null)
    PORT_5173=$(lsof -ti:5173 2>/dev/null)
    
    if [ ! -z "$PORT_4000" ]; then
        echo "   ✅ Port 4000 in use (PID: $PORT_4000)"
    else
        echo "   ❌ Port 4000 not in use"
    fi
    
    if [ ! -z "$PORT_5173" ]; then
        echo "   ✅ Port 5173 in use (PID: $PORT_5173)"
    else
        echo "   ❌ Port 5173 not in use"
    fi
elif command -v netstat &> /dev/null; then
    PORT_4000=$(netstat -an | grep :4000 | grep LISTEN)
    PORT_5173=$(netstat -an | grep :5173 | grep LISTEN)
    
    if [ ! -z "$PORT_4000" ]; then
        echo "   ✅ Port 4000 listening"
    else
        echo "   ❌ Port 4000 not listening"
    fi
    
    if [ ! -z "$PORT_5173" ]; then
        echo "   ✅ Port 5173 listening"
    else
        echo "   ❌ Port 5173 not listening"
    fi
else
    echo "   ⚠️  Cannot check ports (lsof/netstat not available)"
fi
echo ""

# Check Node.js version
echo "5. Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "   ✅ Node.js installed: $NODE_VERSION"
    
    # Check if version is 18+
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$MAJOR_VERSION" -ge 18 ]; then
        echo "   ✅ Version is compatible (18+)"
    else
        echo "   ⚠️  Version might be too old (need 18+)"
    fi
else
    echo "   ❌ Node.js not installed"
fi
echo ""

# Summary
echo "=========================="
echo "📊 Summary"
echo "=========================="

if [ "$BACKEND_STATUS" = "200" ] && [ "$FRONTEND_STATUS" = "200" ]; then
    echo "✅ System is running correctly!"
    echo ""
    echo "Next steps:"
    echo "1. Open http://localhost:5173"
    echo "2. Click 'Ambulance Driver' card"
    echo "3. Click 'ACTIVATE EMERGENCY' button"
    echo ""
    echo "If emergency activation still doesn't work:"
    echo "→ Check browser console (F12) for errors"
    echo "→ Check backend terminal for logs"
    echo "→ See EMERGENCY_ACTIVATION_TROUBLESHOOTING.md"
else
    echo "❌ System is NOT running correctly"
    echo ""
    echo "To start the system:"
    echo ""
    echo "Terminal 1 (Backend):"
    echo "  cd backend"
    echo "  npm run dev"
    echo ""
    echo "Terminal 2 (Frontend):"
    echo "  cd frontend"
    echo "  npm run dev"
fi
echo ""
