const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const workflowsDir = path.join(rootDir, 'workflows');
const codeNodesDir = path.join(workflowsDir, 'code_nodes');

const routerClientJs = fs.readFileSync(path.join(codeNodesDir, 'client_router.js'), 'utf8');
const clientLogicJs = fs.readFileSync(path.join(codeNodesDir, 'client_logic.js'), 'utf8');
const kitchenParseJs = fs.readFileSync(path.join(codeNodesDir, 'kitchen_parse.js'), 'utf8');
const kitchenPrepJs = fs.readFileSync(path.join(codeNodesDir, 'kitchen_prep.js'), 'utf8');
const biCalcJs = fs.readFileSync(path.join(codeNodesDir, 'bi_calc.js'), 'utf8');

// 1. WORKFLOW CLIENTE
const workflowCliente = {
  name: "DeliveryBot - 01 Cliente (Menú, Carrito y Pedidos)",
  nodes: [
    {
      parameters: {
        updates: ["message", "callback_query"],
        additionalFields: {}
      },
      id: "node-client-trigger",
      name: "Telegram Trigger Cliente",
      type: "n8n-nodes-base.telegramTrigger",
      typeVersion: 1.1,
      position: [200, 300],
      webhookId: "deliverybot-client-webhook",
      credentials: {
        telegramApi: {
          id: "cred-telegram-cliente",
          name: "Telegram Client Bot Token"
        }
      }
    },
    {
      parameters: {
        jsCode: routerClientJs.trim()
      },
      id: "node-client-router",
      name: "Router de Acciones Cliente",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [420, 300]
    },
    {
      parameters: {
        operation: "read",
        sheetId: "={{ $env.GOOGLE_SHEET_ID }}",
        sheetName: "MENU",
        options: {}
      },
      id: "node-read-menu",
      name: "Leer Catálogo MENU",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [660, 180],
      credentials: {
        googleSheetsOAuth2: {
          id: "cred-google-sheets",
          name: "Google Sheets Credential"
        }
      }
    },
    {
      parameters: {
        operation: "read",
        sheetId: "={{ $env.GOOGLE_SHEET_ID }}",
        sheetName: "SESSIONS",
        options: {}
      },
      id: "node-read-sessions",
      name: "Leer Sesión Carrito",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [660, 320],
      credentials: {
        googleSheetsOAuth2: {
          id: "cred-google-sheets",
          name: "Google Sheets Credential"
        }
      }
    },
    {
      parameters: {
        operation: "read",
        sheetId: "={{ $env.GOOGLE_SHEET_ID }}",
        sheetName: "PEDIDOS",
        options: {}
      },
      id: "node-read-orders",
      name: "Leer Órdenes PEDIDOS",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [660, 460],
      credentials: {
        googleSheetsOAuth2: {
          id: "cred-google-sheets",
          name: "Google Sheets Credential"
        }
      }
    },
    {
      parameters: {
        jsCode: clientLogicJs.trim()
      },
      id: "node-business-logic",
      name: "Lógica de Negocio y Carrito",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [900, 300]
    },
    {
      parameters: {
        chatId: "={{ $json.chatId }}",
        text: "={{ $json.responseMessage }}",
        additionalFields: {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: "={{ $json.inlineKeyboard }}"
          }
        }
      },
      id: "node-send-telegram-client",
      name: "Responder a Cliente Telegram",
      type: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [1140, 200],
      credentials: {
        telegramApi: {
          id: "cred-telegram-cliente",
          name: "Telegram Client Bot Token"
        }
      }
    },
    {
      parameters: {
        conditions: {
          boolean: [
            {
              value1: "={{ $json.orderCreated !== null }}",
              value2: true
            }
          ]
        }
      },
      id: "node-if-order-created",
      name: "¿Se Creó Pedido?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [1140, 400]
    },
    {
      parameters: {
        operation: "append",
        sheetId: "={{ $env.GOOGLE_SHEET_ID }}",
        sheetName: "PEDIDOS",
        columns: {
          mappingMode: "defineBelow",
          value: {
            id_pedido: "={{ $json.orderCreated.id_pedido }}",
            id_usuario: "={{ $json.orderCreated.id_usuario }}",
            detalles_pedido: "={{ $json.orderCreated.detalles_pedido }}",
            total_pago: "={{ $json.orderCreated.total_pago }}",
            direccion: "={{ $json.orderCreated.direccion }}",
            estado: "={{ $json.orderCreated.estado }}",
            fecha: "={{ $json.orderCreated.fecha }}",
            hora: "={{ $json.orderCreated.hora }}"
          }
        },
        options: {}
      },
      id: "node-save-order",
      name: "Registrar en PEDIDOS",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [1360, 400],
      credentials: {
        googleSheetsOAuth2: {
          id: "cred-google-sheets",
          name: "Google Sheets Credential"
        }
      }
    },
    {
      parameters: {
        chatId: "={{ $env.TELEGRAM_KITCHEN_CHAT_ID }}",
        text: "=🔔 *¡NUEVO PEDIDO RECIBIDO EN COCINA!*\n\n🔖 *Orden:* `{{ $json.kitchenAlert.orderId }}`\n👤 *Cliente:* {{ $json.kitchenAlert.customerName }} (`ID: {{ $json.kitchenAlert.customerId }}`)\n📍 *Dirección de Entrega:* {{ $json.kitchenAlert.address }}\n⏰ *Hora:* {{ $json.kitchenAlert.time }}\n💰 *Total:* ${{ $json.kitchenAlert.total }}\n\n📝 *Productos a preparar:*\n• {{ $json.kitchenAlert.details }}\n\n👇 *Actualizar Estado de la Orden:*",
        additionalFields: {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: "={{ [\n  [\n    { text: '👨‍🍳 En Preparación', callback_data: `status:${$json.kitchenAlert.orderId}:Preparación` },\n    { text: '🛵 En Camino', callback_data: `status:${$json.kitchenAlert.orderId}:En camino` }\n  ],\n  [\n    { text: '✅ Entregado', callback_data: `status:${$json.kitchenAlert.orderId}:Entregado` },\n    { text: '❌ Cancelar', callback_data: `status:${$json.kitchenAlert.orderId}:Cancelado` }\n  ]\n] }}"
          }
        }
      },
      id: "node-notify-kitchen-bot",
      name: "Alertar a Bot Cocina",
      type: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [1580, 400],
      credentials: {
        telegramApi: {
          id: "cred-telegram-cocina",
          name: "Telegram Kitchen Bot Token"
        }
      }
    }
  ],
  connections: {
    "Telegram Trigger Cliente": {
      main: [
        [{ node: "Router de Acciones Cliente", type: "main", index: 0 }]
      ]
    },
    "Router de Acciones Cliente": {
      main: [
        [
          { node: "Leer Catálogo MENU", type: "main", index: 0 },
          { node: "Leer Sesión Carrito", type: "main", index: 0 },
          { node: "Leer Órdenes PEDIDOS", type: "main", index: 0 }
        ]
      ]
    },
    "Leer Catálogo MENU": {
      main: [
        [{ node: "Lógica de Negocio y Carrito", type: "main", index: 0 }]
      ]
    },
    "Lógica de Negocio y Carrito": {
      main: [
        [
          { node: "Responder a Cliente Telegram", type: "main", index: 0 },
          { node: "¿Se Creó Pedido?", type: "main", index: 0 }
        ]
      ]
    },
    "¿Se Creó Pedido?": {
      main: [
        [{ node: "Registrar en PEDIDOS", type: "main", index: 0 }]
      ]
    },
    "Registrar en PEDIDOS": {
      main: [
        [{ node: "Alertar a Bot Cocina", type: "main", index: 0 }]
      ]
    }
  }
};

