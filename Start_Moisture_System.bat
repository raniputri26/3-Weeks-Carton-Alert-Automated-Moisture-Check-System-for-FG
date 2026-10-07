@echo off
title FG Moisture Alert System Server
echo ====================================================
echo        Menyalakan FG Moisture Alert System...
echo ====================================================
echo.

:: Pindah ke direktori tempat file .bat ini berada secara otomatis
cd /d "%~dp0"

:: Buka browser dengan jeda 3 detik agar server sempat menyala penuh
start /B cmd /c "timeout /t 3 >nul && start http://localhost:3000"

:: Jalankan server Node.js
npm run dev

pause
