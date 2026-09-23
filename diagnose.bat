@echo off
setlocal EnableDelayedExpansion
REM AERIS System Diagnostic Script for Windows
REM Run this to check if everything is working correctly

echo.
echo ========================================
echo   AERIS System Diagnostics
echo ========================================
echo.

REM Check if backend is running
echo 1. Checking Backend API :4000...
curl -s -o NUL -w "%%{http_code}" http://localhost:4000/api/routes/computed > temp_status.txt 2>NUL
set /p BACKEND_STATUS=<temp_status.txt
del temp_status.txt 2>NUL

if "!BACKEND_STATUS!"=="200" (
    echo    [OK] Backend is running on port 4000
) else (
    echo    [ERROR] Backend is NOT running
    echo    Start with: cd backend ^&^& npm run dev
    echo    (requires backend\.env with JWT_SECRET - see backend\.env.example)
)
echo.

REM Check signal engine
echo 2. Checking Signal Engine :4001...
curl -s -o NUL -w "%%{http_code}" http://localhost:4001/health > temp_status.txt 2>NUL
set /p SIGNAL_STATUS=<temp_status.txt
del temp_status.txt 2>NUL

if "!SIGNAL_STATUS!"=="200" (
    echo    [OK] Signal engine is running on port 4001
) else (
    echo    [ERROR] Signal engine is NOT running
    echo    Start with: cd backend ^&^& npm run dev:signals
)
echo.

REM Check detection microservice
echo 3. Checking Detection Service :8001...
curl -s -o NUL -w "%%{http_code}" http://localhost:8001/health > temp_status.txt 2>NUL
set /p DETECT_STATUS=<temp_status.txt
del temp_status.txt 2>NUL

if "!DETECT_STATUS!"=="200" (
    echo    [OK] Detection service is running on port 8001
) else (
    echo    [ERROR] Detection service is NOT running
    echo    Start with: cd backend ^&^& python -m uvicorn app:app --host 0.0.0.0 --port 8001
    echo    (requires: python -m pip install -r backend\requirements.txt)
)
echo.

REM Check if frontend is running
echo 4. Checking Frontend :5173...
curl -s -o NUL -w "%%{http_code}" http://localhost:5173 > temp_status.txt 2>NUL
set /p FRONTEND_STATUS=<temp_status.txt
del temp_status.txt 2>NUL

if "!FRONTEND_STATUS!"=="200" (
    echo    [OK] Frontend is running on port 5173
) else (
    echo    [ERROR] Frontend is NOT running
    echo    Start with: cd frontend ^&^& npm run dev
)
echo.

REM Check routes endpoint
echo 5. Checking Routes API...
curl -s http://localhost:4000/api/routes/computed > temp_routes.txt 2>NUL
findstr /C:"path" temp_routes.txt >NUL 2>&1
if %ERRORLEVEL%==0 (
    echo    [OK] Routes API responding
) else (
    echo    [ERROR] Routes API not responding
)
del temp_routes.txt 2>NUL
echo.

REM Check if ports are in use
echo 6. Checking Ports...
for %%P in (4000 4001 8001 5173) do (
    netstat -an | findstr ":%%P" | findstr "LISTENING" >NUL 2>&1
    if !ERRORLEVEL!==0 (
        echo    [OK] Port %%P is listening
    ) else (
        echo    [ERROR] Port %%P is not listening
    )
)
echo.

REM Check Node.js version
echo 7. Checking Node.js...
where node >NUL 2>&1
if %ERRORLEVEL%==0 (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo    [OK] Node.js installed: !NODE_VERSION! ^(need 18+^)
) else (
    echo    [ERROR] Node.js not installed
)
echo.

REM Check Python version
echo 8. Checking Python...
where python >NUL 2>&1
if %ERRORLEVEL%==0 (
    for /f "tokens=*" %%i in ('python --version 2^>^&1') do set PY_VERSION=%%i
    echo    [OK] !PY_VERSION! ^(need 3.10+ for detection service^)
) else (
    echo    [ERROR] Python not installed - detection service :8001 cannot run
)
echo.

REM Summary
echo ========================================
echo   Summary
echo ========================================
echo.

if "!BACKEND_STATUS!"=="200" if "!FRONTEND_STATUS!"=="200" if "!SIGNAL_STATUS!"=="200" if "!DETECT_STATUS!"=="200" (
    echo [OK] Full stack is running correctly!
    echo.
    echo Next steps:
    echo 1. Open http://localhost:5173
    echo 2. Click 'Ambulance Driver' card
    echo 3. Click 'ACTIVATE EMERGENCY' button
    echo.
    echo If emergency activation still doesn't work:
    echo - Check browser console ^(F12^) for errors
    echo - Check backend terminal for logs
) else (
    echo [ERROR] System is NOT fully running - see failures above
    echo.
    echo To start the whole stack at once:
    echo   start-aeris.bat
    echo.
    echo Or start each service manually:
    echo.
    echo Terminal 1 ^(Detection :8001^):
    echo   cd backend
    echo   python -m uvicorn app:app --host 0.0.0.0 --port 8001
    echo.
    echo Terminal 2 ^(Signals :4001^):
    echo   cd backend
    echo   npm run dev:signals
    echo.
    echo Terminal 3 ^(Backend :4000^):
    echo   cd backend
    echo   npm run dev
    echo.
    echo Terminal 4 ^(Frontend :5173^):
    echo   cd frontend
    echo   npm run dev
)
echo.

pause
