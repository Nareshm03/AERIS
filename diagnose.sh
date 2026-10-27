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

# Check signal engine
echo "3. Checking Signal Engine :4001..."
SIGNAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/health 2>/dev/null)
if [ "$SIGNAL_STATUS" = "200" ]; then
    echo "   ✅ Signal engine is running on port 4001"
else
    echo "   ❌ Signal engine is NOT running (Expected 200, got $SIGNAL_STATUS)"
    echo "   → Start with: cd backend && npm run dev:signals"
fi
echo ""

# Check routes endpoint
echo "4. Checking Routes API..."
ROUTES=$(curl -s http://localhost:4000/api/routes/computed 2>/dev/null)
if [ ! -z "$ROUTES" ]; then
    echo "   ✅ Routes API responding"
    echo "   → Routes: $(echo $ROUTES | grep -o '"path":\[[^]]*\]' | head -1)"
else
    echo "   ❌ Routes API not responding"
fi
echo ""

# Check if ports are in use
echo "5. Checking Ports..."
if command -v lsof &> /dev/null; then
    for P in 4000 4001 5173; do
        PID_AT_PORT=$(lsof -ti:$P 2>/dev/null)
        if [ ! -z "$PID_AT_PORT" ]; then
            echo "   ✅ Port $P in use (PID: $PID_AT_PORT)"
        else
            echo "   ❌ Port $P not in use"
        fi
    done
elif command -v netstat &> /dev/null; then
    for P in 4000 4001 5173; do
        if netstat -an 2>/dev/null | grep ":$P" | grep -qi LISTEN; then
            echo "   ✅ Port $P listening"
        else
            echo "   ❌ Port $P not listening"
        fi
    done
else
    echo "   ⚠️  Cannot check ports (lsof/netstat not available)"
fi
echo ""

# Check Node.js version
echo "6. Checking Node.js..."
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

if [ "$BACKEND_STATUS" = "200" ] && [ "$FRONTEND_STATUS" = "200" ] && [ "$SIGNAL_STATUS" = "200" ]; then
    echo "✅ Full stack is running correctly!"
    echo ""
    echo "Next steps:"
    echo "1. Open http://localhost:5173"
    echo "2. Click 'Ambulance Driver' card"
    echo "3. Click 'ACTIVATE EMERGENCY' button"
    echo ""
    echo "If emergency activation still doesn't work:"
    echo "→ Check browser console (F12) for errors"
    echo "→ Check backend terminal for logs"
else
    echo "❌ System is NOT fully running - see failures above"
    echo ""
    echo "To start the system:"
    echo ""
    echo "Terminal 1 (Signals :4001):"
    echo "  cd backend"
    echo "  npm run dev:signals"
    echo ""
    echo "Terminal 2 (Backend :4000):"
    echo "  cd backend"
    echo "  npm run dev"
    echo ""
    echo "Terminal 3 (Frontend :5173):"
    echo "  cd frontend"
    echo "  npm run dev"
fi
echo ""
