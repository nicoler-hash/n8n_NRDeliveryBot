# DeliveryBot — Terminal de Pedidos Inteligente para Cafeterías Institucionales

Automatización basada en **n8n** que convierte **Telegram** en una terminal de pedidos con interpretación de lenguaje natural (**Google Gemini**), inventario y pedidos centralizados en **Google Sheets**, y reportes diarios automáticos.

---

## 1. Arquitectura general

```
Telegram (usuario) ──▶ Telegram Trigger ──▶ Normalizar Evento ──▶ Buscar/Crear Usuario
        ▲                                                              │
        │                                                        Obtener Sesión + Menú
        │                                                              │
        │                                                     Agente IA (Gemini) — NLU
        │                                                              │
        │                                                    Enrutar por Intención (Switch)
        │                          ┌───────────────┬───────────────┬───────────────┬──────────────┐
        │                    Agregar Item    Confirmar Pedido   Ver Estado    Ver Historial   Otras (menú, saludo,
        │                          │                 │               │              │          carrito, ayuda, cancelar)
        │                          │            Genera id_pedido     │              │               │
        │                          │            Registra en PEDIDOS  │              │               │
        │                          │            Descuenta STOCK      │              │               │
        │                          │            Notifica a Cocina    │              │               │
        │                          └─────────────────┴───────────────┴──────────────┴───────────────┘
        │                                                Guardar Estado de Sesión
        └──────────────────────────────────────────────── Responder al Usuario

Cron diario 22:00 ──▶ Leer PEDIDOS del día ──▶ Calcular métricas ──▶ Enviar Reporte al Admin (Telegram)
```

El workflow queda **en bucle conversacional**: cada mensaje del usuario dispara el `Telegram Trigger` de nuevo; el "estado" de cada usuario (pantalla actual + carrito temporal) se persiste en la hoja `SESSIONS`, así que la conversación es *stateless* a nivel de n8n pero *stateful* a nivel de datos — soporta múltiples usuarios concurrentes sin mezclarse.

---

## 2. Componentes del flujo (un solo workflow, dos triggers)

