@echo off
REM AERIS System Diagnostic Script for Windows
REM Run this to check if everything is working correctly

echo.
echo ========================================
echo   AERIS System Diagnostics
echo ========================================
echo.

REM Check if backend is running
echo 1. Checking Backend...
curl -s -o NUL -w "%%{http_code}" http://localhost:4000/api/routes/computed > temp_status.txt 2>NUL
set /p BACKEND_STATUS=<temp_status.txt
del temp_status.txt 2>NUL

if "%BACKEND_STATUS%"=="200" (
    echo    [OK] Backend is running on port 4000
) else (
    echo    [ERROR] Backend is NOT running
    echo    Start with: cd backend ^&^& npm run dev
)
echo.

REM Check if frontend is running
echo 2. Checking Frontend...
curl -s -o NUL -w "%%{http_code}" http://localhost:5173 > temp_status.txt 2>NUL
set /p FRONTEND_STATUS=<temp_status.txt
del temp_status.txt 2>NUL

if "%FRONTEND_STATUS%"=="200" (
    echo    [OK] Frontend is running on port 5173
) else (
    echo    [ERROR] Frontend is NOT running
    echo    Start with: cd frontend ^&^& npm run dev
)
echo.

REM Check routes endpoint
echo 3. Checking Routes API...
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
echo 4. Checking Ports...
netstat -an | findstr ":4000" | findstr "LISTENING" >NUL 2>&1
if %ERRORLEVEL%==0 (
    echo    [OK] Port 4000 is listening
) else (
    echo    [ERROR] Port 4000 is not listening
)

netstat -an | findstr ":5173" | findstr "LISTENING" >NUL 2>&1
if %ERRORLEVEL%==0 (
    echo    [OK] Port 5173 is listening
) else (
    echo    [ERROR] Port 5173 is not listening
)
echo.

REM Check Node.js version
echo 5. Checking Node.js...
where node >NUL 2>&1
if %ERRORLEVEL%==0 (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo    [OK] Node.js installed: !NODE_VERSION!
) else (
    echo    [ERROR] Node.js not installed
)
echo.

REM Summary
echo ========================================
echo   Summary
echo ========================================
echo.

if "%BACKEND_STATUS%"=="200" if "%FRONTEND_STATUS%"=="200" (
    echo [OK] System is running correctly!
    echo.
    echo Next steps:
    echo 1. Open http://localhost:5173
    echo 2. Click 'Ambulance Driver' card
    echo 3. Click 'ACTIVATE EMERGENCY' button
    echo.
    echo If emergency activation still doesn't work:
    echo - Check browser console ^(F12^) for errors
    echo - Check backend terminal for logs
    echo - See EMERGENCY_ACTIVATION_TROUBLESHOOTING.md
) else (
    echo [ERROR] System is NOT running correctly
    echo.
    echo To start the system:
    echo.
    echo Terminal 1 ^(Backend^):
    echo   cd backend
    echo   npm run dev
    echo.
    echo Terminal 2 ^(Frontend^):
    echo   cd frontend
    echo   npm run dev
)
echo.

pause
