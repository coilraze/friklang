@echo off
setlocal
set "NODE_VERSION=v24.22.1"
set "NODE_ARCHIVE=node-%NODE_VERSION%-win-x64.zip"
set "NODE_BASE=%LOCALAPPDATA%\friklang"
set "NODE_HOME=%NODE_BASE%\node-%NODE_VERSION%-win-x64"
set "NODE_ZIP=%TEMP%\%NODE_ARCHIVE%"
set "NODE_URL=https://nodejs.org/dist/%NODE_VERSION%/%NODE_ARCHIVE%"

if exist "%NODE_HOME%\node.exe" goto install_deps
if not exist "%NODE_BASE%" mkdir "%NODE_BASE%"
echo Downloading official portable Node.js %NODE_VERSION% (no administrator rights required)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%'; Expand-Archive -LiteralPath '%NODE_ZIP%' -DestinationPath '%NODE_BASE%' -Force; Remove-Item -LiteralPath '%NODE_ZIP%' -Force"
if errorlevel 1 (
  echo Could not download Node.js. Check your internet connection and try again.
  pause
  exit /b 1
)

:install_deps
if not exist "%~dp0node_modules\vite\bin\vite.js" (
  echo Installing friklang dependencies...
  "%NODE_HOME%\node.exe" "%NODE_HOME%\node_modules\npm\bin\npm-cli.js" install --no-audit --no-fund --prefix "%~dp0"
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)
echo Setup is complete. Double-click the friklang launcher file to open the app.
pause
