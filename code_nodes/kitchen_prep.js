const actionData = $('Parsear Acción de Cocina').first().json;
const allOrders = $('Consultar Pedido en Sheets').all().map(i => i.json);

const targetOrder = allOrders.find(o => String(o.id_pedido) === String(actionData.orderId));

let clientUserId = targetOrder ? targetOrder.id_usuario : null;
let orderDetails = targetOrder ? targetOrder.detalles_pedido : 'Sin detalles';
let total = targetOrder ? targetOrder.total_pago : '0.00';
let direccion = targetOrder ? (targetOrder.direccion || '') : '';

let statusEmoji = 'ℹ️';
let statusTextForClient = '';

switch (actionData.newStatus) {
  case 'Preparación':
    statusEmoji = '👨‍🍳';
    statusTextForClient = 'Tu orden ya está en la cocina siendo preparada con esmero.';
    break;
  case 'En camino':
    statusEmoji = '🛵';
    statusTextForClient = direccion
      ? `Tu pedido va en camino a: *${direccion}*. ¡Espéralo!`
      : 'Tu pedido va en camino a tu departamento/oficina. ¡Espéralo!';
    break;
  case 'Entregado':
    statusEmoji = '✅';
    statusTextForClient = '¡Tu pedido fue entregado! ¡Buen provecho y que lo disfrutes!';
    break;
  case 'Cancelado':
    statusEmoji = '❌';
    statusTextForClient = 'Tu pedido fue cancelado por cocina debido a falta de insumos o cierre.';
    break;
  default:
    statusEmoji = '🔔';
    statusTextForClient = 'Tu pedido cambió de estado a: ' + actionData.newStatus;
}

const destinoStr = direccion ? `📍 *Destino:* \`${direccion}\`\n` : '';
const clientNotificationText = `${statusEmoji} *¡ACTUALIZACIÓN DE PEDIDO!*\n\n🔖 *Orden:* \`${actionData.orderId}\`\n📌 *Nuevo Estado:* *${actionData.newStatus}*\n${destinoStr}💬 ${statusTextForClient}\n\n_Cafetería Central - DeliveryBot_`;

return {
  json: {
    orderId: actionData.orderId,
    newStatus: actionData.newStatus,
    clientUserId,
    direccion,
    clientNotificationText,
    chatId: actionData.chatId,
    messageId: actionData.messageId
  }
};
