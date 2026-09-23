@echo off
echo ========================================================
echo   BuildWise AI: Starting Full-Stack Application
echo ========================================================

echo Freeing ports 8000 and 5173 if occupied by stale processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

echo Starting FastAPI Backend Service on port 8000...
start "BuildWise AI Backend" cmd /k "cd /d %~dp0backend && python run_backend.py"

ping -n 3 127.0.0.1 >nul

echo Starting Vite Frontend on port 5173...
start "BuildWise AI Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================================
echo   BuildWise AI is launching!
echo   Frontend: http://localhost:5173/
echo   Backend:  http://localhost:8000/docs
echo ========================================================
echo.
