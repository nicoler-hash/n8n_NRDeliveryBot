@echo off
chcp 65001 > nul
title NRDeliveryBot - Inicio con ngrok y n8n

:: Ejecutar el script PowerShell con bypass de directivas de ejecución
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1" %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] El script finalizó con un código de error: %ERRORLEVEL%
    pause
)

