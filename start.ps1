<#
.SYNOPSIS
    DeliveryBot - Script de Inicio Automático para Windows (ngrok + n8n)
.DESCRIPTION
    Configura variables de entorno, levanta el túnel ngrok, extrae la URL HTTPS pública,
    configura WEBHOOK_URL para n8n e inicia la aplicación.
#>

param (
    [switch]$Docker
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
Set-Location $RootDir

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  ____       _ _                     ____        _   " -ForegroundColor Cyan
Write-Host " |  _ \  ___| (_)_   _____ _ __ _   | __ )  ___ | |_ " -ForegroundColor Cyan
Write-Host " | | | |/ _ \ | \ \ / / _ \ '__| | | |  _ \ / _ \| __|" -ForegroundColor Cyan
Write-Host " | |_| |  __/ | |\ V /  __/ |  |_| | |_) | (_) | |_ " -ForegroundColor Cyan
Write-Host " |____/ \___|_|_| \_/ \___|_|   \__, |____/ \___/ \__|" -ForegroundColor Cyan
Write-Host "                                |___/                 " -ForegroundColor Cyan
Write-Host "  DeliveryBot Windows Launcher - n8n + Telegram + ngrok" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Verificar archivo .env
$EnvFile = Join-Path $RootDir ".env"
$EnvExample = Join-Path $RootDir ".env.example"

if (-not (Test-Path $EnvFile)) {
    Write-Host "[!] No se encontro .env. Creando copia desde .env.example..." -ForegroundColor Yellow
    Copy-Item $EnvExample $EnvFile
    Write-Host "[OK] Archivo .env creado. Por favor editalo con tus tokens." -ForegroundColor Green
}

# Cargar variables de entorno desde .env
Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line.Split("=", 2)
        if ($parts.Length -eq 2) {
            $key = $parts[0].Trim()
            $val = $parts[1].Trim().Trim('"').Trim("'")
            [Environment]::SetEnvironmentVariable($key, $val, "Process")
        }
    }
}

$N8nPort = if ($env:N8N_PORT) { $env:N8N_PORT } else { "5678" }

# 2. Verificar dependencias de Windows
Write-Host "`n[*] Verificando herramientas en Windows..." -ForegroundColor Blue

$ngrokCmd = Get-Command "ngrok" -ErrorAction SilentlyContinue
if (-not $ngrokCmd) {
    Write-Host "[X] ngrok no esta instalado o no se encuentra en el PATH del sistema." -ForegroundColor Red
    Write-Host "    Descargalo desde: https://ngrok.com/download o con: winget install ngrok" -ForegroundColor Yellow
    Exit 1
}
Write-Host "[OK] ngrok detectado correctamente." -ForegroundColor Green

# Configurar authtoken de ngrok si se especificó
if ($env:NGROK_AUTHTOKEN -and $env:NGROK_AUTHTOKEN -ne "tu_authtoken_de_ngrok_aqui") {
    Write-Host "[*] Registrando authtoken de ngrok..." -ForegroundColor Blue
    & ngrok config add-authtoken $env:NGROK_AUTHTOKEN | Out-Null
}

# 3. Iniciar ngrok en segundo plano
Write-Host "`n[*] Iniciando tunel seguro ngrok en el puerto $N8nPort..." -ForegroundColor Blue

# Detener procesos previos de ngrok
Get-Process -Name "ngrok" -ErrorAction SilentlyContinue | Stop-Process -Force

$ngrokProcess = Start-Process -FilePath "ngrok" -ArgumentList "http", $N8nPort, "--log=stdout" -PassThru -WindowStyle Hidden

# 4. Esperar a que la API de ngrok devuelva la URL pública
Write-Host "[*] Esperando a que el tunel ngrok este activo..." -ForegroundColor Yellow
$publicUrl = ""
$retries = 20

for ($i = 0; $i -lt $retries; $i++) {
    Start-Sleep -Seconds 1
    try {
        $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($tunnels -and $tunnels.tunnels -and $tunnels.tunnels.Count -gt 0) {
            $httpsTunnel = $tunnels.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
            if ($httpsTunnel) {
                $publicUrl = $httpsTunnel.public_url
                break
            }
        }
    } catch {
        # Esperar reintento
    }
}

if (-not $publicUrl) {
    Write-Host "[X] No se pudo obtener la URL publica de ngrok." -ForegroundColor Red
    if ($ngrokProcess) { Stop-Process -Id $ngrokProcess.Id -Force }
    Exit 1
}

Write-Host "[OK] Tunel ngrok establecido exitosamente!" -ForegroundColor Green
Write-Host "URL Publica HTTPS: $publicUrl" -ForegroundColor Cyan

# Exportar variables para n8n
$env:WEBHOOK_URL = "$publicUrl/"
$env:N8N_PORT = $N8nPort
$env:N8N_DEFAULT_BINARY_DATA_MODE = "filesystem"

Write-Host "`n======================================================================" -ForegroundColor Green
Write-Host "  PANEL DE CONTROL DELIVERYBOT (WINDOWS)" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "  n8n Webhook URL:    $publicUrl/"
Write-Host "  n8n Local Web UI:   http://localhost:$N8nPort/"
Write-Host "  ngrok Dashboard:    http://127.0.0.1:4040"
Write-Host "  Google Sheet ID:    $env:GOOGLE_SHEET_ID"
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "[i] Presiona Ctrl + C para detener todo el sistema.`n" -ForegroundColor Yellow

try {
    if ($Docker) {
        Write-Host "[*] Iniciando con Docker Compose..." -ForegroundColor Blue
        docker compose up
    } else {
        Write-Host "[*] Iniciando n8n en Windows..." -ForegroundColor Blue
        $globalN8n = Get-Command "n8n" -ErrorAction SilentlyContinue
        if ($globalN8n) {
            & n8n start
        } else {
            & npx --yes n8n start
        }
    }
} finally {
    Write-Host "`n[*] Deteniendo procesos de ngrok..." -ForegroundColor Yellow
    if ($ngrokProcess -and -not $ngrokProcess.HasExited) {
        Stop-Process -Id $ngrokProcess.Id -Force
    }
    Get-Process -Name "ngrok" -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "[OK] Sistema detenido limpiamente." -ForegroundColor Green
}

