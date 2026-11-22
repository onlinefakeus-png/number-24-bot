const { Telegraf } = require('telegraf');
const axios = require('axios');
const http = require('http');

const BOT_TOKEN = process.env.BOT_TOKEN;
const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || '').replace(/\/+$/, '');
const PORT = process.env.PORT || 10000;
const SELF_URL = process.env.RENDER_EXTERNAL_URL || '';

const ADMIN_IDS = [8771921458];
const SUPPORT_TARGET_ID = 8771921458;
const DEFAULT_NXV_BASE = 'https://nxv-sms.vercel.app';
const FALLBACK_SERVICES = [
  'WhatsApp',
  'Telegram',
  'Instagram',
  'Facebook',
  'Google',
  'TikTok',
  'Twitter',
  'Discord'
];

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN missing');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const COUNTRY_META = [
  { keys: ['afghanistan'], name: 'Afghanistan', iso: 'AF', dial: '93', flag: '🇦🇫' },
  { keys: ['bangladesh'], name: 'Bangladesh', iso: 'BD', dial: '880', flag: '🇧🇩' },
  { keys: ['belgium'], name: 'Belgium', iso: 'BE', dial: '32', flag: '🇧🇪' },
  { keys: ['cambodia'], name: 'Cambodia', iso: 'KH', dial: '855', flag: '🇰🇭' },
  { keys: ['cuba'], name: 'Cuba', iso: 'CU', dial: '53', flag: '🇨🇺' },
  { keys: ['egypt'], name: 'Egypt', iso: 'EG', dial: '20', flag: '🇪🇬' },
  { keys: ['georgia'], name: 'Georgia', iso: 'GE', dial: '995', flag: '🇬🇪' },
  { keys: ['guatemala'], name: 'Guatemala', iso: 'GT', dial: '502', flag: '🇬🇹' },
  { keys: ['guinea bissau', 'guinea-bissau', 'bissau'], name: 'Guinea Bissau', iso: 'GW', dial: '245', flag: '🇬🇼' },
  { keys: ['guinea'], name: 'Guinea', iso: 'GN', dial: '224', flag: '🇬🇳' },
  { keys: ['haiti'], name: 'Haiti', iso: 'HT', dial: '509', flag: '🇭🇹' },
  { keys: ['india'], name: 'India', iso: 'IN', dial: '91', flag: '🇮🇳' },
  { keys: ['indonesia'], name: 'Indonesia', iso: 'ID', dial: '62', flag: '🇮🇩' },
  { keys: ['kenya'], name: 'Kenya', iso: 'KE', dial: '254', flag: '🇰🇪' },
  { keys: ['laos'], name: 'Laos', iso: 'LA', dial: '856', flag: '🇱🇦' },
  { keys: ['liberia'], name: 'Liberia', iso: 'LR', dial: '231', flag: '🇱🇷' },
  { keys: ['madagascar'], name: 'Madagascar', iso: 'MG', dial: '261', flag: '🇲🇬' },
  { keys: ['malaysia'], name: 'Malaysia', iso: 'MY', dial: '60', flag: '🇲🇾' },
  { keys: ['maldives'], name: 'Maldives', iso: 'MV', dial: '960', flag: '🇲🇻' },
  { keys: ['mali'], name: 'Mali', iso: 'ML', dial: '223', flag: '🇲🇱' },
  { keys: ['nepal'], name: 'Nepal', iso: 'NP', dial: '977', flag: '🇳🇵' },
  { keys: ['nigeria'], name: 'Nigeria', iso: 'NG', dial: '234', flag: '🇳🇬' },
  { keys: ['pakistan'], name: 'Pakistan', iso: 'PK', dial: '92', flag: '🇵🇰' },
  { keys: ['peru'], name: 'Peru', iso: 'PE', dial: '51', flag: '🇵🇪' },
  { keys: ['russia'], name: 'Russia', iso: 'RU', dial: '7', flag: '🇷🇺' },
  { keys: ['senegal'], name: 'Senegal', iso: 'SN', dial: '221', flag: '🇸🇳' },
  { keys: ['sierra leone', 'sierra'], name: 'Sierra Leone', iso: 'SL', dial: '232', flag: '🇸🇱' },
  { keys: ['sudan'], name: 'Sudan', iso: 'SD', dial: '249', flag: '🇸🇩' },
  { keys: ['togo'], name: 'Togo', iso: 'TG', dial: '228', flag: '🇹🇬' },
  { keys: ['uk', 'united kingdom', 'britain', 'england'], name: 'United Kingdom', iso: 'GB', dial: '44', flag: '🇬🇧' },
  { keys: ['usa', 'united states', 'america'], name: 'United States', iso: 'US', dial: '1', flag: '🇺🇸' },
  { keys: ['yemen'], name: 'Yemen', iso: 'YE', dial: '967', flag: '🇾🇪' },
  { keys: ['zambia'], name: 'Zambia', iso: 'ZM', dial: '260', flag: '🇿🇲' }
];

function resolveCountryInfo(rawCountry) {
  const raw = String(rawCountry || '').trim();
  const flagMatch = raw.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u);
  const extractedFlag = flagMatch ? flagMatch[0] : null;
  const cleanedName = raw
    .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '')
    .replace(/\([A-Z]{2,3}\)/gi, '')
    .trim();

  const lower = cleanedName.toLowerCase();
  const matched = COUNTRY_META.find((c) => c.keys.some((k) => lower.includes(k)));

  if (matched) {
    const label = `${matched.flag} ${matched.name} (${matched.iso})`;
    return {
      key: matched.name.toLowerCase(),
      label,
      flag: matched.flag,
      dial: matched.dial,
      iso: matched.iso
    };
  }

  const fallbackFlag = extractedFlag || '🌍';
  const isoMatch = raw.match(/\(([A-Za-z]{2,3})\)/);
  const displayName = cleanedName || raw || 'Unknown';
  const label = isoMatch
    ? `${fallbackFlag} ${displayName} (${isoMatch[1].toUpperCase()})`
    : `${fallbackFlag} ${displayName}`;

  return {
    key: displayName.toLowerCase(),
    label,
    flag: fallbackFlag,
    dial: '',
    iso: isoMatch ? isoMatch[1].toUpperCase() : ''
  };
}

function attachCountryCode(rawNumber, dialCode = '') {
  const digits = String(rawNumber || '').replace(/[^\d]/g, '');
  if (!digits || digits.length < 6 || digits.length > 15) return null;

  if (dialCode) {
    if (digits.startsWith(dialCode)) {
      return `+${digits}`;
    }
    const withoutLeadingZero = digits.replace(/^0+/, '');
    return `+${dialCode}${withoutLeadingZero}`;
  }
  return `+${digits}`;
}

const state = {
  apiUrlEnabled: false,
  apiKeyEnabled: false,
  apiUrl: process.env.API_URL || DEFAULT_NXV_BASE,
  apiKey: process.env.API_KEY || '',
  mainGroupLink: process.env.MAIN_GROUP_LINK || 'https://t.me/your_main_group_link',
  mainGroupId: process.env.MAIN_GROUP_ID || '',
  otpGroupLink: process.env.OTP_GROUP_LINK || 'https://t.me/your_otp_group_link',
  otpGroupId: process.env.OTP_GROUP_ID || '',
  joinCheck: true,
  numberEntries: [],
  users: [],
  otpsByPhone: {},
  otpStats: {
    total: 0,
    byCountry: {}
  },
  knownPanelStockSnapshot: {},
  userSession: new Map(),
  lastBotBoardMsg: new Map(),
  lastGetNumberUserMsg: new Map(),
  waitingSupportFrom: new Set(),
  adminWizard: new Map(),
  cachedApiServices: null,
  cachedApiRanges: null
};

function kbButton(text, style = null) {
  const btn = { text };
  if (style) btn.style = style;
  return btn;
}

function inlineCbButton(text, callback_data, style = null) {
  const btn = { text, callback_data };
  if (style) btn.style = style;
  return btn;
}

function inlineUrlButton(text, url, style = null) {
  const btn = { text, url };
  if (style) btn.style = style;
  return btn;
}

function buildReplyMarkup(rows) {
  return {
    keyboard: rows,
    resize_keyboard: true
  };
}

function buildInlineMarkup(rows) {
  return {
    inline_keyboard: rows
  };
}

async function rawSendMessage(chatId, text, options = {}) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode || 'Markdown'
  };
  if (options.reply_markup) {
    payload.reply_markup = options.reply_markup;
  }
  return bot.telegram.callApi('sendMessage', payload);
}

async function rawEditMessageText(chatId, messageId, text, options = {}) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: options.parse_mode || 'Markdown'
  };
  if (options.reply_markup) {
    payload.reply_markup = options.reply_markup;
  }
  return bot.telegram.callApi('editMessageText', payload);
}

