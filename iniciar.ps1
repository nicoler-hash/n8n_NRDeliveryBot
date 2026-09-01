<#
.SYNOPSIS
    Script de inicio automatizado para NRDeliveryBot (n8n + ngrok).
.DESCRIPTION
    Inicia un tunel seguro de ngrok en segundo plano, obtiene la URL publica HTTPS
    automaticamente, configura la variable WEBHOOK_URL para n8n y arranca la aplicacion.
    Al detener n8n (Ctrl+C), ngrok se cierra de manera limpia y automatica.
.PARAMETER Port
    Puerto local en el que escucha n8n (por defecto: 5678).
.PARAMETER Domain
    Dominio estatico o reservado opcional de ngrok (ej: mi-bot.ngrok-free.app).
#>

[CmdletBinding()]
param(
    [int]$Port = 5678,
    [string]$Domain = ""
)

function Write-Header {
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host "          [+] NRDeliveryBot - Inicio con ngrok + n8n             " -ForegroundColor Cyan
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Show-ErrorAndExit([string]$Message) {
    Write-Host ""
    Write-Host " [ERROR] $Message" -ForegroundColor Red
    Write-Host " Presiona cualquier tecla para salir..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

function Free-Port([int]$PortToFree) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $PortToFree -State Listen -ErrorAction SilentlyContinue
        if ($connections) {
            foreach ($conn in $connections) {
                $pidToKill = $conn.OwningProcess
                if ($pidToKill -and $pidToKill -gt 0) {
                    $p = Get-Process -Id $pidToKill -ErrorAction SilentlyContinue
                    if ($p) {
                        Write-Host " [i] Liberando puerto $PortToFree ocupado por '$($p.ProcessName)' (PID $pidToKill)..." -ForegroundColor DarkYellow
                        Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                    }
                }
            }
            Start-Sleep -Seconds 1
        }
    }
    catch {
        # Ignorar si no se tienen permisos especiales o no hay conexiones
    }
}

Write-Header

# 1. Verificar herramientas necesarias
Write-Host " [*] Verificando requisitos del sistema..." -ForegroundColor Yellow

$ngrokCmd = Get-Command ngrok -ErrorAction SilentlyContinue
if (-not $ngrokCmd) {
    Show-ErrorAndExit "ngrok no esta instalado o no se encuentra en el PATH del sistema.`n Instalalo desde https://ngrok.com/download"
}

$n8nCmd = Get-Command n8n -ErrorAction SilentlyContinue
if (-not $n8nCmd) {
    Show-ErrorAndExit "n8n no esta instalado o no se encuentra en el PATH del sistema.`n Instalalo con 'npm install -g n8n' o revisa tu instalacion de Node.js."
}

Write-Host "   [OK] ngrok detectado: $($ngrokCmd.Source)" -ForegroundColor Green
Write-Host "   [OK] n8n detectado:   $($n8nCmd.Source)" -ForegroundColor Green

