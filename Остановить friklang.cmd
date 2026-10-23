@echo off
setlocal
set "VITE_CLI=%~dp0node_modules\vite\bin\vite.js"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue'; $target=[IO.Path]::GetFullPath('%VITE_CLI%'); $owners=Get-NetTCPConnection -State Listen -LocalPort 5173 | Select-Object -ExpandProperty OwningProcess -Unique; $stopped=$false; foreach($id in $owners){ $proc=Get-CimInstance Win32_Process -Filter ('ProcessId='+$id); if($proc.CommandLine -and $proc.CommandLine.Contains($target)){ Stop-Process -Id $id -Force; $stopped=$true } }; if($stopped){ Write-Output 'friklang local server stopped.' } else { Write-Output 'No friklang server owned by this project is running.' }"
pause