async function rawDeleteMessage(chatId, messageId) {
  try {
    return await bot.telegram.callApi('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  } catch (_) {
    return null;
  }
}

async function deletePreviousBoard(chatId, userId, keepMessageId = null) {
  const prevMsgId = state.lastBotBoardMsg.get(userId);
  if (!prevMsgId || prevMsgId === keepMessageId) return;
  await rawDeleteMessage(chatId, prevMsgId);
  state.lastBotBoardMsg.delete(userId);
}

async function keepOnlyLatestGetNumberTrigger(ctx) {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  const currentMsgId = ctx.message?.message_id;
  if (!chatId || !userId || !currentMsgId) return;

  const prevTriggerId = state.lastGetNumberUserMsg.get(userId);
  if (prevTriggerId && prevTriggerId !== currentMsgId) {
    await rawDeleteMessage(chatId, prevTriggerId);
  }
  state.lastGetNumberUserMsg.set(userId, currentMsgId);
}

async function sendCleanBoard(ctx, text, extra = {}) {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  const activeMsgId = ctx.callbackQuery?.message?.message_id || null;

  if (chatId && userId) {
    await deletePreviousBoard(chatId, userId, activeMsgId);
  }

  if (activeMsgId && extra.preferEdit && chatId) {
    try {
      const edited = await rawEditMessageText(chatId, activeMsgId, text, {
        reply_markup: extra.reply_markup
      });
      if (userId && edited?.message_id) {
        state.lastBotBoardMsg.set(userId, edited.message_id);
      }
      return edited;
    } catch (_) {}
  }

  const sent = await rawSendMessage(chatId, text, {
    reply_markup: extra.reply_markup
  });
  if (userId && sent?.message_id) {
    state.lastBotBoardMsg.set(userId, sent.message_id);
  }
  return sent;
}

async function dbGet(dbPath) {
  if (!FIREBASE_DB_URL) return null;
  try {
    const res = await axios.get(`${FIREBASE_DB_URL}/${dbPath}.json`);
    return res.data;
  } catch (e) {
    console.error('Firebase GET error:', e.message);
    return null;
  }
}

async function dbPut(dbPath, data) {
  if (!FIREBASE_DB_URL) return false;
  try {
    await axios.put(`${FIREBASE_DB_URL}/${dbPath}.json`, data);
    return true;
  } catch (e) {
    console.error('Firebase PUT error:', e.message);
    return false;
  }
}

async function persistEntries() {
  await dbPut('pool/entries', state.numberEntries);
}

async function persistOtpStats() {
  await dbPut('stats/otps', state.otpStats);
}

async function registerUser(userId) {
  if (!userId) return;
  const idStr = String(userId);
  if (!state.users.includes(idStr)) {
    state.users.push(idStr);
    await dbPut('users/list', state.users);
  }
}

async function turnAllOff() {
  state.apiUrlEnabled = false;
  state.apiKeyEnabled = false;
  await Promise.all([
    dbPut('config/apiUrlEnabled', false),
    dbPut('config/apiKeyEnabled', false)
  ]);
}

function getActiveSummaryLabel() {
  const active = [];
  if (state.apiUrlEnabled) active.push('API URL');
  if (state.apiKeyEnabled) active.push('API KEY');
  return active.length ? active.join(' + ') : 'ALL OFF';
}

function getNormalizedBaseUrl() {
  let raw = String(state.apiUrl || DEFAULT_NXV_BASE).trim();
  if (!raw) raw = DEFAULT_NXV_BASE;
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  raw = raw.replace(/\/+$/, '');
  raw = raw.replace(/\/(get-number|get-otp|get-services|services|active-rangre|active-range|ranges|get-countries|cancel-number|balance)$/i, '');
  return raw;
}

function buildApiEndpoint(endpointPath, extraParams = {}) {
  const base = getNormalizedBaseUrl();
  const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const url = new URL(`${base}${cleanPath}`);

  const params = { ...extraParams };
  if (state.apiKeyEnabled && state.apiKey && !params.api_key) {
    params.api_key = String(state.apiKey).trim();
  }

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      url.searchParams.set(k, String(v).trim());
    }
  });

  return url.toString();
}

function normalizeServiceTitle(rawSrv) {
  const clean = String(rawSrv || '').trim();
  if (!clean) return '';
  return clean
    .split(/[\s_-]+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ''))
    .join(' ');
}

function parseServicesFromResponse(data) {
  const found = [];
  const pushVal = (val) => {
    if (!val) return;
    if (typeof val === 'string') {
      const n = normalizeServiceTitle(val);
      if (n && n.length <= 35 && !/http|error|invalid|unauthorized/i.test(n)) {
        found.push(n);
      }
    } else if (typeof val === 'object') {
      const candidate =
        val.service || val.name || val.serviceName || val.service_name || val.title;
      if (candidate) pushVal(candidate);
    }
  };

  if (Array.isArray(data)) {
    data.forEach(pushVal);
  } else if (data && typeof data === 'object') {
    const listCandidates = [
      data.services,
      data.data?.services,
      data.data,
      data.result?.services,
      data.result
    ];
    for (const c of listCandidates) {
      if (Array.isArray(c)) {
        c.forEach(pushVal);
      } else if (c && typeof c === 'object' && !Array.isArray(c)) {
        Object.keys(c).forEach((k) => {
          if (isNaN(Number(k))) pushVal(k);
          else pushVal(c[k]);
        });
      }
    }
  }

  return [...new Set(found)];
}

async function fetchPanelServices() {
  if (!isApiReady()) return [];
  if (state.cachedApiServices && Date.now() - state.cachedApiServices.ts < 60000) {
    return state.cachedApiServices.list;
  }

  const candidatePaths = ['/get-services', '/services'];
  for (const path of candidatePaths) {
    try {
      const endpoint = buildApiEndpoint(path);
      const res = await axios.get(endpoint, { timeout: 6000 });
      const parsed = parseServicesFromResponse(res.data);
      if (parsed.length) {
        state.cachedApiServices = { list: parsed, ts: Date.now() };
        return parsed;
      }
    } catch (_) {}
  }

  return [];
}

function parseRangeEntriesFromPayload(data, defaultService = 'General') {
  const results = [];
  const pushRange = (item) => {
    if (!item) return;
    if (typeof item === 'string') {
      const info = resolveCountryInfo(item);
      if (info.key && info.key !== 'unknown' && !/global line|fb clone|new fb/i.test(item)) {
        results.push({
          service: normalizeServiceTitle(defaultService) || 'General',
          countryKey: info.key,
          countryLabel: info.label,
          count: 1
        });
      }
    } else if (typeof item === 'object') {
      const rawCountry =
        item.country ||
        item.country_name ||
        item.countryName ||
        item.region ||
        item.name ||
        '';
      const rawService =
        item.service || item.service_name || item.serviceName || defaultService || 'General';
      const rawCount =
        Number(
          item.count ??
            item.available ??
            item.stock ??
            item.numbers_count ??
            item.total ??
            1
        ) || 1;

      if (rawCountry && !/global line|fb clone|new fb/i.test(String(rawCountry))) {
        const info = resolveCountryInfo(rawCountry);
        if (info.key && info.key !== 'unknown') {
          results.push({
            service: normalizeServiceTitle(rawService) || 'General',
            countryKey: info.key,
            countryLabel: info.label,
            count: Math.max(0, rawCount)
          });
        }
      }
    }
  };

  if (Array.isArray(data)) {
    data.forEach(pushRange);
  } else if (data && typeof data === 'object') {
    const candidates = [
      data.ranges,
      data.countries,
      data.data?.ranges,
      data.data?.countries,
      data.data,
      data.result?.ranges,
      data.result?.countries,
      data.result
    ];
    for (const c of candidates) {
      if (Array.isArray(c)) {
        c.forEach(pushRange);
      } else if (c && typeof c === 'object') {
        Object.entries(c).forEach(([k, v]) => {
          if (typeof v === 'object') {
            pushRange(v);
          } else if (isNaN(Number(k))) {
            pushRange({ country: k, count: Number(v) || 1 });
          } else {
            pushRange(v);
          }
        });
      }
    }
  }

  return results;
}

async function fetchPanelRangeEntries(service = '') {
  if (!isApiReady()) return [];
  const cacheKey = String(service || '__ALL__').toLowerCase();
  if (
    state.cachedApiRanges &&
    state.cachedApiRanges.key === cacheKey &&
    Date.now() - state.cachedApiRanges.ts < 60000
  ) {
    return state.cachedApiRanges.list;
  }

  const candidatePaths = ['/active-rangre', '/active-range', '/ranges', '/get-countries'];
  for (const path of candidatePaths) {
    try {
      const endpoint = buildApiEndpoint(path, service ? { service } : {});
      const res = await axios.get(endpoint, { timeout: 6000 });
      const parsed = parseRangeEntriesFromPayload(res.data, service || 'General');
      if (parsed.length) {
        state.cachedApiRanges = { key: cacheKey, list: parsed, ts: Date.now() };
        return parsed;
      }
    } catch (_) {}
  }

  return [];
}

async function fetchPanelCountriesForService(service) {
  const entries = await fetchPanelRangeEntries(service);
  return [...new Set(entries.map((e) => e.countryLabel).filter(Boolean))];
}

function extractOtpFromPayload(d) {
  if (!d) return null;
  if (typeof d === 'string') {
    const m = d.match(/\b\d{4,8}\b/);
    return m ? m[0] : null;
  }
  if (d.status && String(d.status).toUpperCase() === 'RECEIVED' && d.otp) {
    const match = String(d.otp).match(/\b\d{4,8}\b/);
    if (match) return match[0];
  }
  const candidates = [
    d.otp,
    d.code,
    d.sms_code,
    d.sms,
    d.message,
    d.data?.otp,
    d.data?.code,
    d.data?.sms_code,
    d.data?.sms
  ];
  for (const item of candidates) {
    if (!item || typeof item === 'object') continue;
    const str = String(item).trim();
    if (/CLICK_TEST_BUTTON|NO_SMS|WAITING|PENDING/i.test(str)) continue;
    const match = str.match(/\b\d{4,8}\b/);
    if (match) return match[0];
  }
  return null;
}

