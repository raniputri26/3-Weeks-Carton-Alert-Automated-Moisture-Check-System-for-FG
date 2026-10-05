@echo off
title FG Moisture Alert System Server
echo ====================================================
echo        Menyalakan FG Moisture Alert System...
echo ====================================================
echo.
cd /d "c:\Digital System\Finish Good Moisture Alert System"

:: Buka browser secara otomatis ke IP Network
start http://10.20.32.198:3000

:: Jalankan server Node.js
npm run dev

pause
