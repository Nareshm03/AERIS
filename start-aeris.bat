@echo off
echo ========================================
echo    AERIS - Emergency Response System
echo    Starting Backend and Frontend...
echo ========================================
echo.

REM Start backend in new window
start "AERIS Backend" cmd /k "cd backend && npm run dev"

REM Wait 3 seconds for backend to start
timeout /t 3 /nobreak > nul

REM Start frontend in new window
start "AERIS Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo    AERIS is starting...
echo    Backend: http://localhost:4000
echo    Frontend: http://localhost:5173
echo ========================================
echo.
echo Press any key to open browser...
pause > nul

REM Open browser
start http://localhost:5173

echo.
echo AERIS is running!
echo Close this window to keep servers running.
echo.
