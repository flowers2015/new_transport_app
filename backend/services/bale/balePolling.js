const baleApi = require('./baleApi');
const sessionEngine = require('./baleSessionEngine');

let pollingActive = false;
let offset = 0;

async function pollUpdatesOnce() {
  const updates = await baleApi.getUpdates({ offset, timeout: 25 });
  if (!Array.isArray(updates) || updates.length === 0) return;
  for (const update of updates) {
    if (update.update_id != null) {
      offset = update.update_id + 1;
    }
    try {
      await sessionEngine.processWebhookUpdate(update);
    } catch (err) {
      console.error('❌ [bale] poll handle error:', err.message);
    }
  }
}

function startBalePolling() {
  if (pollingActive || !baleApi.isConfigured()) return;
  if (process.env.BALE_ENABLE_POLLING === 'false') return;

  pollingActive = true;
  sessionEngine.ensureTickTimer();
  baleApi
    .deleteWebhook()
    .then(() => console.log('✅ [bale] webhook حذف شد — polling فعال'))
    .catch(() => {});
  console.log('✅ [bale] long polling فعال شد (دریافت پیام راننده)');

  const loop = async () => {
    if (!pollingActive) return;
    try {
      await pollUpdatesOnce();
    } catch (err) {
      if (!String(err.message).includes('Conflict')) {
        console.warn('⚠️ [bale] poll:', err.message);
      }
    }
    setTimeout(loop, 300);
  };
  loop();
}

function stopBalePolling() {
  pollingActive = false;
}

module.exports = { startBalePolling, stopBalePolling };