function extractNumberFromPayload(d) {
  if (!d) return null;
  if (typeof d === 'string') {
    const m = d.match(/\+?\d{6,15}/);
    return m ? m[0] : null;
  }
  if (typeof d !== 'object') return null;

  const candidates = [
    d.phoneNumber,
    d.number,
    d.phone,
    d.mobile,
    d.msisdn,
    d.data?.phoneNumber,
    d.data?.number,
    d.data?.phone,
    d.data?.mobile,
    d.data?.msisdn,
    d.result?.phoneNumber,
    d.result?.number,
    d.result?.phone,
    Array.isArray(d.data)
      ? (d.data[0]?.phoneNumber || d.data[0]?.number || d.data[0]?.phone || d.data[0])
      : null,
    Array.isArray(d.numbers)
      ? (d.numbers[0]?.phoneNumber || d.numbers[0]?.number || d.numbers[0]?.phone || d.numbers[0])
      : null
  ];

  for (const val of candidates) {
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return null;
}

function extractOrderIdFromPayload(d) {
  if (!d || typeof d !== 'object') return null;
  const candidates = [
    d.orderId,
    d.order_id,
    d.activation_id,
    d.id,
    d.data?.orderId,
    d.data?.order_id,
    d.data?.id
  ];
  for (const val of candidates) {
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return null;
}

function isApiReady() {
  return Boolean(state.apiUrlEnabled && state.apiUrl);
}

async function fetchOtpViaApi(phone, orderId = '') {
  if (!isApiReady() || (!phone && !orderId)) return null;
  const endpoint = buildApiEndpoint('/get-otp', {
    orderId,
    order_id: orderId,
    number: phone,
    phone
  });
  console.log('[NXV GET-OTP URL]:', endpoint);
  const res = await axios.get(endpoint, { timeout: 10000 });
  console.log('[NXV GET-OTP RESP]:', JSON.stringify(res.data));
  return extractOtpFromPayload(res.data || {});
}

async function fetchNumberViaApi(service = '', countryKey = '') {
  if (!isApiReady()) return null;
  const countryMeta = resolveCountryInfo(countryKey);
  const params = {
    service: service && service !== 'NXV Auto' ? service : 'WhatsApp'
  };
  if (countryKey && countryKey !== 'api_auto' && countryKey !== 'all') {
    params.country = countryKey;
    if (countryMeta.iso) params.country_code = countryMeta.iso;
    if (countryMeta.dial) params.dial_code = countryMeta.dial;
  }

  const endpoint = buildApiEndpoint('/get-number', params);
  console.log('[NXV GET-NUMBER URL]:', endpoint);
  const res = await axios.get(endpoint, { timeout: 10000 });
  console.log('[NXV GET-NUMBER RESP]:', JSON.stringify(res.data));

  const data = res.data || {};
  const rawNum = extractNumberFromPayload(data);
  if (!rawNum) return null;

  const digits = rawNum.replace(/[^\d]/g, '');
  if (digits.length < 6) return null;

  const formattedPhone = `+${digits}`;
  const orderId = extractOrderIdFromPayload(data);

  return {
    phone: formattedPhone,
    orderId,
    raw: data
  };
}

function matchesExpectedCountry(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  return digits.length >= 6;
}

async function fetchBalanceViaApi() {
  if (!isApiReady()) {
    return { ok: false, error: 'API URL বা API KEY সক্রিয় নেই।' };
  }
  const endpoint = buildApiEndpoint('/balance');
  console.log('[NXV BALANCE URL]:', endpoint);
  const res = await axios.get(endpoint, { timeout: 10000 });
  console.log('[NXV BALANCE RESP]:', JSON.stringify(res.data));
  return { ok: true, data: res.data };
}

function normalizePhoneKey(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}

function detectCountryForPhone(phone) {
  const cleanDigits = normalizePhoneKey(phone);

  const matchedEntry = state.numberEntries.find(
    (e) => normalizePhoneKey(e.phone) === cleanDigits
  );
  if (matchedEntry) {
    return {
      key: matchedEntry.countryKey || resolveCountryInfo(matchedEntry.countryLabel).key,
      label: matchedEntry.countryLabel || resolveCountryInfo(matchedEntry.countryKey).label,
      dial: matchedEntry.dial || resolveCountryInfo(matchedEntry.countryKey).dial
    };
  }

  for (const [, sess] of state.userSession.entries()) {
    if (!sess || !Array.isArray(sess.batchEntries)) continue;
    const found = sess.batchEntries.find(
      (b) => normalizePhoneKey(b.phone) === cleanDigits
    );
    if (found) {
      return {
        key: found.countryKey || resolveCountryInfo(found.countryLabel).key,
        label: found.countryLabel || resolveCountryInfo(found.countryKey).label,
        dial: found.dial || resolveCountryInfo(found.countryKey).dial
      };
    }
  }

  const sortedByDialLen = [...COUNTRY_META]
    .filter((c) => c.dial)
    .sort((a, b) => b.dial.length - a.dial.length);

  for (const c of sortedByDialLen) {
    if (cleanDigits.startsWith(c.dial)) {
      return {
        key: c.name.toLowerCase(),
        label: `${c.flag} ${c.name} (${c.iso})`,
        dial: c.dial
      };
    }
  }

  return {
    key: 'unknown',
    label: '🌍 Unknown Country',
    dial: ''
  };
}

async function recordCountryOtpTraffic(phone) {
  const country = detectCountryForPhone(phone);
  if (!state.otpStats || typeof state.otpStats !== 'object') {
    state.otpStats = { total: 0, byCountry: {} };
  }
  if (!state.otpStats.byCountry || typeof state.otpStats.byCountry !== 'object') {
    state.otpStats.byCountry = {};
  }

  const current = state.otpStats.byCountry[country.key] || {
    label: country.label,
    count: 0
  };
  current.label = country.label || current.label;
  current.count = (Number(current.count) || 0) + 1;
  state.otpStats.byCountry[country.key] = current;
  state.otpStats.total = (Number(state.otpStats.total) || 0) + 1;

  await persistOtpStats();
}

function buildTrafficReportText() {
  const totalCodes = Number(state.otpStats?.total) || 0;
  const byCountryObj = state.otpStats?.byCountry || {};
  const entries = Object.values(byCountryObj)
    .filter((item) => item && Number(item.count) > 0)
    .sort((a, b) => Number(b.count) - Number(a.count));

  if (!totalCodes || !entries.length) {
    return (
      `📡 *TRAFFIC REPORT*\n\n` +
      `• মোট কোড: \`0\`টি\n` +
      `• দেশ: \`0\`টি\n\n` +
      `এখনো প্যানেলে কোনো কোড আসেনি।`
    );
  }

  const lines = entries.map((item) => {
    const cCount = Number(item.count) || 0;
    const percent = ((cCount / totalCodes) * 100).toFixed(1);
    return `• ${item.label}: *${cCount}/${totalCodes}* (*${percent}%*)`;
  });

  return (
    `📡 *TRAFFIC REPORT*\n\n` +
    `• মোট কোড: *${totalCodes}*টি\n` +
    `• মোট দেশ: *${entries.length}*টি\n\n` +
    `${lines.join('\n')}`
  );
}

function formatDisplayPhone(rawPhone, stripCC = false, dialCode = '') {
  const digits = String(rawPhone || '').replace(/[^\d]/g, '');
  if (!stripCC) {
    return digits ? `+${digits}` : String(rawPhone || '');
  }
  if (dialCode && digits.startsWith(dialCode) && digits.length > dialCode.length + 3) {
    return digits.slice(dialCode.length);
  }
  if (digits.length > 9) {
    return digits.slice(2);
  }
  return digits;
}

async function notifyUserOtpIfWaiting(phone, otp) {
  const cleanKey = normalizePhoneKey(phone);
  for (const [uid, sess] of state.userSession.entries()) {
    if (!sess || !Array.isArray(sess.batchEntries) || sess.otpDelivered) continue;
    const matched = sess.batchEntries.find(
      (item) => normalizePhoneKey(item.phone) === cleanKey
    );
    if (matched) {
      sess.otpDelivered = true;
      state.userSession.set(uid, sess);
      try {
        await rawSendMessage(
          uid,
          `✅ *OTP রিসিভ হয়েছে!*\n\n` +
            `📱 সার্ভিস: *${matched.service}*\n` +
            `${matched.flag || '🌍'} দেশ: *${matched.countryLabel || matched.countryKey}*\n` +
            `📞 নম্বর: \`${matched.phone}\`\n` +
            `🔑 OTP কোড: \`${otp}\``
        );
      } catch (_) {}
    }
  }
}

async function saveOtp(phone, otp) {
  if (!phone || !otp) return;
  const cleanPhone = String(phone).trim();
  const key = normalizePhoneKey(cleanPhone) || cleanPhone;
  const alreadySaved = Boolean(state.otpsByPhone[key]?.otp);

  state.otpsByPhone[key] = { otp: String(otp), updatedAt: Date.now() };
  await dbPut(`otps/${encodeURIComponent(key)}`, {
    otp: String(otp),
    updatedAt: Date.now()
  });

  if (!alreadySaved) {
    await recordCountryOtpTraffic(cleanPhone);
  }

  await notifyUserOtpIfWaiting(cleanPhone, String(otp));
}

async function getSavedOtp(phone) {
  const key = normalizePhoneKey(phone) || String(phone).trim();
  if (state.otpsByPhone[key]?.otp) {
    return state.otpsByPhone[key].otp;
  }
  const remote = await dbGet(`otps/${encodeURIComponent(key)}`);
  if (remote?.otp) {
    state.otpsByPhone[key] = remote;
    return remote.otp;
  }
  return null;
}

function extractFormattedPhones(rawText, dialCode = '') {
  const tokens = String(rawText || '').split(/[\r\n,;\t]+/);
  const result = [];
  for (const tok of tokens) {
    const formatted = attachCountryCode(tok, dialCode);
    if (formatted) {
      result.push(formatted);
    }
  }
  return [...new Set(result)];
}

async function broadcastNewNumbers(service, countryLabel, addedCount, sourceLabel) {
  if (!addedCount || addedCount <= 0) return;
  const userMsg =
    `🔔 *নতুন নম্বর যুক্ত হয়েছে!*\n\n` +
    `📱 সার্ভিস: *${service}*\n` +
    `🌍 দেশ: *${countryLabel}*\n` +
    `🔢 যুক্ত হওয়া নম্বর: *${addedCount}*টি\n` +
    `📦 মাধ্যম: *${sourceLabel}*`;

  for (const uid of state.users) {
    try {
      await rawSendMessage(uid, userMsg);
    } catch (_) {}
  }
}

async function checkPanelNewNumbersAndNotify() {
  if (!isApiReady() || !state.users.length) return;
  try {
    const entries = await fetchPanelRangeEntries('');
    if (!entries.length) return;

    const currentSnapshot = {};
    for (const item of entries) {
      const k = `${item.service.toLowerCase()}__${item.countryKey}`;
      currentSnapshot[k] = {
        service: item.service,
        countryLabel: item.countryLabel,
        count: (currentSnapshot[k]?.count || 0) + (Number(item.count) || 0)
      };
    }

    const prevSnapshot = state.knownPanelStockSnapshot || {};
    const hasPrev = Object.keys(prevSnapshot).length > 0;

    if (hasPrev) {
      for (const [k, cur] of Object.entries(currentSnapshot)) {
        const prevCount = Number(prevSnapshot[k]?.count) || 0;
        const curCount = Number(cur.count) || 0;
        if (curCount > prevCount) {
          const diff = curCount - prevCount;
          await broadcastNewNumbers(cur.service, cur.countryLabel, diff, 'API Panel');
        }
      }
    }

    state.knownPanelStockSnapshot = currentSnapshot;
  } catch (_) {}
}

async function finalizeAddedNumbers(ctx, service, rawCountry, rawNumbers, sourceLabel) {
  const countryInfo = resolveCountryInfo(rawCountry);
  const phones = extractFormattedPhones(rawNumbers, countryInfo.dial);

  if (!phones.length) {
    await rawSendMessage(ctx.chat.id, '⚠️ কোনো বৈধ ফোন নম্বর পাওয়া যায়নি। আবার চেষ্টা করুন।');
    return;
  }

  const baseTime = Date.now();
  const existingPhoneSet = new Set(
    state.numberEntries
      .filter(
        (e) =>
          e.service.toLowerCase() === service.trim().toLowerCase() &&
          e.countryKey === countryInfo.key
      )
      .map((e) => normalizePhoneKey(e.phone))
  );

  let addedCount = 0;
  phones.forEach((phone, idx) => {
    const pKey = normalizePhoneKey(phone);
    if (!existingPhoneSet.has(pKey)) {
      existingPhoneSet.add(pKey);
      state.numberEntries.push({
        id: `${baseTime}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        service: service.trim(),
        countryKey: countryInfo.key,
        countryLabel: countryInfo.label,
        flag: countryInfo.flag,
        dial: countryInfo.dial,
        phone,
        source: 'manual',
        orderId: null
      });
      addedCount++;
    }
  });

  await persistEntries();

  const totalForCountry = state.numberEntries.filter(
    (e) =>
      e.service.toLowerCase() === service.trim().toLowerCase() &&
      e.countryKey === countryInfo.key
  ).length;

  await rawSendMessage(
    ctx.chat.id,
    `আসসালামু আলাইকুম স্যার, নাম্বার যুক্ত করা সম্পুর্ন হয়েছে স্যার\n\n` +
      `📱 সার্ভিস: *${service}*\n` +
      `🌍 দেশ: *${countryInfo.label}*\n` +
      `➕ নতুন যুক্ত হয়েছে: *${addedCount}*টি\n` +
      `📦 এই দেশে মোট নম্বর: \`${totalForCountry}\`টি (সর্বমোট: \`${state.numberEntries.length}\`টি)`
  );

  await broadcastNewNumbers(service, countryInfo.label, addedCount, sourceLabel);
}

async function isUserVerifiedInGroups(ctx) {
  if (!state.joinCheck) return true;
  const checks = [];
  if (state.mainGroupId) checks.push(state.mainGroupId);
  if (state.otpGroupId) checks.push(state.otpGroupId);
  if (!checks.length) return true;

  for (const chatId of checks) {
    try {
      const member = await ctx.telegram.getChatMember(chatId, ctx.from.id);
      if (!member || ['left', 'kicked'].includes(member.status)) {
        return false;
      }
      if (member.status === 'restricted' && member.is_member === false) {
        return false;
      }
    } catch (_) {
      return false;
    }
  }
  return true;
}

async function sendGroupVerifyPrompt(ctx) {
  const rows = [];
  if (state.mainGroupLink) {
    rows.push([inlineUrlButton('🟦 Join Main Group', state.mainGroupLink, 'primary')]);
  }
  if (state.otpGroupLink) {
    rows.push([inlineUrlButton('🟪 Join OTP Group', state.otpGroupLink, 'primary')]);
  }
  rows.push([inlineCbButton('🟢 Verify Join', 'verify_group_join', 'success')]);

  await sendCleanBoard(
    ctx,
    '🔒 বট ব্যবহার করতে হলে আগে নিচের গ্রুপগুলোতে জয়েন করুন এবং **Verify Join** চাপুন:',
    { reply_markup: buildInlineMarkup(rows) }
  );
}

function getMainReplyKeyboard(isAdmin) {
  const rows = [
    [kbButton('🟢 GET NUMBER', 'success')],
    [kbButton('🟣 WALLET'), kbButton('🔵 TRAFFIC', 'primary')],
    [kbButton('🩵 WA CHECKER', 'primary')],
    [kbButton('🟠 LANGUAGE'), kbButton('🩷 SUPPORT')],
    [kbButton('🟡 NUMBER FILE', 'danger')]
  ];
  if (isAdmin) rows.push([kbButton('💠 ADMIN PANEL', 'danger')]);
  return buildReplyMarkup(rows);
}

function maskSecret(val) {
  if (!val) return 'Not set';
  if (val.length <= 6) return '******';
  return `${val.slice(0, 3)}***${val.slice(-3)}`;
}

function getMainAdminPayload() {
  const text =
    `💠 *ADMIN PANEL*\n\n` +
    `• *Saved Numbers:* \`${state.numberEntries.length}\`\n` +
    `• *Total Codes:* \`${state.otpStats.total || 0}\`\n` +
    `• *Total Users:* \`${state.users.length}\`\n` +
    `• *Active Setup:* *${getActiveSummaryLabel()}*\n` +
    `• *API URL:* ${state.apiUrlEnabled ? '🟢 ON' : '🔴 OFF'}\n` +
    `• *API KEY:* ${state.apiKeyEnabled ? '🟢 ON' : '🔴 OFF'}\n` +
    `• *Join Check:* ${state.joinCheck ? '🟢 ON' : '🔴 OFF'}`;

  const markup = buildInlineMarkup([
    [
      inlineCbButton('🟢 Add Number', 'adm_add_number', 'success'),
      inlineCbButton('🔴 Delete by Country', 'sub_delete_country', 'danger')
    ],
    [
      inlineCbButton('🔵 API URL Setup', 'sub_api_url_menu', 'primary'),
      inlineCbButton('🟣 API KEY Setup', 'sub_api_key_menu', 'primary')
    ],
    [
      inlineCbButton(
        state.apiUrlEnabled ? '🔴 API URL OFF' : '🟢 API URL ON',
        'tgl_api_url',
        state.apiUrlEnabled ? 'danger' : 'success'
      ),
      inlineCbButton(
        state.apiKeyEnabled ? '🔴 API KEY OFF' : '🟢 API KEY ON',
        'tgl_api_key',
        state.apiKeyEnabled ? 'danger' : 'success'
      )
    ],
    [
      inlineCbButton('🟡 Check Balance', 'adm_check_balance', 'primary'),
      inlineCbButton('🟠 Group Setup', 'sub_group_menu', 'primary')
    ],
    [inlineCbButton('🔴 All OFF', 'all_off_btn', 'danger')]
  ]);

  return { text, markup };
}

function getApiUrlSetupPayload() {
  const text =
    `🔵 *API URL SETUP*\n\n` +
    `• *Status:* *${state.apiUrlEnabled ? '🟢 ON' : '🔴 OFF'}*\n` +
    `• *API URL:* \`${state.apiUrl || DEFAULT_NXV_BASE}\``;

  const markup = buildInlineMarkup([
    [inlineCbButton('🟦 Set API URL', 'cfg_api_url', 'primary')],
    [
      inlineCbButton(
        state.apiUrlEnabled ? '🔴 API URL OFF' : '🟢 API URL ON',
        'tgl_api_url',
        state.apiUrlEnabled ? 'danger' : 'success'
      ),
      inlineCbButton('🔴 All OFF', 'all_off_btn', 'danger')
    ],
    [inlineCbButton('🟣 Back to Admin Panel', 'back_admin_main', 'primary')]
  ]);

  return { text, markup };
}

function getApiKeySetupPayload() {
  const text =
    `🟣 *API KEY SETUP*\n\n` +
    `• *Status:* *${state.apiKeyEnabled ? '🟢 ON' : '🔴 OFF'}*\n` +
    `• *API KEY:* \`${maskSecret(state.apiKey)}\``;

  const markup = buildInlineMarkup([
    [inlineCbButton('🟪 Set API KEY', 'cfg_api_key', 'primary')],
    [
      inlineCbButton(
        state.apiKeyEnabled ? '🔴 API KEY OFF' : '🟢 API KEY ON',
        'tgl_api_key',
        state.apiKeyEnabled ? 'danger' : 'success'
      ),
      inlineCbButton('🔴 All OFF', 'all_off_btn', 'danger')
    ],
    [inlineCbButton('🟣 Back to Admin Panel', 'back_admin_main', 'primary')]
  ]);

  return { text, markup };
}

function getDeleteByCountryPayload() {
  const countryGroups = new Map();
  for (const item of state.numberEntries) {
    const cKey = item.countryKey || resolveCountryInfo(item.countryLabel).key;
    const cLabel = item.countryLabel || resolveCountryInfo(cKey).label;
    const prev = countryGroups.get(cKey) || { label: cLabel, count: 0 };
    prev.count += 1;
    countryGroups.set(cKey, prev);
  }

  const list = Array.from(countryGroups.entries());
  if (!list.length) {
    return {
      text: '🔴 *DELETE BY COUNTRY*\n\nস্টকে কোনো নম্বর নেই।',
      markup: buildInlineMarkup([
        [inlineCbButton('🟣 Back to Admin Panel', 'back_admin_main', 'primary')]
      ])
    };
  }

  const rows = [];
  for (let i = 0; i < list.length; i += 2) {
    const [k1, info1] = list[i];
    const row = [
      inlineCbButton(
        `🔴 ${info1.label} (${info1.count})`,
        `del_cnt_${encodeURIComponent(k1)}`,
        'danger'
      )
    ];
    if (list[i + 1]) {
      const [k2, info2] = list[i + 1];
      row.push(
        inlineCbButton(
          `🔴 ${info2.label} (${info2.count})`,
          `del_cnt_${encodeURIComponent(k2)}`,
          'danger'
        )
      );
    }
    rows.push(row);
  }
  rows.push([inlineCbButton('🟣 Back to Admin Panel', 'back_admin_main', 'primary')]);

  return {
    text:
      `🔴 *DELETE BY COUNTRY*\n\n` +
      `যে দেশের বাটনে চাপবেন, শুধুমাত্র সেই দেশের নম্বরগুলো ডিলিট হবে:`,
    markup: buildInlineMarkup(rows)
  };
}

function getGroupSetupPayload() {
  const text =
    `🟠 *GROUP SETUP*\n\n` +
    `• *Join Check:* ${state.joinCheck ? '🟢 ON' : '🔴 OFF'}\n` +
    `• *Main Link:* ${state.mainGroupLink || 'Not set'}\n` +
    `• *Main ID:* \`${state.mainGroupId || 'Not set'}\`\n` +
    `• *OTP Link:* ${state.otpGroupLink || 'Not set'}\n` +
    `• *OTP ID:* \`${state.otpGroupId || 'Not set'}\``;

  const markup = buildInlineMarkup([
    [
      inlineCbButton('🟦 Set Main Link', 'adm_main_link', 'primary'),
      inlineCbButton('🟦 Set Main ID', 'adm_main_id', 'primary')
    ],
    [
      inlineCbButton('🟪 Set OTP Link', 'adm_otp_link', 'primary'),
      inlineCbButton('🟪 Set OTP ID', 'adm_otp_id', 'primary')
    ],
    [
      inlineCbButton(
        state.joinCheck ? '🟡 Join Check OFF' : '🟢 Join Check ON',
        'adm_toggle_join',
        state.joinCheck ? 'danger' : 'success'
      )
    ],
    [inlineCbButton('🟣 Back to Admin Panel', 'back_admin_main', 'primary')]
  ]);

  return { text, markup };
}

setInterval(async () => {
  for (const [uid, sess] of state.userSession.entries()) {
    if (!sess || !sess.autoChecker || sess.otpDelivered || !Array.isArray(sess.batchEntries)) {
      continue;
    }
    for (const item of sess.batchEntries) {
      let otp = await getSavedOtp(item.phone);
      if (!otp && isApiReady()) {
        try {
          otp = await fetchOtpViaApi(item.phone, item.orderId || '');
          if (otp) await saveOtp(item.phone, otp);
        } catch (err) {
          console.error('[NXV GET-OTP ERR]:', err.response?.data || err.message);
        }
      }
      if (otp) {
        sess.otpDelivered = true;
        state.userSession.set(uid, sess);
        try {
          await rawSendMessage(
            uid,
            `✅ *OTP রিসিভ হয়েছে!*\n\n` +
              `📱 সার্ভিস: *${item.service}*\n` +
              `${item.flag || '🌍'} দেশ: *${item.countryLabel || item.countryKey}*\n` +
              `📞 নম্বর: \`${item.phone}\`\n` +
              `🔑 OTP কোড: \`${otp}\``
          );
        } catch (_) {}
        break;
      }
    }
  }
}, 4000);

setInterval(async () => {
  await checkPanelNewNumbersAndNotify();
}, 25000);

bot.start(async (ctx) => {
  await registerUser(ctx.from.id);
  const isAdmin = ADMIN_IDS.includes(ctx.from.id);
  if (!isAdmin && !(await isUserVerifiedInGroups(ctx))) {
    await rawSendMessage(ctx.chat.id, 'স্বাগতম! নিচের মেনু:', {
      reply_markup: getMainReplyKeyboard(false)
    });
    return sendGroupVerifyPrompt(ctx);
  }
  await sendCleanBoard(ctx, 'স্বাগতম! নিচের মেনু থেকে অপশন বেছে নিন:', {
    reply_markup: getMainReplyKeyboard(isAdmin)
  });
});

bot.action('verify_group_join', async (ctx) => {
  await registerUser(ctx.from.id);
  const ok = await isUserVerifiedInGroups(ctx);
  if (ok) {
    await ctx.answerCbQuery('✅ ভেরিফাই সফল হয়েছে!');
    await sendCleanBoard(ctx, '✅ গ্রুপ ভেরিফিকেশন সম্পন্ন হয়েছে। এখন বট ব্যবহার করতে পারবেন।');
  } else {
    await ctx.answerCbQuery('❌ আগে গ্রুপগুলোতে জয়েন করুন।', { show_alert: true });
  }
});

async function renderPayload(ctx, payloadGetter, toastText = '') {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.answerCbQuery('শুধুমাত্র অ্যাডমিন ব্যবহার করতে পারবেন।', { show_alert: true });
  }
  if (toastText) await ctx.answerCbQuery(toastText);
  const { text, markup } = payloadGetter();
  await sendCleanBoard(ctx, text, { reply_markup: markup, preferEdit: true });
}

bot.hears('💠 ADMIN PANEL', async (ctx) => {
  await registerUser(ctx.from.id);
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const { text, markup } = getMainAdminPayload();
  await sendCleanBoard(ctx, text, { reply_markup: markup });
});

bot.action('back_admin_main', (ctx) => renderPayload(ctx, getMainAdminPayload));
bot.action('sub_api_url_menu', (ctx) => renderPayload(ctx, getApiUrlSetupPayload));
bot.action('sub_api_key_menu', (ctx) => renderPayload(ctx, getApiKeySetupPayload));
bot.action('sub_group_menu', (ctx) => renderPayload(ctx, getGroupSetupPayload));
bot.action('sub_delete_country', (ctx) => renderPayload(ctx, getDeleteByCountryPayload));

bot.action('adm_check_balance', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.answerCbQuery('শুধুমাত্র অ্যাডমিন ব্যবহার করতে পারবেন।', { show_alert: true });
  }
  await ctx.answerCbQuery('ব্যালেন্স চেক করা হচ্ছে...');
  try {
    const res = await fetchBalanceViaApi();
    if (!res.ok) {
      return sendCleanBoard(ctx, `⚠️ ${res.error}`);
    }
    await sendCleanBoard(
      ctx,
      `🟡 *API BALANCE RESPONSE:*\n\`${JSON.stringify(res.data, null, 2).slice(0, 1500)}\``
    );
  } catch (err) {
    console.error('[NXV BALANCE ERR]:', err.response?.data || err.message);
    const detail = err.response?.data
      ? JSON.stringify(err.response.data).slice(0, 500)
      : err.message;
    await sendCleanBoard(ctx, `❌ ব্যালেন্স চেক ব্যর্থ: \`${detail}\``);
  }
});

bot.action(/^del_cnt_(.+)$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.answerCbQuery('শুধুমাত্র অ্যাডমিন ব্যবহার করতে পারবেন।', { show_alert: true });
  }
  const targetKey = decodeURIComponent(ctx.match[1]);
  const beforeCount = state.numberEntries.length;

  state.numberEntries = state.numberEntries.filter((item) => {
    const itemKey = item.countryKey || resolveCountryInfo(item.countryLabel).key;
    return itemKey !== targetKey;
  });

  const deletedCount = beforeCount - state.numberEntries.length;
  await persistEntries();

  const countryTitle = resolveCountryInfo(targetKey).label;
  await renderPayload(
    ctx,
    getDeleteByCountryPayload,
    `${countryTitle} এর ${deletedCount}টি নম্বর ডিলিট হয়েছে`
  );
});

bot.action('tgl_api_url', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.apiUrlEnabled = !state.apiUrlEnabled;
  state.cachedApiServices = null;
  state.cachedApiRanges = null;
  await dbPut('config/apiUrlEnabled', state.apiUrlEnabled);
  await renderPayload(
    ctx,
    getApiUrlSetupPayload,
    state.apiUrlEnabled ? 'API URL ON' : 'API URL OFF'
  );
});

