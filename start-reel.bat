@echo off
rem ---------------------------------------------------------------------------
rem  Reel launcher
rem
rem  Double-click to start Reel and open it in your browser. Checks everything
rem  it needs first and says plainly what is missing rather than failing with a
rem  stack trace.
rem
rem  Pass "rebuild" to force a fresh production build:  start-reel.bat rebuild
rem ---------------------------------------------------------------------------

setlocal
cd /d "%~dp0"
title Reel

set "URL=http://localhost:3000"
set "PS=powershell -NoProfile -ExecutionPolicy Bypass -Command"

echo.
echo   Reel - track what you watch
echo   ===========================
echo.

rem --- Is Node installed? ----------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo   Node.js is not installed, or is not on your PATH.
  echo.
  echo   Install the LTS build from https://nodejs.org then run this again.
  echo.
  pause
  exit /b 1
)

rem --- Is Reel already running? ----------------------------------------------
%PS% "try { Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo   Reel is already running. Opening %URL%
  start "" "%URL%"
  exit /b 0
)

rem --- Dependencies ----------------------------------------------------------
if not exist "node_modules\" (
  echo   Installing dependencies. This happens once and takes a minute.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   npm install failed. The reason is above.
    pause
    exit /b 1
  )
)

rem --- TMDB credentials ------------------------------------------------------
if not exist ".env.local" (
  if exist ".env.example" (
    copy ".env.example" ".env.local" >nul
    echo   Created .env.local from the template.
  )
)

set "HAS_TOKEN="
if exist ".env.local" (
  findstr /r /c:"^TMDB_ACCESS_TOKEN=..*" ".env.local" >nul 2>&1 && set "HAS_TOKEN=1"
  findstr /r /c:"^TMDB_API_KEY=..*" ".env.local" >nul 2>&1 && set "HAS_TOKEN=1"
)

if not defined HAS_TOKEN (
  echo.
  echo   No TMDB token found in .env.local
  echo   Reel will open, but cannot load anything until you add one:
  echo.
  echo     1. Sign in at https://www.themoviedb.org, then Settings ^> API
  echo     2. Copy the "API Read Access Token"
  echo     3. Paste it after TMDB_ACCESS_TOKEN= in .env.local
  echo     4. Run this launcher again
  echo.
)

rem --- Build -----------------------------------------------------------------
if /i "%~1"=="rebuild" (
  if exist ".next" rmdir /s /q ".next"
  echo   Forcing a fresh build.
)

if not exist ".next\BUILD_ID" (
  echo   Building Reel. This takes a moment, and only happens after code changes.
  echo.
  call npm run build
  if errorlevel 1 (
    echo.
    echo   The build failed. The reason is above.
    pause
    exit /b 1
  )
  echo.
)

rem --- Open the browser once the server actually answers ----------------------
rem  Polling beats a fixed sleep: the first request after a build can be slow,
rem  and opening too early just shows the user a connection error.
start "" /b %PS% "for ($i=0; $i -lt 120; $i++) { try { Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process '%URL%'; break } catch { Start-Sleep -Milliseconds 500 } }"

echo   Starting Reel at %URL%
echo.
echo   Keep this window open while you use the app.
echo   Press Ctrl+C or close the window to stop it.
echo.

call npm run start

echo.
echo   Reel has stopped.
pause