### A. Flujo conversacional (Telegram Trigger)
1. **Telegram Trigger** — escucha mensajes y `callback_query` (botones).
2. **Normalizar Evento** (Code) — unifica mensaje de texto y callback en una sola estructura.
3. **Buscar Usuario** (Google Sheets) → **¿Usuario Nuevo?** (If) → **Registrar Usuario Nuevo** si no existe.
4. **Obtener Sesión** / **Releer Sesión Actualizada** (Google Sheets, hoja `SESSIONS`) — recupera `pantalla_actual` y `carrito_temporal`; si el usuario es nuevo, se usan valores por defecto.
5. **Leer Menú Completo** (Google Sheets, hoja `MENU`).
6. **Construir Contexto** (Code) — combina evento + sesión + menú en un solo JSON.
7. **Agente IA (Gemini) — Interprete NLU** (`@n8n/n8n-nodes-langchain.agent` + `lmChatGoogleGemini`) — recibe el mensaje en lenguaje natural, el menú vigente (con stock) y el carrito actual, y devuelve **JSON estricto** con: `intent`, `categoria`, `items_a_agregar`, `respuesta_texto`, `siguiente_pantalla`. Aquí es donde el usuario puede escribir *"quiero 2 cafés y una empanada"* sin usar botones.
8. **Parsear Respuesta IA** (Code) — parseo seguro del JSON (blindado contra fences ```json y errores).
9. **Enrutar por Intención** (Switch) con 5 salidas:
   - **Agregar Item** → `Calcular Carrito y Validar Stock` (valida stock contra `MENU` antes de aceptar).
   - **Confirmar Pedido** → `Generar N° Orden y Total` → `¿Pedido Válido?` →
     - Sí: `Registrar Pedido en Sheet` (hoja `PEDIDOS`, estado inicial `Recibido`) **en paralelo con** `Dividir Items para Descuento Stock` → `Leer Stock Actual` → `Actualizar Stock`; y `Vaciar Carrito en Sesión` → `Notificar a Cocina`.
     - No (carrito vacío): mensaje de aviso.
   - **Ver Estado** → busca el pedido más reciente del usuario en `PEDIDOS` y responde con emoji según el estado (`Recibido / Preparación / En camino / Entregado`).
   - **Ver Historial** → últimos 5 pedidos del usuario.
   - **Otras** (fallback) → maneja `SALUDO`, `VER_MENU`, `VER_CATEGORIA`, `VER_CARRITO`, `CANCELAR_PEDIDO`, `AYUDA`, `DESCONOCIDO`.
10. **Guardar Estado de Sesión** (Google Sheets, `SESSIONS`) — persiste `pantalla_actual` y `carrito_temporal` actualizados.
11. **Responder al Usuario** (Telegram) — cierra el ciclo; el bot queda a la espera del siguiente mensaje (bucle natural vía el Trigger).

### B. Flujo de reportes (Schedule Trigger, diario a las 22:00)
1. **Disparador Diario 22:00** (Cron, editable).
2. **Leer Todos los Pedidos** (Google Sheets, `PEDIDOS`).
3. **Calcular Métricas del Día** (Code) — filtra pedidos de la fecha actual y calcula: total vendido, producto más vendido (producto estrella) y hora pico de pedidos.
4. **Enviar Reporte al Admin** (Telegram) — envía el resumen al chat del administrador.

---

## 3. Modelo de datos (Google Sheets — `DeliveryBot_DB`)

Usa el Apps Script que ya tienes (`setupDeliveryBotDB`) para poblar las 4 hojas con datos de prueba. Estructura exacta que consume el workflow:

| Hoja | Columnas |
|---|---|
| `MENU` | `id_producto`, `nombre`, `descripcion`, `precio`, `categoria`, `stock` |
| `PEDIDOS` | `id_pedido`, `id_usuario`, `detalles_pedido` (JSON string), `total_pago`, `estado`, `fecha`, `hora` |
| `USUARIOS` | `telegram_id`, `nombre_completo`, `departamento/oficina`, `puntos_lealtad` |
| `SESSIONS` | `telegram_id`, `pantalla_actual`, `carrito_temporal` (JSON string), `ultimo_cambio` |

**Importante:** los nodos de Google Sheets usan `id_producto`, `telegram_id` como columnas de coincidencia (`matchingColumns`) para actualizar filas — asegúrate de que esas columnas no tengan valores duplicados.

**Estados válidos del pedido:** `Recibido` → `Preparación` → `En camino` → `Entregado`. El cambio de estado lo hace el administrador **manualmente en la hoja `PEDIDOS`** en esta versión (columna `estado`). Ver sección 6 para la extensión de notificación automática al cambiar estado.

---

## 4. Configuración paso a paso

### 4.1 Prerrequisitos
- Cuenta de n8n (cloud o self-hosted) con acceso a `@n8n/n8n-nodes-langchain` (viene por defecto en n8n ≥ 1.19).
- Un bot de Telegram para clientes (vía **@BotFather**) → token.
- (Opcional pero recomendado) un **segundo bot o el mismo bot con un chat de grupo de cocina** para las notificaciones de cocina.
- Una API Key de **Google Gemini** (Google AI Studio).
- El Google Sheet `DeliveryBot_DB` ya configurado con el Apps Script provisto.
- **ngrok** configurado con tu authtoken (`ngrok config add-authtoken <TOKEN>`).

### 4.2 Inicio Automático con ngrok y n8n (Local)
Para desarrollo y pruebas locales, Telegram requiere una URL pública HTTPS para recibir webhooks. Se incluye un script de inicio automático:

- **Opción 1 (Doble clic / CMD):** Ejecuta `iniciar.bat` (o `start.bat`).
- **Opción 2 (PowerShell):** Ejecuta `.\iniciar.ps1` (admite parámetros como `.\iniciar.ps1 -Port 5678`).

**¿Qué hace el script automáticamente?**
1. Inicia el túnel seguro de `ngrok` en segundo plano apuntando al puerto de n8n (5678).
2. Consulta la API local de ngrok y extrae la URL pública HTTPS activa (ej: `https://xxxx.ngrok-free.app/`).
3. Asigna la variable de entorno `WEBHOOK_URL` requerida por n8n.
4. Inicia el servidor de `n8n`.
5. Al presionar `Ctrl+C`, detiene n8n y apaga el proceso de ngrok automáticamente.

### 4.3 Importar el workflow
1. En n8n: **Workflows → Import from File** → selecciona `DeliveryBot_Workflow.json`.
2. El workflow trae **IDs de credenciales de ejemplo** que debes reemplazar:

| Placeholder en el JSON | Qué hacer |
|---|---|
| `TELEGRAM_CRED_ID` / `DeliveryBot Telegram Bot` | Crea una credencial *Telegram API* con el token del bot de clientes y asígnala a los nodos `Telegram Trigger`, `Responder al Usuario`, `Enviar Reporte al Admin`. |
| `TELEGRAM_CRED_ID_COCINA` | Asigna la credencial del bot/chat de cocina al nodo `Notificar a Cocina` (puede ser la misma credencial si usas un solo bot con distinto `chat_id`). |
| `GEMINI_CRED_ID` | Crea una credencial *Google Gemini (PaLM) API* con tu API Key y asígnala al nodo `Google Gemini Chat Model`. |
| `GOOGLE_SHEETS_CRED_ID` | Crea una credencial *Google Sheets OAuth2* y asígnala a **todos** los nodos de Google Sheets (son 12). |
| `GOOGLE_SHEETS_DOCUMENT_ID` | Reemplaza en cada nodo de Google Sheets por el ID real de tu hoja `DeliveryBot_DB` (está en la URL del Sheet). |
| `ADMIN_CHAT_ID` | En el nodo `Enviar Reporte al Admin`, coloca el `chat_id` de Telegram del administrador (puede obtenerse hablándole al bot y consultando `getUpdates`, o con bots como @userinfobot). |

> Tip: en n8n puedes usar **Find/Replace** dentro del editor, o simplemente abrir cada nodo de Google Sheets y seleccionar el documento/hoja desde el selector visual — se autocompletará el `documentId` real.

### 4.4 Activar el workflow
- Activa el workflow (toggle superior derecho). El `Telegram Trigger` registrará el webhook automáticamente.
- El `Schedule Trigger` (reporte diario) queda activo con la expresión cron `0 22 * * *` (22:00 todos los días) — ajústala a tu horario de cierre.

### 4.5 Probar
1. Escribe `/start` o "hola" al bot → debe responder con saludo + menú.
2. Escribe `quiero 2 cafés americanos y una empanada de carne` → el bot debe agregar al carrito y mostrar el total.
3. Escribe `confirmar` → genera `id_pedido`, descuenta stock, registra en `PEDIDOS`, notifica a cocina.
4. Escribe `estado de mi pedido` → muestra el estado actual.
5. Cambia manualmente el `estado` en la hoja `PEDIDOS` (ej. a `Preparación`) y vuelve a preguntar el estado para verificar que se refleja.

---

## 5. Cálculo de precios e impuestos

El **Calculador de Precios** vive en el nodo `Calcular Carrito y Validar Stock` (suma `precio × cantidad` por ítem). Si tu institución requiere impuesto o descuento fijo, agrégalo así dentro de ese Code node, justo antes de calcular `total`:

```javascript
const IMPUESTO = 0.0; // ej. 0.19 para 19% IVA
const DESCUENTO = 0.0; // ej. 0.10 para 10% de descuento
const subtotal = carrito.reduce((sum, c) => sum + (c.precio * c.cantidad), 0);
const total = subtotal * (1 + IMPUESTO) * (1 - DESCUENTO);
```
Aplica el mismo ajuste en `Generar N° Orden y Total` para que el total registrado en `PEDIDOS` coincida con el mostrado en el carrito.

---

## 6. Extensiones sugeridas (no incluidas en esta versión, para roadmap)

- **Notificación automática al usuario cuando el admin cambia el estado**: agregar un segundo `Google Sheets Trigger` (poll) sobre la hoja `PEDIDOS` que detecte cambios en la columna `estado` y dispare un mensaje de Telegram al `id_usuario` correspondiente.
- **Botones inline** en vez de solo texto libre, combinando `reply_markup` de Telegram con el mismo motor de intención (el flujo ya soporta `callback_query`).
- **Puntos de lealtad**: sumar puntos en `USUARIOS` cada vez que se confirma un pedido.

---

## 7. Resultados esperados del sistema

- **Cero pérdida de pedidos**: cada confirmación se escribe de inmediato en `PEDIDOS` antes de responder al usuario.
- **Transparencia de estado**: el usuario puede consultar en cualquier momento la fase de su pedido (`Recibido → Preparación → En camino → Entregado`).
- **Inteligencia de negocio**: el reporte diario automático entrega total vendido, producto estrella y hora pico sin intervención manual.
- **Reducción de fricción operativa**: el `Agente IA (Gemini)` permite pedidos en lenguaje natural, reduciendo errores de navegación por menús rígidos.

---

## 8. Archivos de esta entrega

- `DeliveryBot_Workflow.json` — workflow único importable a n8n (33 nodos, 2 triggers).
- `README.md` — este documento.
- Apps Script de inicialización del Google Sheet: el que ya tienes (`setupDeliveryBotDB`), sin cambios necesarios.