bot.action('tgl_api_key', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.apiKeyEnabled = !state.apiKeyEnabled;
  state.cachedApiServices = null;
  state.cachedApiRanges = null;
  await dbPut('config/apiKeyEnabled', state.apiKeyEnabled);
  await renderPayload(
    ctx,
    getApiKeySetupPayload,
    state.apiKeyEnabled ? 'API KEY ON' : 'API KEY OFF'
  );
});

bot.action('all_off_btn', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  await turnAllOff();
  state.cachedApiServices = null;
  state.cachedApiRanges = null;
  await renderPayload(ctx, getMainAdminPayload, 'সব API অপশন OFF করা হয়েছে');
});

bot.action('adm_add_number', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.answerCbQuery('শুধুমাত্র অ্যাডমিন ব্যবহার করতে পারবেন।', { show_alert: true });
  }
  state.adminWizard.set(ctx.from.id, { step: 'ask_service', draft: {} });
  await ctx.answerCbQuery();
  await sendCleanBoard(
    ctx,
    '1️⃣ সার্ভিসের নাম লিখুন (যেমন: `WhatsApp` অথবা `Telegram` বা আপনার পছন্দমতো):'
  );
});

bot.action('adm_toggle_join', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.answerCbQuery('শুধুমাত্র অ্যাডমিন ব্যবহার করতে পারবেন।', { show_alert: true });
  }
  state.joinCheck = !state.joinCheck;
  await dbPut('config/joinCheck', state.joinCheck);
  await renderPayload(
    ctx,
    getGroupSetupPayload,
    state.joinCheck ? 'Join Check ON' : 'Join Check OFF'
  );
});

