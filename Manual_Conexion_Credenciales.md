# Manual: Obtención de API Keys y Conexión de Credenciales

Guía paso a paso para conectar **Telegram**, **Google Gemini** y **Google Sheets** al workflow `DeliveryBot_Workflow.json` en n8n.

---

## 1. Telegram — crear el bot y obtener el token

### 1.1 Crear el bot con BotFather
1. Abre Telegram y busca **@BotFather** (cuenta oficial verificada).
2. Envía el comando `/newbot`.
3. Elige un **nombre visible** para el bot (ej. "Cafetería Central").
4. Elige un **username** único terminado en `bot` (ej. `CafeteriaCentralBot`).
5. BotFather responderá con un mensaje que incluye tu **token**, con este formato:
   ```
   123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
6. **Guarda ese token** — es la única vez que se muestra completo tan fácilmente (puedes regenerarlo después con `/revoke` si lo pierdes).

### 1.2 (Opcional pero recomendado) Bot o chat separado para cocina
Tienes dos opciones:
- **Reutilizar el mismo bot**: crea un grupo de Telegram con el personal de cocina, agrega el bot a ese grupo, y usa el `chat_id` del grupo en el nodo `Notificar a Cocina`.
- **Crear un segundo bot** exclusivo para cocina repitiendo el paso 1.1.

### 1.3 Obtener el `chat_id` (necesario para `ADMIN_CHAT_ID` y el grupo de cocina)
1. Envía cualquier mensaje al bot (o agrégalo al grupo y escribe algo ahí).
2. Abre en el navegador:
   ```
   https://api.telegram.org/bot<TU_TOKEN>/getUpdates
   ```
3. Busca el campo `"chat":{"id": ... }` en la respuesta JSON — ese número es el `chat_id`.
   - Para chats individuales es un número positivo.
   - Para grupos suele ser un número **negativo** (ej. `-4021xxxxx`).
4. Alternativa más simple: habla con el bot **@userinfobot** o **@getidsbot** desde la cuenta del administrador para obtener tu propio `chat_id` sin tocar la API.

### 1.4 Cargar el token en n8n
1. En n8n: **Credentials → Create New → Telegram API**.
2. Pega el **Access Token** obtenido de BotFather.
3. Guarda la credencial (ej. como "DeliveryBot Telegram Bot").
4. Asigna esta credencial a los nodos: `Telegram Trigger`, `Responder al Usuario`, `Enviar Reporte al Admin` (y `Notificar a Cocina` si usas el mismo bot).

---

## 2. Google Gemini — obtener la API Key

### 2.1 Generar la clave en Google AI Studio
1. Ve a **aistudio.google.com/apikey** (o `aistudio.google.com/app/apikey`) e inicia sesión con tu cuenta de Google.
2. Haz clic en **Create API key** (Crear clave de API).
3. Google AI Studio crea automáticamente un proyecto de Google Cloud si no tienes uno — no necesitas configurarlo manualmente.
4. Copia la clave generada (formato similar a `AIzaSy...`). Guárdala en un lugar seguro; no vuelve a mostrarse completa después.

> **Nota:** Google está retirando el formato antiguo de claves "Standard" sin restricciones. Si al abrir tu página de claves ves una etiqueta "Standard", genera una nueva clave — las nuevas se crean automáticamente como "auth key" y funcionan sin configuración adicional.

### 2.2 Nivel gratuito
- El plan gratuito de Gemini (modelos Flash) no requiere tarjeta de crédito ni facturación activada.
- Si necesitas más cuota, activa facturación desde la misma página de claves de AI Studio ("Set up billing").

### 2.3 Cargar la clave en n8n
1. En n8n: **Credentials → Create New** → busca **Google Gemini(PaLM) Api** (nombre de la credencial que usa el nodo `lmChatGoogleGemini`).
2. Pega la API Key copiada en el paso 2.1.
3. Guarda la credencial (ej. como "DeliveryBot Gemini API").
4. Asígnala al nodo **Google Gemini Chat Model** del workflow.
5. El modelo configurado por defecto en el workflow es `models/gemini-2.5-flash` (rápido y con cuota gratuita generosa). Puedes cambiarlo directamente en el nodo si prefieres otro modelo disponible en tu cuenta.

---

## 3. Google Sheets — conectar el spreadsheet `DeliveryBot_DB`

Hay dos caminos según dónde corra tu n8n:

### Opción A — n8n Cloud (la más simple)
1. En n8n: **Credentials → Create New → Google Sheets OAuth2 API**.
2. Verás un botón **"Sign in with Google"** (OAuth administrado por n8n) — haz clic ahí.
3. Elige la cuenta de Google dueña (o con acceso de edición) del spreadsheet `DeliveryBot_DB` y autoriza los permisos.
4. Listo — no necesitas tocar Google Cloud Console.

### Opción B — n8n autoalojado (self-hosted): OAuth2 personalizado
Necesario porque el OAuth administrado de n8n Cloud no está disponible en instancias self-hosted.

1. **Crear proyecto en Google Cloud Console**
   - Ve a `console.cloud.google.com` → crea un nuevo proyecto (o usa uno existente).
2. **Habilitar las APIs necesarias**
   - Menú → **APIs y servicios → Biblioteca**.
   - Busca y habilita **Google Sheets API**.
   - Busca y habilita también **Google Drive API** (necesaria para que Sheets resuelva permisos y metadatos del archivo; si no la habilitas, las lecturas fallan silenciosamente).
3. **Configurar la pantalla de consentimiento OAuth**
   - Menú → **APIs y servicios → Pantalla de consentimiento de OAuth**.
   - Tipo de usuario: **Externo** (para poder usar cualquier cuenta de Gmail).
   - Completa nombre de la app, correo de soporte y correo de contacto del desarrollador.
   - En **Usuarios de prueba**, agrega el correo de la cuenta que administrará el Sheet (mientras la app no esté publicada/verificada).
4. **Obtener la URL de redirección desde n8n primero**
   - En n8n: **Credentials → Create New → Google Sheets OAuth2 API** → cambia el tipo de autenticación a **Custom OAuth2** (si aparece la opción) o simplemente abre el modal — n8n mostrará el **Redirect URL**, con este formato:
     ```
     https://TU-DOMINIO-N8N/rest/oauth2-credential/callback
     ```
     (o `http://localhost:5678/rest/oauth2-credential/callback` si corres n8n localmente).
   - Copia esa URL exacta.
