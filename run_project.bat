@echo off
setlocal enabledelayedexpansion
title BuildWise AI Launcher

echo ========================================================
echo   BuildWise AI: Full-Stack Application Launcher
echo ========================================================
echo.

set "BACKEND_DIR=%~dp0backend"
set "BACKEND_VENV=%BACKEND_DIR%\venv"
set "BACKEND_PYTHON=%BACKEND_VENV%\Scripts\python.exe"
set "FRONTEND_DIR=%~dp0frontend"
set "FRONTEND_MODULES=%FRONTEND_DIR%\node_modules"

:: Optional flag to force reinstallation: run_project.bat --install or --setup
set "FORCE_SETUP=0"
if /i "%~1"=="--setup" set "FORCE_SETUP=1"
if /i "%~1"=="--install" set "FORCE_SETUP=1"
if /i "%~1"=="-s" set "FORCE_SETUP=1"

:: ---------------------------------------------------------
:: 1. Backend Setup & Verification
:: ---------------------------------------------------------
set "DO_BACKEND_SETUP=0"
if not exist "%BACKEND_PYTHON%" (
    echo [Backend] Virtual environment not found. Initializing first-time setup...
    set "DO_BACKEND_SETUP=1"
) else if "!FORCE_SETUP!"=="1" (
    echo [Backend] Re-install requested via flag. Updating requirements...
    set "DO_BACKEND_SETUP=1"
) else (
    echo [Backend] Virtual environment verified: %BACKEND_VENV%
)

if "!DO_BACKEND_SETUP!"=="1" (
    :: Detect system Python command
    set "SYSTEM_PYTHON="
    python --version >nul 2>&1
    if not errorlevel 1 (
        set "SYSTEM_PYTHON=python"
    ) else (
        py -3 --version >nul 2>&1
        if not errorlevel 1 (
            set "SYSTEM_PYTHON=py -3"
        )
    )

    if "!SYSTEM_PYTHON!"=="" (
        echo [ERROR] Python was not found in your PATH!
        echo Please install Python 3.10+ and ensure "Add python.exe to PATH" is checked.
        echo Download: https://www.python.org/downloads/
        pause
        exit /b 1
    )

    if not exist "%BACKEND_PYTHON%" (
        echo [Backend 1/2] Creating virtual environment in backend\venv...
        !SYSTEM_PYTHON! -m venv "%BACKEND_VENV%"
        if errorlevel 1 (
            echo [ERROR] Failed to create virtual environment.
            pause
            exit /b 1
        )
    )

    echo [Backend 2/2] Installing dependencies from requirements.txt...
    call "%BACKEND_PYTHON%" -m pip install -r "%BACKEND_DIR%\requirements.txt"
    if errorlevel 1 (
        echo [ERROR] Failed to install backend dependencies from requirements.txt.
        pause
        exit /b 1
    )
    echo [Backend] Dependencies successfully installed!
    echo.
)

:: Auto-copy .env if missing in backend
if not exist "%BACKEND_DIR%\.env" (
    if exist "%BACKEND_DIR%\.env.example" (
        echo [Backend] Initializing backend\.env from .env.example...
        copy "%BACKEND_DIR%\.env.example" "%BACKEND_DIR%\.env" >nul
    )
)

:: ---------------------------------------------------------
:: 2. Frontend Setup & Verification
:: ---------------------------------------------------------
set "DO_FRONTEND_SETUP=0"
if not exist "%FRONTEND_MODULES%\" (
    echo [Frontend] node_modules not found. Initializing first-time setup...
    set "DO_FRONTEND_SETUP=1"
) else if "!FORCE_SETUP!"=="1" (
    echo [Frontend] Re-install requested via flag. Running npm install...
    set "DO_FRONTEND_SETUP=1"
) else (
    echo [Frontend] Node dependencies verified.
)

if "!DO_FRONTEND_SETUP!"=="1" (
    call npm --version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Node.js / npm was not found in your PATH!
        echo Please install Node.js [v18+] from https://nodejs.org/
        pause
        exit /b 1
    )

    echo [Frontend] Installing npm packages, this may take a moment...
    cd /d "%FRONTEND_DIR%"
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install frontend dependencies.
        cd /d "%~dp0"
        pause
        exit /b 1
    )
    cd /d "%~dp0"
    echo [Frontend] Dependencies successfully installed!
    echo.
)

:: Auto-copy .env if missing in frontend
if not exist "%FRONTEND_DIR%\.env" (
    if exist "%FRONTEND_DIR%\.env.example" (
        echo [Frontend] Initializing frontend\.env from .env.example...
        copy "%FRONTEND_DIR%\.env.example" "%FRONTEND_DIR%\.env" >nul
    )
)

echo.
:: ---------------------------------------------------------
:: 3. Process & Port Cleanup
:: ---------------------------------------------------------
echo Freeing ports 8000 and 5173 if occupied by stale processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

:: ---------------------------------------------------------
:: 4. Launch Services
:: ---------------------------------------------------------
echo Starting FastAPI Backend Service on port 8000...
if exist "%BACKEND_VENV%\Scripts\activate.bat" (
    start "BuildWise AI Backend" cmd /k "cd /d "%BACKEND_DIR%" && call "%BACKEND_VENV%\Scripts\activate.bat" && python run_backend.py"
) else (
    start "BuildWise AI Backend" cmd /k "cd /d "%BACKEND_DIR%" && python run_backend.py"
)

ping -n 3 127.0.0.1 >nul

echo Starting Vite Frontend on port 5173...
start "BuildWise AI Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && call npm run dev"

echo.
echo ========================================================
echo   BuildWise AI is launching!
echo   Frontend: http://localhost:5173/
echo   Backend:  http://localhost:8000/docs
echo ========================================================
echo.
