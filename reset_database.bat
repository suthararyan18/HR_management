@echo off
title Resetting OmniStaff Database
echo ===================================================
echo       OmniStaff - Database Cleaner/Resetter
echo ===================================================
echo.
echo WARNING: This will permanently delete all users, attendance logs, 
echo and leave requests from the MySQL database.
echo.
set /p confirm="Are you sure you want to reset the database? (y/n): "
if /i "%confirm%" neq "y" (
    echo Reset cancelled.
    pause
    exit /b
)

echo Resetting database...
python backend/utils/db_reset.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to run database reset. Please make sure Python is installed and running.
    pause
    exit /b %errorlevel%
)

echo.
echo Database has been successfully cleared!
echo You can now register a fresh HR Account.
echo.
pause
