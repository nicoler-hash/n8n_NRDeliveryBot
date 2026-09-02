const item = $input.item.json;
let callbackData = '';
let callbackQueryId = null;
let messageId = null;
let chatId = null;
let operatorName = 'Cocina';

if (item.callback_query) {
  callbackData = item.callback_query.data || '';
  callbackQueryId = item.callback_query.id;
  messageId = item.callback_query.message.message_id;
  chatId = item.callback_query.message.chat.id;
  operatorName = item.callback_query.from.first_name || 'Personal de Cocina';
}

let orderId = '';
let newStatus = '';
let isValid = false;

if (callbackData.startsWith('status:')) {
  const parts = callbackData.split(':');
  orderId = parts[1];
  newStatus = parts[2];
  isValid = true;
}

return {
  json: {
    orderId,
    newStatus,
    operatorName,
    chatId,
    messageId,
    callbackQueryId,
    isValid
  }
};
