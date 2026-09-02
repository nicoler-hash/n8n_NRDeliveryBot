#!/usr/bin/env bash
# ==============================================================================
# DeliveryBot - Script de Inicio Automático para Linux (ngrok + n8n)
# ==============================================================================
set -e

# Colores para la terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo -e "${CYAN}${BOLD}"
echo "  ____       _ _                     ____        _   "
echo " |  _ \  ___| (_)_   _____ _ __ _   | __ )  ___ | |_ "
echo " | | | |/ _ \ | \ \ / / _ \ '__| | | |  _ \ / _ \| __|"
echo " | |_| |  __/ | |\ V /  __/ |  |_| | |_) | (_) | |_ "
echo " |____/ \___|_|_| \_/ \___|_|   \__, |____/ \___/ \__|"
echo "                                |___/                 "
echo -e "${NC}"
echo -e "${BLUE}▶ Cafetería Interna - Gestión Inteligente de Pedidos con Telegram y n8n${NC}"
echo "----------------------------------------------------------------------"

# 1. Verificar archivo de entorno (.env)
cd "${ROOT_DIR}"
if [ ! -f .env ]; then
  echo -e "${YELLOW}⚠️  No se encontró el archivo .env. Creando a partir de .env.example...${NC}"
  cp .env.example .env
  echo -e "${GREEN}✅ Archivo .env generado.${NC}"
  echo -e "${RED}${BOLD}❗ ATENCIÓN: Edita .env con tus tokens de Telegram y Google Sheets antes de continuar.${NC}"
fi

# Cargar variables de entorno
set -a
source .env
set +a

N8N_PORT="${N8N_PORT:-5678}"

# 2. Verificar dependencias del sistema en Linux
echo -e "\n${BLUE}🔍 Verificando herramientas en Linux...${NC}"

if ! command -v ngrok &> /dev/null; then
  echo -e "${RED}❌ ngrok no está instalado o no está en el PATH.${NC}"
  echo -e "   Instálalo con: ${CYAN}curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null && echo \"deb https://ngrok-agent.s3.amazonaws.com buster main\" | sudo tee /etc/apt/sources.list.d/ngrok.list && sudo apt update && sudo apt install ngrok${NC}"
  exit 1
fi
echo -e "${GREEN}✅ ngrok detectado: $(ngrok version)${NC}"

# Verificar si el authtoken de ngrok está configurado
if [ -n "${NGROK_AUTHTOKEN}" ] && [ "${NGROK_AUTHTOKEN}" != "tu_authtoken_de_ngrok_aqui" ]; then
  echo -e "${BLUE}🔑 Configurando authtoken de ngrok...${NC}"
  ngrok config add-authtoken "${NGROK_AUTHTOKEN}" > /dev/null 2>&1 || true
fi

# 3. Iniciar ngrok en segundo plano
echo -e "\n${BLUE}🌐 Iniciando túnel seguro ngrok en el puerto ${N8N_PORT}...${NC}"

# Matar instancias previas de ngrok huérfanas si existen
pkill -f "ngrok http" > /dev/null 2>&1 || true
sleep 1

# Iniciar ngrok
ngrok http "${N8N_PORT}" --log=stdout > /tmp/ngrok_deliverybot.log 2>&1 &
NGROK_PID=$!

# Función de limpieza al salir (Ctrl + C o término de script)
cleanup() {
  echo -e "\n${YELLOW}🛑 Deteniendo servicios de DeliveryBot...${NC}"
  if [ -n "${NGROK_PID}" ]; then
    kill "${NGROK_PID}" > /dev/null 2>&1 || true
  fi
  pkill -f "ngrok http" > /dev/null 2>&1 || true
  echo -e "${GREEN}✅ Procesos detenidos limpiamente. ¡Hasta pronto!${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 4. Esperar y extraer la URL HTTPS pública de ngrok
echo -e "${YELLOW}⏳ Esperando a que el túnel ngrok esté activo...${NC}"
PUBLIC_URL=""
for i in {1..20}; do
  sleep 1
  PUBLIC_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok-free\.app' | head -n 1 || true)
  if [ -z "${PUBLIC_URL}" ]; then
    PUBLIC_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok\.io' | head -n 1 || true)
  fi
  if [ -n "${PUBLIC_URL}" ]; then
    break
  fi
done

if [ -z "${PUBLIC_URL}" ]; then
  echo -e "${RED}❌ No se pudo obtener la URL de ngrok. Revisa /tmp/ngrok_deliverybot.log:${NC}"
  tail -n 15 /tmp/ngrok_deliverybot.log
  exit 1
fi

echo -e "${GREEN}${BOLD}🎉 ¡Túnel ngrok establecido exitosamente!${NC}"
echo -e "${CYAN}🌍 URL Pública HTTPS:${NC} ${BOLD}${PUBLIC_URL}${NC}"

# 5. Exportar variables para n8n
export WEBHOOK_URL="${PUBLIC_URL}/"
export N8N_PORT="${N8N_PORT}"
export N8N_DEFAULT_BINARY_DATA_MODE=filesystem

echo -e "\n${BOLD}======================================================================${NC}"
echo -e "${GREEN}${BOLD}🚀 PANEL DE CONTROL DELIVERYBOT${NC}"
echo -e "${BOLD}======================================================================${NC}"
echo -e "  📍 ${BOLD}n8n Webhook URL:${NC}    ${PUBLIC_URL}/"
echo -e "  💻 ${BOLD}n8n Local Web UI:${NC}   http://localhost:${N8N_PORT}/"
echo -e "  📊 ${BOLD}ngrok Dashboard:${NC}    http://127.0.0.1:4040"
echo -e "  🤖 ${BOLD}Bot Cliente:${NC}        ${TELEGRAM_CLIENT_BOT_TOKEN:0:10}... (Ver .env)"
echo -e "  👨‍🍳 ${BOLD}Bot Cocina:${NC}         ${TELEGRAM_KITCHEN_BOT_TOKEN:0:10}... (Ver .env)"
echo -e "  📋 ${BOLD}Google Sheet ID:${NC}    ${GOOGLE_SHEET_ID}"
echo -e "${BOLD}======================================================================${NC}"
echo -e "${BLUE}ℹ️  Presiona ${BOLD}Ctrl + C${NC}${BLUE} en cualquier momento para detener todo el sistema.${NC}\n"

# 6. Iniciar n8n
if [ "$1" == "--docker" ]; then
  echo -e "${BLUE}🐳 Iniciando DeliveryBot en modo Docker Compose...${NC}"
  docker compose up
else
  echo -e "${BLUE}⚡ Iniciando n8n en Linux...${NC}"
  if command -v n8n &> /dev/null; then
    n8n start
  else
    npx --yes n8n start
  fi
fi
