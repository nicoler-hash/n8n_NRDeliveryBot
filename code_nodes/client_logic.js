// Procesador Central de Interfaz y Lógica de Negocio
const routerData = $('Router de Acciones Cliente').first().json;
const menuRows = $('Leer Catálogo MENU').all().map(i => i.json);
const sessionRows = $('Leer Sesión Carrito').all().map(i => i.json);
const orderRows = $('Leer Órdenes PEDIDOS').all().map(i => i.json);

const { action, chatId, userId, firstName, payload } = routerData;

let userSession = sessionRows.find(s => String(s.telegram_id) === String(userId));
let currentCart = [];
let currentAddress = '';
let currentScreen = 'MAIN_MENU';

if (userSession) {
  if (userSession.carrito_temporal) {
    try {
      currentCart = JSON.parse(userSession.carrito_temporal);
    } catch (e) {
      currentCart = [];
    }
  }
  if (userSession.direccion) {
    currentAddress = String(userSession.direccion).trim();
  }
  if (userSession.pantalla_actual) {
    currentScreen = String(userSession.pantalla_actual).trim();
  }
}

// Si la sesión no tiene dirección, intentar recuperar del último pedido del usuario
if (!currentAddress) {
  const userPastOrders = orderRows.filter(o => String(o.id_usuario) === String(userId) && o.direccion);
  if (userPastOrders.length > 0) {
    currentAddress = String(userPastOrders[userPastOrders.length - 1].direccion).trim();
  }
}

// Si aún no hay dirección, buscar si existe en la hoja USUARIOS (si el nodo está disponible)
if (!currentAddress) {
  try {
    const userRows = $('Leer Directorio USUARIOS').all().map(i => i.json);
    const uProfile = userRows.find(u => String(u.telegram_id) === String(userId));
    if (uProfile) {
      currentAddress = String(uProfile.direccion || uProfile.departamento_oficina || '').trim();
    }
  } catch (e) {
    // Si el nodo de usuarios no existe o no ha corrido, continuar de forma segura
  }
}

let responseMessage = '';
let inlineKeyboard = [];
let shouldUpdateSession = false;
let newCartState = currentCart;
let newScreenState = currentScreen;
let orderCreated = null;
let kitchenAlert = null;

