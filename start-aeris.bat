@echo off
setlocal
echo ========================================
echo    AERIS - Emergency Response System
echo    Starting full software stack...
echo ========================================
echo.

REM 0. The backend refuses to boot without JWT_SECRET - fail fast here
REM    with actionable instructions instead of a crash in another window.
if not exist backend\.env (
    echo [ERROR] backend\.env not found.
    echo.
    echo Create it first:
    echo   copy backend\.env.example backend\.env
    echo.
    echo Then set JWT_SECRET inside it - generate with:
    echo   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    echo.
    pause > nul
    exit /b 1
)

REM 1. Signal control engine :4001 (pure software, no hardware)
start "AERIS Signals :4001" cmd /k "cd backend && npm run dev:signals"

REM Let the signal engine come up before the API connects to it
timeout /t 4 /nobreak > nul

REM 2. Backend API :4000
start "AERIS Backend :4000" cmd /k "cd backend && npm run dev"

timeout /t 4 /nobreak > nul

REM 3. Frontend :5173
start "AERIS Frontend :5173" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo    AERIS is starting...
echo    Signals:   http://localhost:4001  (GET /health)
echo    Backend:   http://localhost:4000
echo    Frontend:  http://localhost:5173
echo ========================================
echo    Run diagnose.bat to verify all three services.
echo.
echo Press any key to open browser...
pause > nul

REM Open browser
start http://localhost:5173

echo.
echo AERIS is running!
echo Close this window to keep servers running.
