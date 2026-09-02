const orders = $input.all().map(i => i.json);
const today = new Date().toISOString().split('T')[0];
let targetDate = today;
let todaysOrders = orders.filter(o => o.fecha === targetDate);

if (todaysOrders.length === 0 && orders.length > 0) {
  const dates = orders.map(o => o.fecha).filter(Boolean).sort();
  targetDate = dates[dates.length - 1];
  todaysOrders = orders.filter(o => o.fecha === targetDate);
}

if (todaysOrders.length === 0) {
  return {
    json: {
      reportMessage: '📊 *Reporte Diario de Ventas*\n\nℹ️ No se registraron órdenes en la fecha seleccionada.'
    }
  };
}

let totalVentas = 0;
let ordenesEntregadas = 0;
let ordenesCanceladas = 0;
let ordenesEnProceso = 0;
const productSalesMap = {};
const hourlyOrdersMap = {};
const addressOrdersMap = {};

todaysOrders.forEach(order => {
  const monto = parseFloat(order.total_pago || '0');
  if (order.estado !== 'Cancelado') {
    totalVentas += monto;
  }
  
  if (order.estado === 'Entregado') ordenesEntregadas++;
  else if (order.estado === 'Cancelado') ordenesCanceladas++;
  else ordenesEnProceso++;
  
  if (order.hora) {
    const hour = order.hora.split(':')[0] + ':00 hrs';
    hourlyOrdersMap[hour] = (hourlyOrdersMap[hour] || 0) + 1;
  }
  
  if (order.direccion && order.estado !== 'Cancelado') {
    const dir = order.direccion.trim();
    addressOrdersMap[dir] = (addressOrdersMap[dir] || 0) + 1;
  }
  
  if (order.detalles_pedido && order.estado !== 'Cancelado') {
    const items = order.detalles_pedido.split(',');
    items.forEach(rawItem => {
      const match = rawItem.trim().match(/^(\d+)x\s+(.+?)(?:\s+\(\$[\d.]+\))?$/);
      if (match) {
        const qty = parseInt(match[1], 10);
        const name = match[2].trim();
        productSalesMap[name] = (productSalesMap[name] || 0) + qty;
      } else {
        const fallbackName = rawItem.trim();
        productSalesMap[fallbackName] = (productSalesMap[fallbackName] || 0) + 1;
      }
    });
  }
});

let productoEstrella = 'N/A';
let maxCantVendida = 0;
for (const [prod, cant] of Object.entries(productSalesMap)) {
  if (cant > maxCantVendida) {
    maxCantVendida = cant;
    productoEstrella = prod;
  }
}

let horaPico = 'N/A';
let maxPedidosHora = 0;
for (const [hour, cant] of Object.entries(hourlyOrdersMap)) {
  if (cant > maxPedidosHora) {
    maxPedidosHora = cant;
    horaPico = hour;
  }
}

let puntoTop = 'N/A';
let maxPedidosPunto = 0;
for (const [pto, cant] of Object.entries(addressOrdersMap)) {
  if (cant > maxPedidosPunto) {
    maxPedidosPunto = cant;
    puntoTop = pto;
  }
}

const totalOrdenesValidas = todaysOrders.length - ordenesCanceladas;
const ticketPromedio = totalOrdenesValidas > 0 ? (totalVentas / totalOrdenesValidas).toFixed(2) : '0.00';

const puntoTopTexto = maxPedidosPunto > 0 
  ? `📍 *PUNTO DE ENTREGA FRECUENTE*\n• *${puntoTop}* (${maxPedidosPunto} pedidos concentrados)\n\n`
  : '';

const reportMessage = `📊 *REPORTE GERENCIAL DIARIO DE CAFETERÍA*\n` +
  `📅 *Fecha Analizada:* \`${targetDate}\`\n\n` +
  `💰 *MÉTRICAS FINANCIERAS*\n` +
  `• Recaudación Total: *$${totalVentas.toFixed(2)}*\n` +
  `• Ticket Promedio: *$${ticketPromedio}*\n\n` +
  `📦 *VOLUMEN DE PEDIDOS*\n` +
  `• Total Recibidos: *${todaysOrders.length} órdenes*\n` +
  `• ✅ Entregados con Éxito: *${ordenesEntregadas}*\n` +
  `• ⏳ En Proceso: *${ordenesEnProceso}*\n` +
  `• ❌ Cancelados: *${ordenesCanceladas}*\n\n` +
  `⭐ *PRODUCTO ESTRELLA*\n` +
  `• *${productoEstrella}* (${maxCantVendida} unidades vendidas)\n\n` +
  `⏰ *HORA PICO DE DEMANDA*\n` +
  `• *${horaPico}* (${maxPedidosHora} pedidos concentrados)\n\n` +
  puntoTopTexto +
  `━━━━━━━━━━━━━━━━━━━\n` +
  `_DeliveryBot Analytics Engine - Automatización n8n_`;

return {
  json: {
    targetDate,
    totalVentas: totalVentas.toFixed(2),
    productoEstrella,
    horaPico,
    puntoTop,
    todaysOrdersCount: todaysOrders.length,
    reportMessage
  }
};