switch (action) {
  case 'SHOW_MAIN_MENU':
    responseMessage = `👋 *¡Hola ${firstName}! Bienvenido a DeliveryBot Cafetería.*\n\n☕ Pide tus bebidas y comidas favoritas sin filas.\n\n👇 *Selecciona una categoría o consulta tu orden:*`;
    inlineKeyboard = [
      [
        { text: '☕ Bebidas', callback_data: 'cat:Bebidas' },
        { text: '🥪 Comidas', callback_data: 'cat:Comidas' }
      ],
      [
        { text: '🍪 Snacks & Dulces', callback_data: 'cat:Snacks' }
      ],
      [
        { text: `🛒 Ver Carrito (${currentCart.reduce((a, b) => a + b.cantidad, 0)})`, callback_data: 'cart:view' },
        { text: '📍 Mis Pedidos', callback_data: 'order:status' }
      ]
    ];
    break;

  case 'SHOW_CATEGORY':
    const cat = payload.categoria;
    const prodsInCat = menuRows.filter(p => p.categoria === cat && parseInt(p.stock || '0', 10) > 0);
    
    responseMessage = `📋 *Menú: ${cat}*\nSelecciona el producto que deseas agregar:`;
    
    inlineKeyboard = prodsInCat.map(p => [
      {
        text: `${p.nombre} - $${parseFloat(p.precio).toFixed(2)} (Stock: ${p.stock})`,
        callback_data: `prod:${p.id_producto}`
      }
    ]);
    
    if (inlineKeyboard.length === 0) {
      responseMessage = `⚠️ No hay productos disponibles en este momento en *${cat}*.`;
    }
    
    inlineKeyboard.push([
      { text: '🔙 Volver al Menú', callback_data: 'cmd:menu' },
      { text: '🛒 Ver Carrito', callback_data: 'cart:view' }
    ]);
    break;

  case 'SHOW_PRODUCT':
    const prod = menuRows.find(p => p.id_producto === payload.id_producto);
    if (!prod) {
      responseMessage = '❌ Producto no encontrado o fuera de carta.';
      inlineKeyboard = [[{ text: '🔙 Volver al Menú', callback_data: 'cmd:menu' }]];
    } else {
      responseMessage = `🍴 *${prod.nombre}*\n📝 ${prod.descripcion || 'Fresco y preparado al instante.'}\n💵 *Precio:* $${parseFloat(prod.precio).toFixed(2)}\n📦 *Stock disponible:* ${prod.stock} unidades\n\n¿Cuántas unidades deseas añadir?`;
      
      inlineKeyboard = [
        [
          { text: '+1', callback_data: `add:${prod.id_producto}:1` },
          { text: '+2', callback_data: `add:${prod.id_producto}:2` },
          { text: '+3', callback_data: `add:${prod.id_producto}:3` }
        ],
        [
          { text: `🔙 Volver a ${prod.categoria}`, callback_data: `cat:${prod.categoria}` },
          { text: '🛒 Ver Carrito', callback_data: 'cart:view' }
        ]
      ];
    }
    break;

  case 'ADD_TO_CART':
    const targetProd = menuRows.find(p => p.id_producto === payload.id_producto);
    if (targetProd) {
      const existingIndex = newCartState.findIndex(i => i.id_producto === targetProd.id_producto);
      const qtyToAdd = payload.cantidad;
      
      if (existingIndex >= 0) {
        newCartState[existingIndex].cantidad += qtyToAdd;
      } else {
        newCartState.push({
          id_producto: targetProd.id_producto,
          nombre: targetProd.nombre,
          precio: parseFloat(targetProd.precio),
          cantidad: qtyToAdd
        });
      }
      shouldUpdateSession = true;
      
      const totalItems = newCartState.reduce((sum, item) => sum + item.cantidad, 0);
      const cartTotal = newCartState.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
      
      responseMessage = `✅ *¡Añadido al carrito!*\n\n➕ *${qtyToAdd}x ${targetProd.nombre}*\n🛒 Total en carrito: *${totalItems} productos* ($${cartTotal.toFixed(2)}).\n\n¿Qué deseas hacer ahora?`;
      
      inlineKeyboard = [
        [
          { text: '🛒 Ver Carrito & Confirmar', callback_data: 'cart:view' },
          { text: '➕ Seguir Pidiendo', callback_data: 'cmd:menu' }
        ]
      ];
    }
    break;

  case 'VIEW_CART':
    newScreenState = 'VIEW_CART';
    if (currentCart.length === 0) {
      responseMessage = '🛒 *Tu carrito está vacío.*\n\nExplora nuestro menú para agregar tus platillos y bebidas.';
      inlineKeyboard = [
        [{ text: '📋 Explorar Menú', callback_data: 'cmd:menu' }]
      ];
    } else {
      let total = 0;
      let itemsList = '';
      
      currentCart.forEach((item, index) => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;
        itemsList += `${index + 1}. *${item.nombre}*\n   ${item.cantidad} x $${item.precio.toFixed(2)} = *$${subtotal.toFixed(2)}*\n`;
      });
      
      const direccionTexto = currentAddress 
        ? `📍 *Dirección de entrega:* \`${currentAddress}\``
        : '📍 *Dirección de entrega:* ⚠️ _Pendiente por indicar_';
      
      responseMessage = `🛒 *Resumen de tu Carrito:*\n\n${itemsList}\n━━━━━━━━━━━━━━━━━━━\n💰 *TOTAL A PAGAR: $${total.toFixed(2)}*\n${direccionTexto}\n\n¿Deseas confirmar tu pedido y enviarlo a cocina?`;
      
      if (currentAddress) {
        inlineKeyboard = [
          [
            { text: `✅ ¡Confirmar Pedido! ($${total.toFixed(2)})`, callback_data: 'cart:confirm' }
          ],
          [
            { text: '✏️ Cambiar Dirección', callback_data: 'cart:ask_address' },
            { text: '🗑️ Vaciar Carrito', callback_data: 'cart:clear' }
          ],
          [
            { text: '➕ Agregar Más', callback_data: 'cmd:menu' }
          ]
        ];
      } else {
        inlineKeyboard = [
          [
            { text: '📍 Ingresar Dirección de Entrega', callback_data: 'cart:ask_address' }
          ],
          [
            { text: '✅ Confirmar Pedido', callback_data: 'cart:confirm' },
            { text: '🗑️ Vaciar Carrito', callback_data: 'cart:clear' }
          ],
          [
            { text: '➕ Agregar Más', callback_data: 'cmd:menu' }
          ]
        ];
      }
    }
    break;

  case 'ASK_ADDRESS':
    newScreenState = 'AWAITING_ADDRESS';
    shouldUpdateSession = true;
    const currentDirMsg = currentAddress ? `\n\n🏠 *Dirección actual registrada:* \`${currentAddress}\`` : '';
    responseMessage = `📍 *Ingresa tu Dirección de Entrega*${currentDirMsg}\n\nPor favor, responde a este mensaje escribiendo tu **oficina, piso o dirección** donde recibirás tu pedido:\n\n_(Ejemplo: Piso 3 - Finanzas, Oficina 204 o Av. Central 45)_`;
    
    inlineKeyboard = [];
    if (currentAddress) {
      inlineKeyboard.push([
        { text: `✅ Conservar "${currentAddress}"`, callback_data: `cart:set_address:${currentAddress}` }
      ]);
    }
    inlineKeyboard.push([
      { text: '🔙 Volver al Carrito', callback_data: 'cart:view' },
      { text: '📋 Menú', callback_data: 'cmd:menu' }
    ]);
    break;

  case 'SAVE_ADDRESS':
    const dirToSave = (payload.direccion || '').trim();
    if (dirToSave.length >= 3) {
      currentAddress = dirToSave;
      shouldUpdateSession = true;
      newScreenState = 'VIEW_CART';
      
      if (currentCart.length > 0) {
        const total = currentCart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
        responseMessage = `✅ *¡Dirección de entrega guardada!*\n\n🏠 *Destino:* \`${currentAddress}\`\n🛒 Carrito: *${currentCart.length} productos* ($${total.toFixed(2)}).\n\n¿Deseas confirmar tu orden ahora?`;
        inlineKeyboard = [
          [{ text: '✅ ¡Confirmar Pedido Ahora!', callback_data: 'cart:confirm' }],
          [{ text: '✏️ Modificar Dirección', callback_data: 'cart:ask_address' }],
          [{ text: '🛒 Ver Carrito', callback_data: 'cart:view' }]
        ];
      } else {
        responseMessage = `✅ *¡Dirección de entrega guardada!*\n\n🏠 *Destino guardado:* \`${currentAddress}\`\n\nQuedó registrada para tus próximos pedidos. Explora nuestro menú para ordenar:`;
        inlineKeyboard = [
          [{ text: '📋 Explorar Menú', callback_data: 'cmd:menu' }]
        ];
      }
    } else {
      responseMessage = `⚠️ La dirección ingresada es muy corta. Por favor escribe una dirección válida (mínimo 3 caracteres).`;
      newScreenState = 'AWAITING_ADDRESS';
      shouldUpdateSession = true;
      inlineKeyboard = [
        [{ text: '🔙 Volver al Carrito', callback_data: 'cart:view' }]
      ];
    }
    break;

  case 'HANDLE_TEXT':
    const incomingText = (payload.text || '').trim();
    // Si el usuario escribe texto libre, lo registramos como dirección si tiene al menos 3 caracteres
    if (incomingText.length >= 3) {
      currentAddress = incomingText;
      shouldUpdateSession = true;
      newScreenState = 'VIEW_CART';
      
      if (currentCart.length > 0) {
        const total = currentCart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
        responseMessage = `📍 *¡Dirección de entrega registrada con éxito!*\n\n🏠 *Destino:* \`${currentAddress}\`\n💰 *Total a pagar:* *$${total.toFixed(2)}*\n\n¿Deseas confirmar tu orden y enviarla a preparación?`;
        inlineKeyboard = [
          [{ text: '✅ ¡Confirmar Pedido Ahora!', callback_data: 'cart:confirm' }],
          [{ text: '✏️ Cambiar Dirección', callback_data: 'cart:ask_address' }],
          [{ text: '🛒 Ver Carrito', callback_data: 'cart:view' }]
        ];
      } else {
        responseMessage = `📍 *¡Dirección de entrega registrada con éxito!*\n\n🏠 *Destino guardado:* \`${currentAddress}\`\n\nTu dirección quedó guardada. Puedes comenzar a pedir desde el menú:`;
        inlineKeyboard = [
          [{ text: '📋 Explorar Menú', callback_data: 'cmd:menu' }]
        ];
      }
    } else {
      responseMessage = `ℹ️ No entendí ese comando.\n\nUsa /menu para ver la carta, /carrito para ver tu pedido o /direccion para configurar tu entrega.`;
      inlineKeyboard = [
        [{ text: '📋 Menú Principal', callback_data: 'cmd:menu' }]
      ];
    }
    break;

  case 'CLEAR_CART':
    newCartState = [];
    newScreenState = 'MAIN_MENU';
    shouldUpdateSession = true;
    responseMessage = '🗑️ Tu carrito ha sido vaciado.';
    inlineKeyboard = [
      [{ text: '📋 Volver al Menú', callback_data: 'cmd:menu' }]
    ];
    break;

  case 'CHECKOUT':
    if (currentCart.length === 0) {
      responseMessage = '⚠️ Tu carrito está vacío. Agrega productos para ordenar.';
      inlineKeyboard = [[{ text: '📋 Explorar Menú', callback_data: 'cmd:menu' }]];
    } else if (!currentAddress || currentAddress.trim() === '') {
      // Bloquear checkout si no hay dirección y solicitarla explícitamente
      responseMessage = `📍 *Dirección de Entrega Requerida*\n\nPara poder llevar tu pedido a tu estación o domicilio, por favor responde a este mensaje con tu **dirección, oficina o piso**:\n\n_(Ejemplo: Piso 3 - Finanzas o Calle 10 #4-20)_`;
      newScreenState = 'AWAITING_ADDRESS';
      shouldUpdateSession = true;
      inlineKeyboard = [
        [{ text: '🔙 Volver al Carrito', callback_data: 'cart:view' }],
        [{ text: '📋 Menú Principal', callback_data: 'cmd:menu' }]
      ];
    } else {
      let stockOk = true;
      let stockErrors = [];
      
      for (const item of currentCart) {
        const prodInMenu = menuRows.find(p => p.id_producto === item.id_producto);
        const availableStock = prodInMenu ? parseInt(prodInMenu.stock || '0', 10) : 0;
        if (availableStock < item.cantidad) {
          stockOk = false;
          stockErrors.push(`• *${item.nombre}*: Solicitas ${item.cantidad}, disponibles: ${availableStock}`);
        }
      }
      
      if (!stockOk) {
        responseMessage = `⚠️ *Stock insuficiente para algunos productos:*\n\n${stockErrors.join('\n')}\n\nPor favor ajusta tu carrito.`;
        inlineKeyboard = [
          [{ text: '🛒 Ver Carrito', callback_data: 'cart:view' }],
          [{ text: '🗑️ Vaciar Carrito', callback_data: 'cart:clear' }]
        ];
      } else {
        const now = new Date();
        const idPedido = `PED-${Math.floor(1000 + Math.random() * 9000)}`;
        const fechaStr = now.toISOString().split('T')[0];
        const horaStr = now.toTimeString().split(' ')[0];
        
        let totalPagar = 0;
        let detallesTexto = [];
        
        currentCart.forEach(item => {
          const sub = item.precio * item.cantidad;
          totalPagar += sub;
          detallesTexto.push(`${item.cantidad}x ${item.nombre} ($${sub.toFixed(2)})`);
        });
        
        orderCreated = {
          id_pedido: idPedido,
          id_usuario: userId,
          detalles_pedido: detallesTexto.join(', '),
          total_pago: totalPagar.toFixed(2),
          direccion: currentAddress,
          estado: 'Recibido',
          fecha: fechaStr,
          hora: horaStr
        };
        
        newCartState = [];
        newScreenState = 'MAIN_MENU';
        shouldUpdateSession = true;
        
        responseMessage = `🎉 *¡Tu pedido ha sido recibido con éxito!*\n\n🔖 *Código de Orden:* \`${idPedido}\`\n📋 *Detalles:* ${detallesTexto.join(', ')}\n💰 *Total a pagar:* *$${totalPagar.toFixed(2)}*\n📍 *Dirección de Entrega:* \`${currentAddress}\`\n📌 *Estado actual:* 🟡 *Recibido (En cola)*\n\n👨‍🍳 La cocina ya fue alertada con tu ubicación. Te avisaremos automáticamente cuando empiece la preparación.`;
        
        inlineKeyboard = [
          [{ text: '📍 Consultar Estado', callback_data: 'order:status' }],
          [{ text: '☕ Nuevo Pedido', callback_data: 'cmd:menu' }]
        ];
        
        kitchenAlert = {
          orderId: idPedido,
          customerName: firstName,
          customerId: userId,
          address: currentAddress,
          details: detallesTexto.join('\n• '),
          total: totalPagar.toFixed(2),
          time: horaStr
        };
      }
    }
    break;

  case 'CHECK_STATUS':
    const userOrders = orderRows.filter(o => String(o.id_usuario) === String(userId));
    if (userOrders.length === 0) {
      responseMessage = 'ℹ️ No tienes pedidos registrados hasta el momento.';
    } else {
      const lastOrders = userOrders.slice(-3).reverse();
      let ordersText = '';
      lastOrders.forEach(o => {
        let statusIcon = '🟡';
        if (o.estado === 'Preparación') statusIcon = '👨‍🍳';
        if (o.estado === 'En camino') statusIcon = '🛵';
        if (o.estado === 'Entregado') statusIcon = '✅';
        if (o.estado === 'Cancelado') statusIcon = '❌';
        
        const destinoStr = o.direccion ? `📍 *Destino:* \`${o.direccion}\`\n` : '';
        ordersText += `🔖 *Orden:* \`${o.id_pedido}\`\n📅 *Fecha:* ${o.fecha} ${o.hora}\n📦 *Items:* ${o.detalles_pedido}\n💰 *Total:* $${parseFloat(o.total_pago).toFixed(2)}\n${destinoStr}📌 *Estado:* ${statusIcon} *${o.estado}*\n━━━━━━━━━━━━━━━━━━━\n`;
      });
      responseMessage = `📍 *Tus últimos pedidos:*\n\n${ordersText}`;
    }
    inlineKeyboard = [
      [{ text: '📋 Menú', callback_data: 'cmd:menu' }, { text: '🛒 Carrito', callback_data: 'cart:view' }]
    ];
    break;

  case 'SHOW_HELP':
  default:
    responseMessage = 'ℹ️ *Comandos de DeliveryBot:*\n\n/menu - Ver catálogo\n/carrito - Ver carrito activo\n/direccion - Configurar o cambiar dirección de entrega\n/estado - Consultar avance de pedidos\n/ayuda - Ver ayuda';
    inlineKeyboard = [
      [
        { text: '📋 Menú Principal', callback_data: 'cmd:menu' },
        { text: '📍 Mi Dirección', callback_data: 'cart:ask_address' }
      ]
    ];
    break;
}

return {
  json: {
    chatId,
    userId,
    responseMessage,
    inlineKeyboard,
    shouldUpdateSession,
    newCartState: JSON.stringify(newCartState),
    newScreenState,
    userAddress: currentAddress,
    orderCreated,
    kitchenAlert
  }
};
