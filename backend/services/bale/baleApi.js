const BALE_API_BASE = 'https://tapi.bale.ai/bot';

function getToken() {
  return process.env.BALE_BOT_TOKEN || '';
}

function isConfigured() {
  return Boolean(getToken());
}

async function callBale(method, body = {}) {
  const token = getToken();
  if (!token) {
    throw new Error('BALE_BOT_TOKEN تنظیم نشده است.');
  }
  const url = `${BALE_API_BASE}${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const detail = data.description || data.error || response.statusText;
    throw new Error(`Bale API ${method} failed: ${detail}`);
  }
  return data.result ?? data;
}

async function sendMessage(chatId, text, options = {}) {
  const normalizedChatId = Number(chatId);
  return callBale('sendMessage', {
    chat_id: Number.isFinite(normalizedChatId) ? normalizedChatId : chatId,
    text,
    parse_mode: options.parseMode || undefined,
    reply_markup: options.replyMarkup || undefined,
    disable_web_page_preview: true,
  });
}

async function editMessageText(chatId, messageId, text, options = {}) {
  return callBale('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: options.parseMode || undefined,
    reply_markup: options.replyMarkup || undefined,
    disable_web_page_preview: true,
  });
}

async function answerCallbackQuery(callbackQueryId, text, options = {}) {
  return callBale('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text || undefined,
    show_alert: options.showAlert === true,
  });
}

function isExpiredCallbackError(err) {
  const msg = String(err?.message || err || '');
  return /query is too old|response timeout expired|query ID is invalid/i.test(msg);
}

/** Ack inline button — never blocks business logic when Bale says the query expired. */
async function safeAnswerCallbackQuery(callbackQueryId, text, options = {}) {
  try {
    await answerCallbackQuery(callbackQueryId, text, options);
    return true;
  } catch (err) {
    if (isExpiredCallbackError(err)) {
      console.warn('⚠️ [bale] callback query expired (continuing):', callbackQueryId);
      return false;
    }
    throw err;
  }
}

async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
  return callBale('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

async function setWebhook(url) {
  return callBale('setWebhook', { url });
}

async function deleteWebhook() {
  return callBale('deleteWebhook', {});
}

async function getMe() {
  return callBale('getMe', {});
}

async function getUpdates({ offset = 0, timeout = 30 } = {}) {
  return callBale('getUpdates', {
    offset,
    timeout,
    allowed_updates: ['message', 'callback_query'],
  });
}

module.exports = {
  isConfigured,
  sendMessage,
  editMessageText,
  editMessageReplyMarkup,
  answerCallbackQuery,
  safeAnswerCallbackQuery,
  isExpiredCallbackError,
  setWebhook,
  deleteWebhook,
  getMe,
  getUpdates,
};