# 2. Limpiar procesos previos y liberar puertos
$existingNgrok = Get-Process -Name "ngrok" -ErrorAction SilentlyContinue
if ($existingNgrok) {
    Write-Host " [i] Se encontraron procesos previos de ngrok. Reiniciando..." -ForegroundColor DarkYellow
    Stop-Process -Name "ngrok" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# Liberar el puerto de n8n si una instancia anterior quedó abierta
Free-Port -PortToFree $Port

# 3. Iniciar ngrok en segundo plano
Write-Host ""
Write-Host " [*] Iniciando tunel ngrok para el puerto $Port..." -ForegroundColor Yellow

$ngrokArgs = @("http", "$Port")
if ($Domain -ne "") {
    $ngrokArgs += @("--domain", "$Domain")
}

$ngrokProc = $null
try {
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = $ngrokCmd.Source
    $pinfo.Arguments = ($ngrokArgs -join " ")
    $pinfo.UseShellExecute = $false
    $pinfo.CreateNoWindow = $true
    $pinfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    
    $ngrokProc = [System.Diagnostics.Process]::Start($pinfo)
}
catch {
    Show-ErrorAndExit "No se pudo iniciar el proceso de ngrok: $_"
}

# 4. Esperar a que la API de ngrok este disponible y obtener la URL publica
Write-Host " [*] Esperando conexion y resolviendo URL publica..." -ForegroundColor DarkGray
$maxRetries = 20
$retryCount = 0
$publicUrl = $null

while ($retryCount -lt $maxRetries) {
    Start-Sleep -Milliseconds 750
    $retryCount++
    
    # Verificar que el proceso sigue vivo
    if ($ngrokProc.HasExited) {
        Show-ErrorAndExit "El proceso de ngrok se cerro inesperadamente. Verifica tu authtoken de ngrok ejecutando 'ngrok config check'."
    }
    
    try {
        $tunnelData = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2 -ErrorAction Stop
        if ($tunnelData -and $tunnelData.tunnels -and $tunnelData.tunnels.Count -gt 0) {
            # Preferir https
            $httpsTunnel = $tunnelData.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
            if ($httpsTunnel) {
                $publicUrl = $httpsTunnel.public_url
            } else {
                $publicUrl = $tunnelData.tunnels[0].public_url
            }
            break
        }
    }
    catch {
        # Esperando a que el daemon ngrok responda en 127.0.0.1:4040
    }
}

if (-not $publicUrl) {
    if ($ngrokProc -and -not $ngrokProc.HasExited) {
        Stop-Process -Id $ngrokProc.Id -Force -ErrorAction SilentlyContinue
    }
    Show-ErrorAndExit "No se pudo obtener la URL publica de ngrok despues de varios intentos."
}

# Asegurar trailing slash en la URL para n8n
if (-not $publicUrl.EndsWith("/")) {
    $publicUrl = "$publicUrl/"
}

# 5. Configurar variables de entorno para n8n
$env:WEBHOOK_URL = $publicUrl
$env:N8N_PORT = "$Port"

# 6. Mostrar panel informativo
Write-Host ""
Write-Host "+----------------------------------------------------------------------+" -ForegroundColor Green
Write-Host "|                 ENTORNO CONFIGURADO EXITOSAMENTE                     |" -ForegroundColor Green
Write-Host "+----------------------------------------------------------------------+" -ForegroundColor Green
Write-Host "|                                                                      |" -ForegroundColor Green
Write-Host "|  [+] URL Local n8n:       http://localhost:$Port" -ForegroundColor White
Write-Host "|  [+] URL Publica (ngrok): $publicUrl" -ForegroundColor Cyan
Write-Host "|  [+] Panel ngrok:         http://127.0.0.1:4040                      |" -ForegroundColor DarkGray
Write-Host "|                                                                      |" -ForegroundColor Green
Write-Host "|  [*] Variable WEBHOOK_URL asignada automaticamente a n8n.            |" -ForegroundColor Yellow
Write-Host "|  [*] Telegram Trigger y Webhooks funcionaran automaticamente.        |" -ForegroundColor Yellow
Write-Host "+----------------------------------------------------------------------+" -ForegroundColor Green
Write-Host ""
Write-Host " [INFO] Para detener n8n y cerrar el tunel ngrok, presiona Ctrl+C" -ForegroundColor DarkYellow
Write-Host " ----------------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# 7. Iniciar n8n y asegurar limpieza al salir
try {
    & n8n start
}
catch {
    Write-Host "`n [AVISO] Sesion de n8n finalizada." -ForegroundColor Yellow
}
finally {
    Write-Host "`n [*] Limpiando recursos y cerrando ngrok..." -ForegroundColor Yellow
    if ($ngrokProc -and -not $ngrokProc.HasExited) {
        Stop-Process -Id $ngrokProc.Id -Force -ErrorAction SilentlyContinue
    }
    Get-Process -Name "ngrok" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host " [OK] Tunel cerrado correctamente.`n" -ForegroundColor Green
}
