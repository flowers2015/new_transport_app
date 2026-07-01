const FormData = require('form-data');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const BALE_API_BASE = 'https://tapi.bale.ai/bot';

function getToken() {
  let token = String(process.env.BALE_BOT_TOKEN || '').trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  return token;
}

function isConfigured() {
  return Boolean(getToken());
}

function formatBaleError(method, response, data) {
  const code = data?.error_code != null ? ` (${data.error_code})` : '';
  const detail =
    data?.description ||
    data?.error ||
    (typeof data === 'string' ? data : null) ||
    response?.statusText ||
    'خطای نامشخص';
  return `Bale API ${method} failed${code}: ${detail}`;
}

function buildJsonBody(payload) {
  const body = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      body[key] = value;
    }
  });
  return body;
}

async function callBale(method, body = {}) {
  const token = getToken();
  if (!token) {
    throw new Error('BALE_BOT_TOKEN تنظیم نشده است.');
  }
  const url = `${BALE_API_BASE}${token}/${method}`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    console.error(`❌ [bale] ${method} network error:`, networkErr.message);
    throw new Error(
      `اتصال به سرور بله برقرار نشد. دسترسی خروجی سرور به tapi.bale.ai را بررسی کنید. (${networkErr.message})`
    );
  }

  const rawText = await response.text().catch(() => '');
  let data = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { description: rawText.slice(0, 300) };
    }
  }

  if (!response.ok || data.ok === false) {
    const message = formatBaleError(method, response, data);
    console.error(`❌ [bale] ${method}:`, {
      status: response.status,
      statusText: response.statusText,
      body: data,
    });
    throw new Error(message);
  }
  return data.result ?? data;
}

function normalizeChatId(chatId) {
  const raw = String(chatId ?? '').trim();
  return raw || null;
}

async function sendMessage(chatId, text, options = {}) {
  const normalizedChatId = normalizeChatId(chatId);
  if (!normalizedChatId) {
    throw new Error('chat_id مقصد مشخص نشده است.');
  }
  return callBale('sendMessage', buildJsonBody({
    chat_id: normalizedChatId,
    text: String(text || ''),
    parse_mode: options.parseMode,
    reply_markup: options.replyMarkup,
    disable_web_page_preview: options.disableWebPagePreview === true ? true : undefined,
  }));
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

function sanitizeFilename(name) {
  return String(name || 'file')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'file';
}

function callBaleMultipart(method, form) {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error('BALE_BOT_TOKEN تنظیم نشده است.'));
  }
  const url = new URL(`${BALE_API_BASE}${token}/${method}`);

  return new Promise((resolve, reject) => {
    form.getLength((lengthErr, length) => {
      if (lengthErr) {
        reject(lengthErr);
        return;
      }

      const headers = {
        ...form.getHeaders(),
        'Content-Length': length,
      };

      const req = https.request(
        {
          method: 'POST',
          hostname: url.hostname,
          path: `${url.pathname}${url.search}`,
          headers,
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            let data = {};
            try {
              data = raw ? JSON.parse(raw) : {};
            } catch {
              reject(new Error(`Bale API ${method} failed: پاسخ نامعتبر از سرور`));
              return;
            }
            if (res.statusCode >= 400 || data.ok === false) {
              const detail = data.description || data.error || res.statusMessage;
              reject(new Error(`Bale API ${method} failed: ${detail}`));
              return;
            }
            resolve(data.result ?? data);
          });
        }
      );

      req.on('error', reject);
      form.pipe(req);
    });
  });
}

async function withTempFile(buffer, filename, fn) {
  const safeName = sanitizeFilename(filename);
  const tmpPath = path.join(os.tmpdir(), `bale-upload-${Date.now()}-${safeName}`);
  await fs.promises.writeFile(tmpPath, buffer);
  try {
    return await fn(tmpPath, safeName);
  } finally {
    await fs.promises.unlink(tmpPath).catch(() => {});
  }
}

function buildUploadForm(chatId, fieldName, filePath, filename, options = {}) {
  const normalizedChatId = Number(chatId);
  const form = new FormData();
  form.append('chat_id', Number.isFinite(normalizedChatId) ? normalizedChatId : chatId);
  form.append(fieldName, fs.createReadStream(filePath), {
    filename: sanitizeFilename(filename),
    contentType: options.mimeType || 'application/octet-stream',
  });
  if (options.caption) {
    form.append('caption', options.caption);
  }
  return form;
}

async function sendDocument(chatId, buffer, filename, options = {}) {
  return withTempFile(buffer, filename, async (tmpPath, safeName) => {
    const form = buildUploadForm(chatId, 'document', tmpPath, safeName, options);
    return callBaleMultipart('sendDocument', form);
  });
}

async function sendPhoto(chatId, buffer, filename, options = {}) {
  const allowDocumentFallback = options.allowDocumentFallback !== false;
  try {
    return await withTempFile(buffer, filename, async (tmpPath, safeName) => {
      const form = buildUploadForm(chatId, 'photo', tmpPath, safeName, options);
      return callBaleMultipart('sendPhoto', form);
    });
  } catch (err) {
    const msg = String(err?.message || err);
    if (!allowDocumentFallback || !/upload file bytes|failed to upload/i.test(msg)) {
      throw err;
    }
    console.warn('⚠️ [bale] sendPhoto failed, retrying as document:', msg);
    return sendDocument(chatId, buffer, filename, options);
  }
}

async function sendDocumentByUrl(chatId, fileUrl, caption) {
  const normalizedChatId = Number(chatId);
  return callBale('sendDocument', {
    chat_id: Number.isFinite(normalizedChatId) ? normalizedChatId : chatId,
    document: fileUrl,
    caption: caption || undefined,
  });
}

async function sendPhotoByUrl(chatId, fileUrl, caption) {
  const normalizedChatId = Number(chatId);
  return callBale('sendPhoto', {
    chat_id: Number.isFinite(normalizedChatId) ? normalizedChatId : chatId,
    photo: fileUrl,
    caption: caption || undefined,
  });
}

module.exports = {
  isConfigured,
  normalizeChatId,
  sendMessage,
  sendDocument,
  sendPhoto,
  sendDocumentByUrl,
  sendPhotoByUrl,
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
