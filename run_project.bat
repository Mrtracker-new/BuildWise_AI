@echo off
echo ========================================================
echo   BuildWise AI: Starting Full-Stack Application
echo ========================================================

echo Starting FastAPI Backend Service on port 8000...
start "BuildWise AI Backend" cmd /k "cd /d %~dp0backend && python run_backend.py"

timeout /t 2 /nobreak >nul

echo Starting Vite Frontend on port 5173...
start "BuildWise AI Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================================
echo   BuildWise AI is launching!
echo   Frontend: http://localhost:5173/
echo   Backend:  http://localhost:8000/docs
echo ========================================================
echo.
