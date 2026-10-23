@echo off
setlocal
set "APP_DIR=%~dp0"
set "APP_URL=http://127.0.0.1:5173/"
set "NODE_HOME=%LOCALAPPDATA%\friklang\node-v24.22.1-win-x64"
set "NODE_EXE=%NODE_HOME%\node.exe"
set "NPM_CLI=%NODE_HOME%\node_modules\npm\bin\npm-cli.js"
set "VITE_CLI=%APP_DIR%node_modules\vite\bin\vite.js"

if not exist "%NODE_EXE%" if exist "%LOCALAPPDATA%\friklang\node-v24.22.1-win-x64\node.exe" set "NODE_EXE=%LOCALAPPDATA%\friklang\node-v24.22.1-win-x64\node.exe"
if not exist "%NODE_EXE%" (
  set "NODE_EXE=node.exe"
  where node.exe >nul 2>nul || (
    echo Node.js was not found. Re-run the one-time setup helper or install Node.js 22.12+.
    pause
    exit /b 1
  )
)

if not exist "%APP_DIR%node_modules\vite\bin\vite.js" (
  echo friklang dependencies are missing. Restoring them now...
  if exist "%NPM_CLI%" (
    "%NODE_EXE%" "%NPM_CLI%" install --no-audit --no-fund --prefix "%APP_DIR%"
  ) else (
    pushd "%APP_DIR%"
    call npm.cmd install --no-audit --no-fund
    set "INSTALL_CODE=%ERRORLEVEL%"
    popd
    if not "%INSTALL_CODE%"=="0" exit /b %INSTALL_CODE%
  )
  if not exist "%APP_DIR%node_modules\vite\bin\vite.js" (
    echo Dependency installation did not produce Vite.
    pause
    exit /b 1
  )
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$u=[uri]'%APP_URL%'; try { $r=Invoke-WebRequest -Uri $u -TimeoutSec 2 -UseBasicParsing; if($r.StatusCode -eq 200 -and $r.Content -match 'friklang'){ exit 0 } } catch {}; exit 1" >nul 2>nul
if "%ERRORLEVEL%"=="0" (
  start "" "%APP_URL%"
  exit /b 0
)

echo Starting friklang on %APP_URL%
start "friklang local server" /min "%NODE_EXE%" "%VITE_CLI%" --host 127.0.0.1 --port 5173 --strictPort

for /L %%I in (1,1,40) do (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { $r=Invoke-WebRequest -Uri '%APP_URL%' -TimeoutSec 1 -UseBasicParsing; if($r.StatusCode -eq 200 -and $r.Content -match 'friklang'){ exit 0 } } catch {}; exit 1" >nul 2>nul
  if "%%I"=="1" if not "%ERRORLEVEL%"=="0" echo Waiting for the local server...
  if "%ERRORLEVEL%"=="0" goto ready
  timeout /t 1 /nobreak >nul
)

echo Could not start friklang. Check that port 5173 is free and Node.js is available.
pause
exit /b 1

:ready
start "" "%APP_URL%"
echo friklang is ready at %APP_URL%
exit /b 0
