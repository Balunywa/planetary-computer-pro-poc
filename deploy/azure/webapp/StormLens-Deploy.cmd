@echo off
rem ============================================================================
rem  StormLens — one-file deploy wizard launcher for Windows.
rem
rem  Download this file and double-click it. It ensures the Azure CLI is present
rem  (installs it with winget if missing), fetches the deploy wizard from the
rem  public repo, and opens a guided browser wizard at http://localhost:7333
rem  that provisions the StormLens / Planetary Computer Pro accelerator into
rem  your Azure subscription — the same ARM template as the "Deploy to Azure"
rem  button, with live progress. The wizard serves itself with a built-in
rem  PowerShell HTTP listener (no Node, no Python).
rem ============================================================================
title StormLens Deploy Wizard
setlocal

where az >nul 2>nul
if errorlevel 1 (
  echo   Azure CLI not found - installing with winget ^(a Windows prompt may appear^)...
  winget install --id Microsoft.AzureCLI -e --accept-source-agreements --accept-package-agreements
)

set "BOOT=https://raw.githubusercontent.com/Balunywa/planetary-computer-pro-poc/main/deploy/azure/webapp/wizard/deploy-wizard.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$p=Join-Path $env:TEMP 'stormlens-deploy-wizard.ps1';try{Invoke-WebRequest -UseBasicParsing '%BOOT%' -OutFile $p}catch{Write-Host ('Could not reach GitHub: '+$_.Exception.Message) -ForegroundColor Red;Read-Host 'Press Enter to close';exit 1};& $p"
if errorlevel 1 (
  echo.
  echo   Wizard exited with an error - see the messages above.
  echo   Press any key to close this window.
  pause >nul
)
endlocal
