@echo off
rem ============================================================================
rem  StormLens — one-file local installer for Windows.
rem
rem  Download this file and double-click it. It fetches the setup script from
rem  the public repo and runs it: the script downloads the StormLens site,
rem  asks for your GeoCatalog URL, then serves the app at http://localhost:8080
rem  and opens your browser.
rem
rem  No git, no clone, no Node, no Python — nothing to type. The site is served
rem  by a built-in PowerShell HTTP listener, so nothing is installed.
rem ============================================================================
title StormLens Setup
setlocal
set "BOOT=https://raw.githubusercontent.com/Balunywa/planetary-computer-pro-poc/main/deploy/azure/webapp/setup/bootstrap.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$p=Join-Path $env:TEMP 'stormlens-bootstrap.ps1';try{Invoke-WebRequest -UseBasicParsing '%BOOT%' -OutFile $p}catch{Write-Host ('Could not reach GitHub: '+$_.Exception.Message) -ForegroundColor Red;Read-Host 'Press Enter to close';exit 1};& $p"
if errorlevel 1 (
  echo.
  echo   Setup failed - see the messages above.
  echo   Press any key to close this window.
  pause >nul
)
endlocal