function startFieldPrompt(stepKey, promptMsg) {
  return async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) {
      return ctx.answerCbQuery('শুধুমাত্র অ্যাডমিন ব্যবহার করতে পারবেন।', { show_alert: true });
    }
    state.adminWizard.set(ctx.from.id, { step: stepKey, draft: {} });
    await ctx.answerCbQuery();
    await sendCleanBoard(ctx, `${promptMsg}\n\n_(বাতিল করতে /cancel লিখুন)_`);
  };
}

bot.command('cancel', async (ctx) => {
  if (state.adminWizard.has(ctx.from.id)) {
    state.adminWizard.delete(ctx.from.id);
    await sendCleanBoard(ctx, '✅ সেটআপ বাতিল করা হয়েছে।');
  }
});

bot.action('adm_main_link', startFieldPrompt('set_main_link', '🔗 নতুন *Main Group Link* পাঠান:'));
bot.action('adm_main_id', startFieldPrompt('set_main_id', '🆔 নতুন *Main Group ID* পাঠান:'));
bot.action('adm_otp_link', startFieldPrompt('set_otp_link', '🔗 নতুন *OTP Group Link* পাঠান:'));
bot.action('adm_otp_id', startFieldPrompt('set_otp_id', '🆔 নতুন *OTP Group ID* পাঠান:'));
bot.action('cfg_api_url', startFieldPrompt('set_api_url', '🔵 নতুন *API URL* পাঠান (যেমন: `https://nxv-sms.vercel.app`):'));
bot.action('cfg_api_key', startFieldPrompt('set_api_key', '🟣 নতুন *API KEY* পাঠান:'));