5. **Crear las credenciales OAuth en Google Cloud Console**
   - Menú → **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - Nombre: algo descriptivo (ej. "n8n DeliveryBot").
   - En **URIs de redirección autorizados**, pega exactamente la URL copiada en el paso 4.
   - Haz clic en **Crear** → Google te mostrará el **Client ID** y **Client Secret**.
6. **Completar la credencial en n8n**
   - Vuelve al modal de la credencial en n8n.
   - Pega **Client ID** y **Client Secret**.
   - Haz clic en **Connect / Sign in with Google** dentro del propio modal de n8n y autoriza con la cuenta agregada como usuario de prueba.
   - Guarda la credencial (ej. como "DeliveryBot Google Sheets").

### 3.1 Asignar la credencial y el documento en el workflow
1. Abre cualquier nodo de Google Sheets del workflow (hay 12 en total) y selecciona la credencial creada.
2. En el campo **Document** (`documentId`), reemplaza el placeholder `GOOGLE_SHEETS_DOCUMENT_ID` seleccionando tu hoja `DeliveryBot_DB` desde el selector visual (o pega el ID que aparece en la URL del Sheet, entre `/d/` y `/edit`).
3. Repite en los 12 nodos: `Buscar Usuario`, `Registrar Usuario Nuevo`, `Obtener Sesión`, `Releer Sesión Actualizada`, `Leer Menú Completo`, `Registrar Pedido en Sheet`, `Leer Stock Actual del Producto`, `Actualizar Stock`, `Vaciar Carrito en Sesión`, `Buscar Pedidos del Usuario (Estado)`, `Buscar Historial de Pedidos`, `Guardar Estado de Sesión`, `Leer Todos los Pedidos`.
   - Tip: si todos apuntan al mismo documento, puedes seleccionar el documento en un nodo y copiar/pegar ese nodo para los demás, o usar la función de **Find/Replace** del editor de n8n para agilizar el reemplazo del ID.

### 3.2 Errores comunes
| Error | Causa típica | Solución |
|---|---|---|
| `redirect_uri_mismatch` | La URL pegada en Google Cloud no coincide exactamente con la de n8n | Cópiala de nuevo desde el modal de n8n, sin espacios, respetando `http` vs `https` |
| `invalid_client` | Client ID o Secret mal copiados | Vuelve a copiar ambos valores desde Google Cloud Console |
| `403 access_denied` | Tu cuenta no está en la lista de usuarios de prueba | Agrégala en **Pantalla de consentimiento → Usuarios de prueba** |
| Los nodos leen pero no escriben | Falta habilitar **Google Drive API** | Habilítala en la Biblioteca de APIs |

---

## 4. Checklist final antes de activar el workflow

- [ ] Token de Telegram cargado y probado (`getUpdates` responde).
- [ ] `chat_id` del administrador y de cocina identificados.
- [ ] API Key de Gemini cargada y modelo `gemini-2.5-flash` (o el que elijas) seleccionado.
- [ ] Credencial de Google Sheets conectada (OAuth exitoso).
- [ ] `GOOGLE_SHEETS_DOCUMENT_ID` reemplazado en los 12 nodos de Sheets.
- [ ] `ADMIN_CHAT_ID` reemplazado en el nodo `Enviar Reporte al Admin`.
- [ ] Workflow activado (toggle en n8n).
- [ ] Prueba end-to-end: saludo → agregar producto → confirmar → notificación a cocina → consulta de estado.
