@echo off
REM ==============================================================================
REM DeliveryBot - Lanzador Batch para Windows
REM Inicia el entorno mediante PowerShell con directiva de ejecucion desbloqueada
REM ==============================================================================

setlocal
title DeliveryBot - Cafeteria Automation

cd /d "%~dp0\.."

echo [DeliveryBot] Iniciando lanzador en Windows...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*

pause

