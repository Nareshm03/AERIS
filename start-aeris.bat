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

REM 1. Detection microservice :8001 (Python/FastAPI + YOLO best.onnx).
REM    Uses "python -m" so no executable allow-listing is required.
REM    Needs: pip install -r backend\requirements.txt (once)
start "AERIS Detection :8001" cmd /k "cd backend && python -m uvicorn app:app --host 0.0.0.0 --port 8001"

REM 2. Signal control engine :4001 (pure software, no hardware)
start "AERIS Signals :4001" cmd /k "cd backend && npm run dev:signals"

REM Let the two supporting services come up before the API connects to them
timeout /t 4 /nobreak > nul

REM 3. Backend API :4000
start "AERIS Backend :4000" cmd /k "cd backend && npm run dev"

timeout /t 4 /nobreak > nul

REM 4. Frontend :5173
start "AERIS Frontend :5173" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo    AERIS is starting...
echo    Detection: http://localhost:8001  (GET /health)
echo    Signals:   http://localhost:4001  (GET /health)
echo    Backend:   http://localhost:4000
echo    Frontend:  http://localhost:5173
echo ========================================
echo    Run diagnose.bat to verify all four services.
echo.
echo Press any key to open browser...
pause > nul

REM Open browser
start http://localhost:5173

echo.
echo AERIS is running!
echo Close this window to keep servers running.
