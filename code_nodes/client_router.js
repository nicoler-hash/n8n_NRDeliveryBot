// Extraer datos entrantes de Telegram (Mensaje o Callback Query)
const item = $input.item.json;
let chatId, userId, firstName, username, text, callbackData, callbackQueryId;

if (item.callback_query) {
  chatId = item.callback_query.message.chat.id;
  userId = item.callback_query.from.id;
  firstName = item.callback_query.from.first_name || 'Cliente';
  username = item.callback_query.from.username || '';
  callbackData = item.callback_query.data || '';
  callbackQueryId = item.callback_query.id;
  text = '';
} else if (item.message) {
  chatId = item.message.chat.id;
  userId = item.message.from.id;
  firstName = item.message.from.first_name || 'Cliente';
  username = item.message.from.username || '';
  text = (item.message.text || '').trim();
  callbackData = '';
  callbackQueryId = null;
}

let action = 'SHOW_MAIN_MENU';
let payload = {};

if (text === '/start' || text.toLowerCase() === 'menu' || callbackData === 'cmd:menu') {
  action = 'SHOW_MAIN_MENU';
} else if (callbackData.startsWith('cat:')) {
  action = 'SHOW_CATEGORY';
  payload.categoria = callbackData.split(':')[1];
} else if (callbackData.startsWith('prod:')) {
  action = 'SHOW_PRODUCT';
  payload.id_producto = callbackData.split(':')[1];
} else if (callbackData.startsWith('add:')) {
  action = 'ADD_TO_CART';
  const parts = callbackData.split(':');
  payload.id_producto = parts[1];
  payload.cantidad = parseInt(parts[2] || '1', 10);
} else if (callbackData === 'cart:view' || text === '/carrito') {
  action = 'VIEW_CART';
} else if (callbackData === 'cart:clear') {
  action = 'CLEAR_CART';
} else if (callbackData === 'cart:ask_address' || callbackData === 'cmd:address') {
  action = 'ASK_ADDRESS';
} else if (callbackData.startsWith('cart:set_address:')) {
  action = 'SAVE_ADDRESS';
  payload.direccion = callbackData.substring('cart:set_address:'.length).trim();
} else if (/^\/(direccion|ubicacion|piso)(\s+.*)?$/i.test(text)) {
  const parts = text.split(/\s+/);
  if (parts.length > 1) {
    action = 'SAVE_ADDRESS';
    payload.direccion = text.substring(parts[0].length).trim();
  } else {
    action = 'ASK_ADDRESS';
  }
} else if (callbackData === 'cart:confirm') {
  action = 'CHECKOUT';
} else if (callbackData === 'order:status' || text === '/estado') {
  action = 'CHECK_STATUS';
} else if (text === '/ayuda') {
  action = 'SHOW_HELP';
} else if (text.length > 0) {
  action = 'HANDLE_TEXT';
  payload.text = text;
}

return {
  json: {
    chatId,
    userId,
    firstName,
    username,
    action,
    payload,
    callbackQueryId,
    rawText: text
  }
};
