const baleApi = require('./baleApi');
const pool = require('../../db');
const { loadGeoCatalog } = require('./baleRegionBans');
const { mdBold, BALE_PARSE_MODE, stripMarkdown } = require('./baleFormat');
const {
  MAX_REJECT_PROVINCES,
  MAX_PREFER_PROVINCES,
  createSurvey,
  loadSurvey,
  updateSurvey,
  deleteSurvey,
  saveCompletedPref,
  formatPrefSummary,
} = require('./baleNextLoadPrefs');

const PREFIX = 'nls';

function cb(surveyId, ...parts) {
  return [PREFIX, surveyId, ...parts].join(':');
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function provinceButtonLabel(name, selected) {
  const label = String(name || '').trim();
  const short = label.length > 16 ? `${label.slice(0, 15)}…` : label;
  return selected ? `✓ ${short}` : short;
}

function provinceKeyboard(surveyId, provinces, selected, maxCount) {
  const selectedSet = new Set(selected || []);
  const rows = chunk(
    provinces.map((name, i) => ({
      text: provinceButtonLabel(name, selectedSet.has(name)),
      callback_data: cb(surveyId, 'p', String(i + 1)),
    })),
    2
  );
  rows.push([
    {
      text: selectedSet.size ? `تمام (${selectedSet.size} از ${maxCount})` : 'تمام — هیچ‌کدام',
      callback_data: cb(surveyId, 'done'),
    },
  ]);
  return { inline_keyboard: rows };
}

function introKeyboard(surveyId) {
  return {
    inline_keyboard: [
      [{ text: 'ترجیحات انتخاب بار بعدی را ثبت می‌کنم', callback_data: cb(surveyId, 'ask') }],
      [
        {
          text: 'ترجیحی ندارم؛ اگر در دسترس نبودم طبق نوبت دفتر یا سیستم انتخاب کند',
          callback_data: cb(surveyId, 'skip'),
        },
      ],
    ],
  };
}

function lineKeyboard(surveyId) {
  return {
    inline_keyboard: [
      [
        {
          text: 'بار بستنی یا لبنیات برام فرقی نداره؛ هر دو را می‌برم',
          callback_data: cb(surveyId, 'line', 'none'),
        },
      ],
      [
        { text: 'بستنی نمی‌روم', callback_data: cb(surveyId, 'line', 'ice') },
        { text: 'پاستوریزه نمی‌روم', callback_data: cb(surveyId, 'line', 'dairy') },
      ],
    ],
  };
}

function distanceKeyboard(surveyId) {
  return {
    inline_keyboard: [
      [
        { text: 'نزدیک نمی‌روم', callback_data: cb(surveyId, 'dist', 'near') },
        { text: 'دور نمی‌روم', callback_data: cb(surveyId, 'dist', 'far') },
      ],
      [
        { text: 'خیلی‌دور نمی‌روم', callback_data: cb(surveyId, 'dist', 'veryFar') },
        { text: 'فرقی ندارد', callback_data: cb(surveyId, 'dist', 'none') },
      ],
    ],
  };
}

const NOT_RESERVED =
  'این انتخاب شما به معنی رزرو شدن مسیر نیست. در صورت امکان ترجیح شما مدنظر قرار خواهد گرفت وگرنه اولویت ارسال بار شرکت است.';

function renderBody(step, draft) {
  if (step === 'intro') {
    return (
      'بار فعلی ثبت شد.\n\n' +
      `${mdBold('برای انتخاب بار بعدی کدام را می‌خواهید؟')}\n` +
      NOT_RESERVED
    );
  }
  if (step === 'reject_line') {
    return `${mdBold('کدام لاین را ترجیح می‌دهی نروی؟')}\n${NOT_RESERVED}`;
  }
  if (step === 'reject_province') {
    const selected = (draft.rejectProvinces || []).join('، ') || 'هیچ';
    return (
      `${mdBold(`استان‌هایی که ترجیح می‌دهی نروی (حداکثر ${MAX_REJECT_PROVINCES})`)}\n` +
      'روی نام استان بزن؛ دوباره همان = لغو.\n' +
      `انتخاب‌شده: ${mdBold(selected)}`
    );
  }
  if (step === 'reject_distance') {
    return `${mdBold('کدام نوع مسیر را ترجیح می‌دهی نروی؟')}\n${NOT_RESERVED}`;
  }
  if (step === 'prefer_province') {
    const selected = (draft.preferProvinces || []).join('، ') || 'هیچ';
    return (
      `${mdBold(`کدام استان را ترجیح می‌دهی بروی (حداکثر ${MAX_PREFER_PROVINCES})؟`)}\n` +
      'روی نام استان بزن؛ دوباره همان = لغو.\n' +
      `انتخاب‌شده: ${mdBold(selected)}`
    );
  }
  return NOT_RESERVED;
}

function keyboardFor(survey) {
  const { id, step, draft } = survey;
  if (step === 'intro') return introKeyboard(id);
  if (step === 'reject_line') return lineKeyboard(id);
  if (step === 'reject_distance') return distanceKeyboard(id);
  if (step === 'reject_province') {
    return provinceKeyboard(
      id,
      survey.provinces,
      draft.rejectProvinces,
      MAX_REJECT_PROVINCES
    );
  }
  if (step === 'prefer_province') {
    return provinceKeyboard(
      id,
      survey.provinces,
      draft.preferProvinces,
      MAX_PREFER_PROVINCES
    );
  }
  return { inline_keyboard: [] };
}

async function attachProvinces(survey) {
  if (!survey) return null;
  const geo = await loadGeoCatalog();
  return { ...survey, provinces: geo.provinces || [] };
}

async function sendSurveyText(chatId, text, replyMarkup, messageId) {
  if (messageId) {
    try {
      await baleApi.editMessageText(chatId, messageId, text, {
        parseMode: BALE_PARSE_MODE,
        replyMarkup,
      });
      return messageId;
    } catch (err) {
      if (!String(err.message || '').includes('message is not modified')) {
        try {
          await baleApi.editMessageText(chatId, messageId, stripMarkdown(text), { replyMarkup });
          return messageId;
        } catch (err2) {
          if (!String(err2.message || '').includes('message is not modified')) {
            console.warn('⚠️ [bale] next-load edit:', err2.message);
          }
        }
      }
    }
  }
  try {
    const sent = await baleApi.sendMessage(chatId, text, {
      parseMode: BALE_PARSE_MODE,
      replyMarkup,
    });
    return sent?.message_id;
  } catch {
    const sent = await baleApi.sendMessage(chatId, stripMarkdown(text), { replyMarkup });
    return sent?.message_id;
  }
}

async function paintSurvey(survey) {
  const withGeo = await attachProvinces(survey);
  const text = renderBody(withGeo.step, withGeo.draft);
  const replyMarkup = keyboardFor(withGeo);
  const messageId = await sendSurveyText(
    withGeo.chatId,
    text,
    replyMarkup,
    withGeo.messageId
  );
  if (messageId && messageId !== withGeo.messageId) {
    await updateSurvey(withGeo.id, { messageId });
  }
  return { ...withGeo, messageId };
}

async function startNextLoadSurvey(driverId) {
  if (!driverId) return;
  const { rows } = await pool.query(
    `SELECT outreach_chat_id FROM bale_driver_outreach WHERE driver_id = $1`,
    [driverId]
  );
  const chatId = rows[0]?.outreach_chat_id;
  if (!chatId) return;
  const survey = await createSurvey(driverId, chatId);
  await paintSurvey(survey);
}

async function finishSkip(survey) {
  await saveCompletedPref(survey.driverId, { followTurn: true });
  await deleteSurvey(survey.id);
  const text =
    `✅ ${mdBold('طبق نوبت ثبت شد')}.\n` +
    'اگر چند ردیف باشد بیشترین کیلومتر باقی‌مانده انتخاب می‌شود.\n' +
    NOT_RESERVED;
  await sendSurveyText(survey.chatId, text, { inline_keyboard: [] }, survey.messageId);
}

async function finishSave(survey) {
  await saveCompletedPref(survey.driverId, {
    followTurn: false,
    rejectLine: survey.draft.rejectLine,
    rejectDistance: survey.draft.rejectDistance,
    rejectProvinces: survey.draft.rejectProvinces,
    preferProvinces: survey.draft.preferProvinces,
  });
  const pref = {
    followTurn: false,
    ...survey.draft,
  };
  const summary = formatPrefSummary(pref, { audience: 'driver' });
  await deleteSurvey(survey.id);
  const text = `✅ ${mdBold('ثبت شد')}.\n${summary}\n\n${NOT_RESERVED}`;
  await sendSurveyText(survey.chatId, text, { inline_keyboard: [] }, survey.messageId);
}

function toggleProvince(list, name, max) {
  const set = new Set(list || []);
  if (set.has(name)) {
    set.delete(name);
    return [...set];
  }
  if (set.size >= max) return [...set];
  set.add(name);
  return [...set];
}

async function handleNextLoadCallback(callbackQuery) {
  const data = String(callbackQuery.data || '');
  if (!data.startsWith(`${PREFIX}:`)) return { handled: false };
  const parts = data.split(':');
  const surveyId = parts[1];
  const cmd = parts[2];
  const extra = parts[3];
  const survey = await attachProvinces(await loadSurvey(surveyId));
  if (!survey) {
    await baleApi.safeAnswerCallbackQuery(callbackQuery.id, 'منقضی شده');
    return { handled: true };
  }

  if (cmd === 'skip') {
    await baleApi.safeAnswerCallbackQuery(callbackQuery.id, 'طبق نوبت دفتر');
    await finishSkip(survey);
    return { handled: true };
  }

  if (survey.step === 'intro' && cmd === 'ask') {
    await baleApi.safeAnswerCallbackQuery(callbackQuery.id);
    const next = await updateSurvey(survey.id, { step: 'reject_line' });
    await paintSurvey({ ...survey, ...next, messageId: survey.messageId });
    return { handled: true };
  }

  if (survey.step === 'reject_line' && cmd === 'line') {
    await baleApi.safeAnswerCallbackQuery(callbackQuery.id);
    const draft = {
      ...survey.draft,
      rejectLine: extra === 'ice' || extra === 'dairy' ? extra : null,
    };
    const next = await updateSurvey(survey.id, { step: 'reject_province', draft });
    await paintSurvey({ ...survey, ...next, draft, messageId: survey.messageId });
    return { handled: true };
  }

  if (survey.step === 'reject_province' && cmd === 'p') {
    const idx = Number(extra) - 1;
    const name = survey.provinces[idx];
    if (!name) {
      await baleApi.safeAnswerCallbackQuery(callbackQuery.id, 'نامعتبر');
      return { handled: true };
    }
    const nextList = toggleProvince(survey.draft.rejectProvinces, name, MAX_REJECT_PROVINCES);
    if (
      nextList.length === (survey.draft.rejectProvinces || []).length &&
      nextList.includes(name) === (survey.draft.rejectProvinces || []).includes(name)
    ) {
      await baleApi.safeAnswerCallbackQuery(
        callbackQuery.id,
        `حداکثر ${MAX_REJECT_PROVINCES} استان`
      );
    } else {
      await baleApi.safeAnswerCallbackQuery(callbackQuery.id);
    }
    const draft = { ...survey.draft, rejectProvinces: nextList };
    const next = await updateSurvey(survey.id, { draft });
    await paintSurvey({ ...survey, ...next, draft, messageId: survey.messageId });
    return { handled: true };
  }

  if (survey.step === 'reject_province' && cmd === 'done') {
    await baleApi.safeAnswerCallbackQuery(callbackQuery.id);
    const next = await updateSurvey(survey.id, { step: 'reject_distance' });
    await paintSurvey({ ...survey, ...next, messageId: survey.messageId });
    return { handled: true };
  }

  if (survey.step === 'reject_distance' && cmd === 'dist') {
    await baleApi.safeAnswerCallbackQuery(callbackQuery.id);
    const draft = {
      ...survey.draft,
      rejectDistance: extra === 'near' || extra === 'far' || extra === 'veryFar' ? extra : null,
    };
    const next = await updateSurvey(survey.id, { step: 'prefer_province', draft });
    await paintSurvey({ ...survey, ...next, draft, messageId: survey.messageId });
    return { handled: true };
  }

  if (survey.step === 'prefer_province' && cmd === 'p') {
    const idx = Number(extra) - 1;
    const name = survey.provinces[idx];
    if (!name) {
      await baleApi.safeAnswerCallbackQuery(callbackQuery.id, 'نامعتبر');
      return { handled: true };
    }
    if ((survey.draft.rejectProvinces || []).includes(name)) {
      await baleApi.safeAnswerCallbackQuery(callbackQuery.id, 'این استان را در رد گذاشته‌اید');
      return { handled: true };
    }
    const nextList = toggleProvince(survey.draft.preferProvinces, name, MAX_PREFER_PROVINCES);
    if (
      nextList.length === (survey.draft.preferProvinces || []).length &&
      !nextList.includes(name) &&
      !(survey.draft.preferProvinces || []).includes(name)
    ) {
      await baleApi.safeAnswerCallbackQuery(
        callbackQuery.id,
        `حداکثر ${MAX_PREFER_PROVINCES} استان`
      );
    } else if (
      nextList.length === (survey.draft.preferProvinces || []).length &&
      nextList.includes(name) === (survey.draft.preferProvinces || []).includes(name) &&
      (survey.draft.preferProvinces || []).length >= MAX_PREFER_PROVINCES &&
      !nextList.includes(name)
    ) {
      await baleApi.safeAnswerCallbackQuery(
        callbackQuery.id,
        `حداکثر ${MAX_PREFER_PROVINCES} استان`
      );
    } else {
      await baleApi.safeAnswerCallbackQuery(callbackQuery.id);
    }
    const draft = { ...survey.draft, preferProvinces: nextList };
    const next = await updateSurvey(survey.id, { draft });
    await paintSurvey({ ...survey, ...next, draft, messageId: survey.messageId });
    return { handled: true };
  }

  if (survey.step === 'prefer_province' && cmd === 'done') {
    await baleApi.safeAnswerCallbackQuery(callbackQuery.id, 'ثبت شد');
    await finishSave(survey);
    return { handled: true };
  }

  await baleApi.safeAnswerCallbackQuery(callbackQuery.id);
  return { handled: true };
}

module.exports = {
  startNextLoadSurvey,
  handleNextLoadCallback,
};