bot.command('setotp', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  const phone = parts[1];
  const otp = parts[2];
  if (!phone || !otp) {
    return rawSendMessage(ctx.chat.id, 'ব্যবহার: `/setotp +201500155889 123456`');
  }
  await saveOtp(phone, otp);
  await rawSendMessage(ctx.chat.id, `✅ \`${phone}\` নম্বরের জন্য OTP \`${otp}\` সেভ ও পাঠানো হয়েছে।`);
});

bot.hears('🩷 SUPPORT', async (ctx) => {
  await registerUser(ctx.from.id);
  state.waitingSupportFrom.add(ctx.from.id);
  await sendCleanBoard(ctx, '🩷 আপনার মেসেজটি লিখুন। সরাসরি সাপোর্টে পাঠানো হবে।');
});

bot.hears('🟡 NUMBER FILE', async (ctx) => {
  await registerUser(ctx.from.id);
  if (!state.numberEntries.length) {
    return sendCleanBoard(ctx, '🟡 বর্তমানে কোনো নম্বর ফাইল/স্টক যুক্ত নেই।');
  }
  const summaryMap = new Map();
  for (const item of state.numberEntries) {
    const key = `${item.service} | ${item.countryLabel || item.countryKey}`;
    summaryMap.set(key, (summaryMap.get(key) || 0) + 1);
  }
  const lines = Array.from(summaryMap.entries()).map(
    ([key, count]) => `• *${key}*: \`${count}\`টি`
  );
  await sendCleanBoard(
    ctx,
    `🟡 *NUMBER FILE STOCK*\n\n${lines.join('\n')}\n\n📦 মোট সংরক্ষিত নম্বর: \`${state.numberEntries.length}\`টি`
  );
});

async function showServiceSelection(ctx, isEdit = false) {
  const stockServices = [...new Set(state.numberEntries.map((e) => e.service).filter(Boolean))];
  const panelServices = isApiReady() ? await fetchPanelServices() : [];

  if (!stockServices.length && !isApiReady()) {
    return sendCleanBoard(ctx, '⚠️ এখন কোনো সার্ভিস বা নম্বর স্টকে নেই।');
  }

  const serviceList = isApiReady()
    ? [...new Set([...panelServices, ...stockServices, ...(panelServices.length ? [] : FALLBACK_SERVICES)])]
    : stockServices;

  const rows = [];
  for (let i = 0; i < serviceList.length; i += 2) {
    const row = [
      inlineCbButton(
        `🟢 ${serviceList[i].toUpperCase()}`,
        `pick_srv_${encodeURIComponent(serviceList[i])}`,
        'success'
      )
    ];
    if (serviceList[i + 1]) {
      row.push(
        inlineCbButton(
          `🔵 ${serviceList[i + 1].toUpperCase()}`,
          `pick_srv_${encodeURIComponent(serviceList[i + 1])}`,
          'primary'
        )
      );
    }
    rows.push(row);
  }

  const msgText = '🟡 *Select a premium Service*';
  await sendCleanBoard(ctx, msgText, {
    reply_markup: buildInlineMarkup(rows),
    preferEdit: isEdit
  });
}

bot.hears('🟢 GET NUMBER', async (ctx) => {
  await registerUser(ctx.from.id);
  await keepOnlyLatestGetNumberTrigger(ctx);
  const isAdmin = ADMIN_IDS.includes(ctx.from.id);
  if (!isAdmin && !(await isUserVerifiedInGroups(ctx))) {
    return sendGroupVerifyPrompt(ctx);
  }
  await showServiceSelection(ctx, false);
});

async function showCountrySelection(ctx, service, isEdit = true) {
  const entriesForService = state.numberEntries.filter(
    (e) => e.service.toLowerCase() === service.toLowerCase()
  );

  const countryMap = new Map();
  for (const item of entriesForService) {
    const cKey = item.countryKey || resolveCountryInfo(item.countryLabel).key;
    const cLabel = item.countryLabel || resolveCountryInfo(cKey).label;
    if (!countryMap.has(cKey)) {
      countryMap.set(cKey, cLabel);
    }
  }

  if (isApiReady()) {
    const panelCountries = await fetchPanelCountriesForService(service);
    for (const rawLbl of panelCountries) {
      const info = resolveCountryInfo(rawLbl);
      if (!countryMap.has(info.key)) {
        countryMap.set(info.key, info.label);
      }
    }

    for (const c of COUNTRY_META) {
      const k = c.name.toLowerCase();
      if (!countryMap.has(k)) {
        countryMap.set(k, `${c.flag} ${c.name} (${c.iso})`);
      }
    }
  }

  const countries = Array.from(countryMap.entries());
  if (!countries.length) {
    const emptyText = `⚠️ *${service}* সার্ভিসে এখন কোনো দেশ বা নম্বর নেই।`;
    const markup = buildInlineMarkup([
      [inlineCbButton('🔴 BACK TO SERVICE', 'back_srv_list', 'danger')]
    ]);
    return sendCleanBoard(ctx, emptyText, { reply_markup: markup, preferEdit: isEdit });
  }

  const rows = [];
  if (isApiReady()) {
    rows.push([
      inlineCbButton(
        `🌍 Any Available Country (Auto)`,
        `pick_cnt_${encodeURIComponent(service)}__${encodeURIComponent('api_auto')}`,
        'success'
      )
    ]);
  }

  for (let i = 0; i < countries.length; i += 2) {
    const [k1, lbl1] = countries[i];
    const row = [
      inlineCbButton(
        `🔵 ${lbl1}`,
        `pick_cnt_${encodeURIComponent(service)}__${encodeURIComponent(k1)}`,
        'primary'
      )
    ];
    if (countries[i + 1]) {
      const [k2, lbl2] = countries[i + 1];
      row.push(
        inlineCbButton(
          `🟢 ${lbl2}`,
          `pick_cnt_${encodeURIComponent(service)}__${encodeURIComponent(k2)}`,
          'success'
        )
      );
    }
    rows.push(row);
  }
  rows.push([inlineCbButton('🔴 BACK TO SERVICE', 'back_srv_list', 'danger')]);

  const msgText = `📱 *${service} Select Country:*`;
  await sendCleanBoard(ctx, msgText, {
    reply_markup: buildInlineMarkup(rows),
    preferEdit: isEdit
  });
}