// 2. WORKFLOW COCINA
const workflowCocina = {
  name: "DeliveryBot - 02 Cocina (Gestión de Estados y Notificaciones)",
  nodes: [
    {
      parameters: {
        updates: ["callback_query", "message"],
        additionalFields: {}
      },
      id: "node-kitchen-trigger",
      name: "Telegram Trigger Cocina",
      type: "n8n-nodes-base.telegramTrigger",
      typeVersion: 1.1,
      position: [200, 300],
      webhookId: "deliverybot-kitchen-webhook",
      credentials: {
        telegramApi: {
          id: "cred-telegram-cocina",
          name: "Telegram Kitchen Bot Token"
        }
      }
    },
    {
      parameters: {
        jsCode: kitchenParseJs.trim()
      },
      id: "node-parse-kitchen-action",
      name: "Parsear Acción de Cocina",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [420, 300]
    },
    {
      parameters: {
        conditions: {
          boolean: [
            {
              value1: "={{ $json.isValid }}",
              value2: true
            }
          ]
        }
      },
      id: "node-if-valid-kitchen-action",
      name: "¿Acción Válida?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [640, 300]
    },
    {
      parameters: {
        operation: "read",
        sheetId: "={{ $env.GOOGLE_SHEET_ID }}",
        sheetName: "PEDIDOS",
        options: {}
      },
      id: "node-read-orders-for-update",
      name: "Consultar Pedido en Sheets",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [860, 240],
      credentials: {
        googleSheetsOAuth2: {
          id: "cred-google-sheets",
          name: "Google Sheets Credential"
        }
      }
    },
    {
      parameters: {
        jsCode: kitchenPrepJs.trim()
      },
      id: "node-prepare-status-update",
      name: "Preparar Mensajes y Estado",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1080, 240]
    },
    {
      parameters: {
        operation: "update",
        sheetId: "={{ $env.GOOGLE_SHEET_ID }}",
        sheetName: "PEDIDOS",
        columnToMatchOn: "id_pedido",
        valueToMatchOn: "={{ $json.orderId }}",
        fieldsUi: {
          fieldValues: [
            {
              fieldId: "estado",
              fieldValue: "={{ $json.newStatus }}"
            }
          ]
        },
        options: {}
      },
      id: "node-update-order-sheet",
      name: "Actualizar Estado en PEDIDOS",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [1300, 160],
      credentials: {
        googleSheetsOAuth2: {
          id: "cred-google-sheets",
          name: "Google Sheets Credential"
        }
      }
    },
    {
      parameters: {
        chatId: "={{ $json.clientUserId }}",
        text: "={{ $json.clientNotificationText }}",
        additionalFields: {
          parse_mode: "Markdown"
        }
      },
      id: "node-push-to-client",
      name: "Notificar Push al Cliente (Bot Cliente)",
      type: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [1300, 340],
      credentials: {
        telegramApi: {
          id: "cred-telegram-cliente",
          name: "Telegram Client Bot Token"
        }
      }
    }
  ],
  connections: {
    "Telegram Trigger Cocina": {
      main: [
        [{ node: "Parsear Acción de Cocina", type: "main", index: 0 }]
      ]
    },
    "Parsear Acción de Cocina": {
      main: [
        [{ node: "¿Acción Válida?", type: "main", index: 0 }]
      ]
    },
    "¿Acción Válida?": {
      main: [
        [{ node: "Consultar Pedido en Sheets", type: "main", index: 0 }]
      ]
    },
    "Consultar Pedido en Sheets": {
      main: [
        [{ node: "Preparar Mensajes y Estado", type: "main", index: 0 }]
      ]
    },
    "Preparar Mensajes y Estado": {
      main: [
        [
          { node: "Actualizar Estado en PEDIDOS", type: "main", index: 0 },
          { node: "Notificar Push al Cliente (Bot Cliente)", type: "main", index: 0 }
        ]
      ]
    }
  }
};

