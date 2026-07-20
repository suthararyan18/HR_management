@echo off
title OmniStaff Python Backend Setup and Runner
echo ===================================================
echo   OmniStaff - Office Management Python Backend
echo ===================================================
echo.

:: 1. Backup old Node.js backend files if they exist in the backend folder
echo [1/3] Checking for Node.js files to backup...
if not exist "node_backend_backup" (
    mkdir "node_backend_backup"
    echo Created node_backend_backup directory.
)

:: Move Node.js files if they exist
if exist "backend\server.js" (
    move "backend\server.js" "node_backend_backup\" >nul
    echo Backed up server.js
)
if exist "backend\package.json" (
    move "backend\package.json" "node_backend_backup\" >nul
    echo Backed up package.json
)
if exist "backend\package-lock.json" (
    move "backend\package-lock.json" "node_backend_backup\" >nul
    echo Backed up package-lock.json
)

:: Move config
if exist "backend\config\db.js" (
    if not exist "node_backend_backup\config" mkdir "node_backend_backup\config"
    move "backend\config\db.js" "node_backend_backup\config\" >nul
    echo Backed up config/db.js
)

:: Move middleware
if exist "backend\middleware\auth.js" (
    if not exist "node_backend_backup\middleware" mkdir "node_backend_backup\middleware"
    move "backend\middleware\auth.js" "node_backend_backup\middleware\" >nul
    echo Backed up middleware/auth.js
)

:: Move models
if exist "backend\models\User.js" (
    if not exist "node_backend_backup\models" mkdir "node_backend_backup\models"
    move "backend\models\User.js" "node_backend_backup\models\" >nul
    move "backend\models\Attendance.js" "node_backend_backup\models\" >nul
    move "backend\models\LeaveRequest.js" "node_backend_backup\models\" >nul
    echo Backed up models/
)

:: Move routes
if exist "backend\routes\auth.js" (
    if not exist "node_backend_backup\routes" mkdir "node_backend_backup\routes"
    move "backend\routes\auth.js" "node_backend_backup\routes\" >nul
    move "backend\routes\attendance.js" "node_backend_backup\routes\" >nul
    move "backend\routes\hr.js" "node_backend_backup\routes\" >nul
    move "backend\routes\leaves.js" "node_backend_backup\routes\" >nul
    echo Backed up routes/
)

echo Backup check completed.
echo.

:: 2. Install dependencies
echo [2/3] Installing Python dependencies from requirements.txt...
pip install -r backend/requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to install dependencies. Please make sure Python and pip are installed and added to PATH.
    pause
    exit /b %errorlevel%
)
echo Dependencies installed successfully.
echo.

:: 3. Run server
echo [3/3] Starting Python FastAPI Backend...
echo Server will run on http://localhost:5000
echo Swagger UI docs available at: http://localhost:5000/docs
echo.
python -m backend.server
pause