bot.action(/^pick_srv_(.+)$/, async (ctx) => {
  const service = decodeURIComponent(ctx.match[1]);
  await ctx.answerCbQuery();
  await showCountrySelection(ctx, service, true);
});

bot.action('back_srv_list', async (ctx) => {
  await ctx.answerCbQuery();
  await showServiceSelection(ctx, true);
});

async function buildAssignedCard(userId, service, countryKey, options = {}) {
  const existingSess = state.userSession.get(userId) || {};
  const autoChecker =
    typeof options.autoChecker === 'boolean'
      ? options.autoChecker
      : existingSess.autoChecker !== false;
  const stripCC =
    typeof options.stripCC === 'boolean'
      ? options.stripCC
      : Boolean(existingSess.stripCC);

  const pool = state.numberEntries.filter(
    (e) =>
      e.service.toLowerCase() === service.toLowerCase() &&
      (e.countryKey || resolveCountryInfo(e.countryLabel).key) === countryKey
  );

  const requestedMeta = resolveCountryInfo(countryKey);
  let picked = [];
  let countryLabel = requestedMeta.label;
  let flag = requestedMeta.flag;
  let noNumberMsg = '';
  let offset =
    typeof existingSess.offset === 'number' &&
    existingSess.service === service &&
    existingSess.countryKey === countryKey
      ? existingSess.offset
      : 0;

  if (pool.length) {
    const sampleMeta = pool[0];
    countryLabel = sampleMeta.countryLabel || requestedMeta.label;
    flag = sampleMeta.flag || requestedMeta.flag;

    if (options.advanceBatch) {
      offset = (offset + 3) % pool.length;
    } else if (!options.keepCurrentBatch) {
      offset = 0;
    }

    picked =
      options.keepCurrentBatch &&
      Array.isArray(existingSess.batchEntries) &&
      existingSess.batchEntries.length
        ? existingSess.batchEntries
        : [];

    if (!picked.length || options.advanceBatch || !options.keepCurrentBatch) {
      picked = [];
      for (let i = 0; i < Math.min(3, pool.length); i++) {
        picked.push(pool[(offset + i) % pool.length]);
      }
    }
  } else if (isApiReady()) {
    if (
      options.keepCurrentBatch &&
      Array.isArray(existingSess.batchEntries) &&
      existingSess.batchEntries.length
    ) {
      picked = existingSess.batchEntries;
      countryLabel = existingSess.countryLabel || countryLabel;
      flag = existingSess.flag || flag;
    } else {
      try {
        const apiNum = await fetchNumberViaApi(service, countryKey === 'api_auto' ? '' : countryKey);
        if (apiNum?.phone && matchesExpectedCountry(apiNum.phone)) {
          const cInfo = detectCountryForPhone(apiNum.phone);
          countryLabel =
            countryKey !== 'api_auto' && requestedMeta.label
              ? requestedMeta.label
              : cInfo.label;
          flag =
            countryLabel.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0] ||
            requestedMeta.flag ||
            '🌍';
          picked = [
            {
              service,
              countryKey: countryKey !== 'api_auto' ? requestedMeta.key : cInfo.key,
              countryLabel,
              flag,
              dial: cInfo.dial || requestedMeta.dial || '',
              phone: apiNum.phone,
              source: 'api',
              orderId: apiNum.orderId || null
            }
          ];
        } else {
          noNumberMsg = `${requestedMeta.label} এর জন্য বর্তমানে প্যানেলে কোনো নম্বর নেই।`;
        }
      } catch (err) {
        console.error('[NXV GET-NUMBER ERR]:', err.response?.data || err.message);
        noNumberMsg = `${requestedMeta.label} এর জন্য বর্তমানে প্যানেলে কোনো নম্বর নেই।`;
      }
    }
  }

  if (!picked.length) {
    const statusMsg = noNumberMsg || `${requestedMeta.label} এর জন্য বর্তমানে প্যানেলে কোনো নম্বর নেই।`;
    return {
      text: `⚠️ *${service}* — ${statusMsg}`,
      markup: buildInlineMarkup([
        [inlineCbButton('🔵 Change Country', `chg_cnt_${encodeURIComponent(service)}`, 'primary')],
        [inlineCbButton('🔴 BACK TO SERVICE', 'back_srv_list', 'danger')]
      ])
    };
  }

  const otpLines = [];
  let anyOtpFound = false;

  for (const item of picked) {
    let savedOtp = await getSavedOtp(item.phone);
    if (!savedOtp && isApiReady()) {
      try {
        savedOtp = await fetchOtpViaApi(item.phone, item.orderId || '');
        if (savedOtp) await saveOtp(item.phone, savedOtp);
      } catch (err) {
        console.error('[NXV GET-OTP ERR]:', err.response?.data || err.message);
      }
    }
    if (savedOtp) {
      anyOtpFound = true;
      otpLines.push(`✅ \`${item.phone}\` → 🔑 *${savedOtp}*`);
    }
  }

  state.userSession.set(userId, {
    service,
    countryKey,
    countryLabel,
    flag,
    batchEntries: picked,
    offset,
    autoChecker,
    stripCC,
    otpDelivered: anyOtpFound
  });

  const statusLine = anyOtpFound
    ? `✅ *${service} OTP Received:*\n${otpLines.join('\n')}`
    : `⏳ *Waiting for OTP....*`;

  const text = `${flag} *${service} Number Assigned:*\n${statusLine}`;

  const keyboardRows = [];
  picked.forEach((item) => {
    const shownNum = formatDisplayPhone(item.phone, stripCC, item.dial);
    keyboardRows.push([
      inlineCbButton(
        `🟢 ${flag} 📋 ${shownNum}`,
        `copy_num_${encodeURIComponent(item.phone)}`,
        'success'
      )
    ]);
  });

  keyboardRows.push([
    inlineCbButton(
      '🔄 Change Number',
      `chg_num_${encodeURIComponent(service)}__${encodeURIComponent(countryKey)}`,
      'primary'
    )
  ]);

  keyboardRows.push([
    inlineCbButton(
      '🔵 Change Country',
      `chg_cnt_${encodeURIComponent(service)}`,
      'primary'
    ),
    inlineCbButton(
      stripCC ? '🟢 Restore CC' : '🔴 Remove CC',
      'toggle_remove_cc',
      stripCC ? 'success' : 'danger'
    )
  ]);

  if (state.otpGroupLink && /^https?:\/\//i.test(state.otpGroupLink)) {
    keyboardRows.push([inlineUrlButton('🟡 Otp Group', state.otpGroupLink, 'primary')]);
  } else {
    keyboardRows.push([inlineCbButton('🟡 Otp Group', 'open_otp_group_fallback', 'primary')]);
  }

  return {
    text,
    markup: buildInlineMarkup(keyboardRows)
  };
}

bot.action(/^pick_cnt_(.+)__(.+)$/, async (ctx) => {
  const service = decodeURIComponent(ctx.match[1]);
  const countryKey = decodeURIComponent(ctx.match[2]);
  await ctx.answerCbQuery();

  const { text, markup } = await buildAssignedCard(ctx.from.id, service, countryKey, {
    keepCurrentBatch: false,
    advanceBatch: false
  });
  await sendCleanBoard(ctx, text, { reply_markup: markup, preferEdit: true });
});

bot.action(/^copy_num_(.+)$/, async (ctx) => {
  const phone = decodeURIComponent(ctx.match[1]);
  await ctx.answerCbQuery(`নম্বর: ${phone}`, { show_alert: false });
  await rawSendMessage(ctx.chat.id, `📋 নম্বর: \`${phone}\``);
});

bot.action('toggle_remove_cc', async (ctx) => {
  const sess = state.userSession.get(ctx.from.id);
  if (!sess) return ctx.answerCbQuery('কোনো সক্রিয় নম্বর নেই।');
  const nextStrip = !sess.stripCC;
  await ctx.answerCbQuery(nextStrip ? 'CC Remove করা হয়েছে' : 'CC যুক্ত করা হয়েছে');
  const { text, markup } = await buildAssignedCard(
    ctx.from.id,
    sess.service,
    sess.countryKey,
    { keepCurrentBatch: true, stripCC: nextStrip }
  );
  try {
    await rawEditMessageText(
      ctx.chat.id,
      ctx.callbackQuery.message.message_id,
      text,
      { reply_markup: markup }
    );
  } catch (_) {}
});