// 3. WORKFLOW REPORTES
const workflowReportes = {
  name: "DeliveryBot - 03 Reportes y Business Intelligence",
  nodes: [
    {
      parameters: {
        rule: {
          interval: [
            {
              field: "cronExpression",
              expression: "0 18 * * *"
            }
          ]
        }
      },
      id: "node-schedule-daily",
      name: "Cron Diario 18:00",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [200, 300]
    },
    {
      parameters: {
        operation: "read",
        sheetId: "={{ $env.GOOGLE_SHEET_ID }}",
        sheetName: "PEDIDOS",
        options: {}
      },
      id: "node-read-pedidos-report",
      name: "Leer Histórico PEDIDOS",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [420, 300],
      credentials: {
        googleSheetsOAuth2: {
          id: "cred-google-sheets",
          name: "Google Sheets Credential"
        }
      }
    },
    {
      parameters: {
        jsCode: biCalcJs.trim()
      },
      id: "node-calc-bi-report",
      name: "Cálculo de Métricas y BI",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [640, 300]
    },
    {
      parameters: {
        chatId: "={{ $env.TELEGRAM_KITCHEN_CHAT_ID }}",
        text: "={{ $json.reportMessage }}",
        additionalFields: {
          parse_mode: "Markdown"
        }
      },
      id: "node-send-telegram-report",
      name: "Enviar Reporte a Admin/Cocina",
      type: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [860, 300],
      credentials: {
        telegramApi: {
          id: "cred-telegram-cocina",
          name: "Telegram Kitchen Bot Token"
        }
      }
    }
  ],
  connections: {
    "Cron Diario 18:00": {
      main: [
        [{ node: "Leer Histórico PEDIDOS", type: "main", index: 0 }]
      ]
    },
    "Leer Histórico PEDIDOS": {
      main: [
        [{ node: "Cálculo de Métricas y BI", type: "main", index: 0 }]
      ]
    },
    "Cálculo de Métricas y BI": {
      main: [
        [{ node: "Enviar Reporte a Admin/Cocina", type: "main", index: 0 }]
      ]
    }
  }
};

// 4. WORKFLOW COMPLETO
const workflowCompleto = {
  name: "DeliveryBot - Solución Completa (Cliente, Cocina y Reportes)",
  nodes: [
    ...workflowCliente.nodes.map(n => ({ ...n, position: [n.position[0], n.position[1]] })),
    ...workflowCocina.nodes.map(n => ({ ...n, position: [n.position[0], n.position[1] + 400] })),
    ...workflowReportes.nodes.map(n => ({ ...n, position: [n.position[0], n.position[1] + 800] }))
  ],
  connections: {
    ...workflowCliente.connections,
    ...workflowCocina.connections,
    ...workflowReportes.connections
  }
};

fs.writeFileSync(path.join(workflowsDir, '01_deliverybot_cliente.json'), JSON.stringify(workflowCliente, null, 2));
fs.writeFileSync(path.join(workflowsDir, '02_deliverybot_cocina.json'), JSON.stringify(workflowCocina, null, 2));
fs.writeFileSync(path.join(workflowsDir, '03_deliverybot_reportes.json'), JSON.stringify(workflowReportes, null, 2));
fs.writeFileSync(path.join(workflowsDir, 'deliverybot_completo.json'), JSON.stringify(workflowCompleto, null, 2));

console.log('✅ Todos los workflows fueron generados con éxito y sintaxis válida.');