bot.action(/^chg_num_(.+)__(.+)$/, async (ctx) => {
  const service = decodeURIComponent(ctx.match[1]);
  const countryKey = decodeURIComponent(ctx.match[2]);
  await ctx.answerCbQuery('নতুন নম্বর পরিবর্তন করা হচ্ছে...');

  const { text, markup } = await buildAssignedCard(ctx.from.id, service, countryKey, {
    keepCurrentBatch: false,
    advanceBatch: true
  });
  await sendCleanBoard(ctx, text, { reply_markup: markup, preferEdit: true });
});

bot.action(/^chg_cnt_(.+)$/, async (ctx) => {
  const service = decodeURIComponent(ctx.match[1]);
  await ctx.answerCbQuery();
  await showCountrySelection(ctx, service, true);
});

bot.action('open_otp_group_fallback', async (ctx) => {
  await ctx.answerCbQuery();
  await rawSendMessage(
    ctx.chat.id,
    state.otpGroupLink
      ? `🟡 OTP Group Link: ${state.otpGroupLink}`
      : '🟡 OTP Group Link এখনো সেট করা হয়নি।'
  );
});

bot.hears('🟣 WALLET', async (ctx) => {
  await registerUser(ctx.from.id);
  return sendCleanBoard(ctx, '🟣 আপনার ওয়ালেট ব্যালেন্স তথ্য এখানে দেখা যাবে।');
});

bot.hears('🔵 TRAFFIC', async (ctx) => {
  await registerUser(ctx.from.id);
  return sendCleanBoard(ctx, buildTrafficReportText());
});

bot.hears('🩵 WA CHECKER', async (ctx) => {
  await registerUser(ctx.from.id);
  return sendCleanBoard(ctx, '🩵 WhatsApp Checker সার্ভিস প্রস্তুত।');
});

bot.hears('🟠 LANGUAGE', async (ctx) => {
  await registerUser(ctx.from.id);
  return sendCleanBoard(ctx, '🟠 বর্তমান ভাষা: বাংলা (BN)');
});

bot.on('document', async (ctx) => {
  const userId = ctx.from.id;
  await registerUser(userId);
  if (!ADMIN_IDS.includes(userId) || !state.adminWizard.has(userId)) return;

  const current = state.adminWizard.get(userId);
  if (current.step !== 'ask_numbers') return;

  state.adminWizard.delete(userId);
  const { service, country } = current.draft;
  const doc = ctx.message.document;

  try {
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const resp = await axios.get(fileLink.href, {
      responseType: 'text',
      timeout: 20000
    });
    const fileContent =
      typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    await finalizeAddedNumbers(
      ctx,
      service || 'General',
      country || 'Unknown',
      fileContent,
      `Number File (${doc.file_name || 'file.txt'})`
    );
  } catch (err) {
    console.error('Document read error:', err.message);
    await rawSendMessage(ctx.chat.id, '❌ ফাইলটি পড়তে সমস্যা হয়েছে। অনুগ্রহ করে .txt ফাইল পাঠান।');
  }
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  await registerUser(userId);
  const inputText = ctx.message.text.trim();

  if (ADMIN_IDS.includes(userId) && state.adminWizard.has(userId)) {
    const current = state.adminWizard.get(userId);

    if (current.step === 'ask_service') {
      current.draft.service = inputText;
      current.step = 'ask_country';
      state.adminWizard.set(userId, current);
      await rawSendMessage(
        ctx.chat.id,
        '2️⃣ দেশের নাম লিখুন (যেমন: `Afghanistan`, `Egypt`, `Madagascar`, `Pakistan` ইত্যাদি):'
      );
      return;
    }

    if (current.step === 'ask_country') {
      current.draft.country = inputText;
      current.step = 'ask_numbers';
      state.adminWizard.set(userId, current);
      await rawSendMessage(
        ctx.chat.id,
        '3️⃣ এক বা একাধিক নম্বর পাঠান (অটো কান্ট্রি কোড যুক্ত হবে) অথবা `.txt` Number File পাঠান:'
      );
      return;
    }

    if (current.step === 'ask_numbers') {
      state.adminWizard.delete(userId);
      const { service, country } = current.draft;
      await finalizeAddedNumbers(ctx, service, country, inputText, 'Manual Input');
      return;
    }

    state.adminWizard.delete(userId);

    if (current.step === 'set_main_link') {
      state.mainGroupLink = inputText;
      await dbPut('config/mainGroupLink', inputText);
      await rawSendMessage(ctx.chat.id, '✅ Main Group Link সেট হয়েছে।');
      return;
    }

    if (current.step === 'set_main_id') {
      state.mainGroupId = inputText;
      await dbPut('config/mainGroupId', inputText);
      await rawSendMessage(ctx.chat.id, '✅ Main Group ID সেট হয়েছে।');
      return;
    }

    if (current.step === 'set_otp_link') {
      state.otpGroupLink = inputText;
      await dbPut('config/otpGroupLink', inputText);
      await rawSendMessage(ctx.chat.id, '✅ OTP Group Link সেট হয়েছে।');
      return;
    }

    if (current.step === 'set_otp_id') {
      state.otpGroupId = inputText;
      await dbPut('config/otpGroupId', inputText);
      await rawSendMessage(ctx.chat.id, '✅ OTP Group ID সেট হয়েছে।');
      return;
    }

    if (current.step === 'set_api_url') {
      state.apiUrl = inputText;
      state.cachedApiServices = null;
      state.cachedApiRanges = null;
      await dbPut('config/apiUrl', inputText);
      await rawSendMessage(ctx.chat.id, `✅ API URL সেট হয়েছে:\n\`${getNormalizedBaseUrl()}\``);
      return;
    }

    if (current.step === 'set_api_key') {
      state.apiKey = inputText;
      state.cachedApiServices = null;
      state.cachedApiRanges = null;
      await dbPut('config/apiKey', inputText);
      await rawSendMessage(ctx.chat.id, '✅ API KEY সেট হয়েছে।');
      return;
    }
  }

  if (!state.waitingSupportFrom.has(userId)) return;
  state.waitingSupportFrom.delete(userId);

  const username = ctx.from.username ? `@${ctx.from.username}` : 'N/A';
  const fullName =
    [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'User';

  try {
    await rawSendMessage(
      SUPPORT_TARGET_ID,
      `📩 *নতুন সাপোর্ট মেসেজ*\n👤 নাম: ${fullName}\n🆔 আইডি: \`${userId}\`\n🔗 ইউজারনেম: ${username}\n\n💬 মেসেজ:\n${ctx.message.text}`
    );
    await rawSendMessage(ctx.chat.id, '✅ আপনার মেসেজটি সাপোর্টে পাঠানো হয়েছে। শীঘ্রই উত্তর পাবেন।');
  } catch (err) {
    console.error('Support forward error:', err.message);
    await rawSendMessage(ctx.chat.id, '❌ সাপোর্টে মেসেজ পাঠাতে সমস্যা হয়েছে।');
  }
});

http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running');
  })
  .listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
  });

if (SELF_URL) {
  setInterval(() => {
    axios.get(SELF_URL).catch(() => {});
  }, 4 * 60 * 1000);
}

(async () => {
  if (!FIREBASE_DB_URL) {
    console.log('FIREBASE_DB_URL not set. Using local memory only.');
  } else {
    const [
      savedApiUrlEnabled,
      savedApiKeyEnabled,
      savedApiUrl,
      savedApiKey,
      savedMainLink,
      savedMainId,
      savedOtpLink,
      savedOtpId,
      savedJoinCheck,
      savedEntries,
      savedUsers,
      savedOtpStats
    ] = await Promise.all([
      dbGet('config/apiUrlEnabled'),
      dbGet('config/apiKeyEnabled'),
      dbGet('config/apiUrl'),
      dbGet('config/apiKey'),
      dbGet('config/mainGroupLink'),
      dbGet('config/mainGroupId'),
      dbGet('config/otpGroupLink'),
      dbGet('config/otpGroupId'),
      dbGet('config/joinCheck'),
      dbGet('pool/entries'),
      dbGet('users/list'),
      dbGet('stats/otps')
    ]);

    if (typeof savedApiUrlEnabled === 'boolean') state.apiUrlEnabled = savedApiUrlEnabled;
    if (typeof savedApiKeyEnabled === 'boolean') state.apiKeyEnabled = savedApiKeyEnabled;

    if (savedApiUrl) state.apiUrl = savedApiUrl;
    if (savedApiKey) state.apiKey = savedApiKey;

    if (savedMainLink) state.mainGroupLink = savedMainLink;
    if (savedMainId) state.mainGroupId = savedMainId;
    if (savedOtpLink) state.otpGroupLink = savedOtpLink;
    if (savedOtpId) state.otpGroupId = savedOtpId;
    if (typeof savedJoinCheck === 'boolean') state.joinCheck = savedJoinCheck;
    if (Array.isArray(savedEntries)) state.numberEntries = savedEntries;
    if (Array.isArray(savedUsers)) state.users = savedUsers;
    if (savedOtpStats && typeof savedOtpStats === 'object') {
      state.otpStats = {
        total: Number(savedOtpStats.total) || 0,
        byCountry:
          savedOtpStats.byCountry && typeof savedOtpStats.byCountry === 'object'
            ? savedOtpStats.byCountry
            : {}
      };
    }
  }

  await bot.launch();
  console.log('Bot with Admin Panel is running...');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
