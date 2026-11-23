const { Telegraf } = require('telegraf');
const axios = require('axios');
const http = require('http');

const BOT_TOKEN = process.env.BOT_TOKEN;
const RAW_FIREBASE_URL = String(process.env.FIREBASE_DB_URL || '').trim().replace(/\/+$/, '');
const FIREBASE_DB_URL = /^https?:\/\/.+/i.test(RAW_FIREBASE_URL) ? RAW_FIREBASE_URL : '';
const PORT = process.env.PORT || 10000;
const SELF_URL = process.env.RENDER_EXTERNAL_URL || '';

const ADMIN_IDS = [8771921458];
const SUPPORT_TARGET_ID = 8771921458;

const PANEL_URLS = {
  base: 'https://nxv-sms.vercel.app',
  getNumber: 'https://nxv-sms.vercel.app/get-number',
  getOtp: 'https://nxv-sms.vercel.app/get-otp',
  activeRange: 'https://nxv-sms.vercel.app/active-rangre',
  cancelNumber: 'https://nxv-sms.vercel.app/cancel-number',
  balance: 'https://nxv-sms.vercel.app/balance'
};

const DEFAULT_API_KEY = process.env.API_KEY || 'nxv_live_mwr98oy3_ypnnxbi7zjowac7m';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN missing');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const COUNTRY_META = [
  { name: 'Afghanistan', iso: 'AF', dial: '93', flag: '🇦🇫' },
  { name: 'Albania', iso: 'AL', dial: '355', flag: '🇦🇱' },
  { name: 'Algeria', iso: 'DZ', dial: '213', flag: '🇩🇿' },
  { name: 'Argentina', iso: 'AR', dial: '54', flag: '🇦🇷' },
  { name: 'Armenia', iso: 'AM', dial: '374', flag: '🇦🇲' },
  { name: 'Bangladesh', iso: 'BD', dial: '880', flag: '🇧🇩' },
  { name: 'Brazil', iso: 'BR', dial: '55', flag: '🇧🇷' },
  { name: 'Cambodia', iso: 'KH', dial: '855', flag: '🇰🇭' },
  { name: 'Canada', iso: 'CA', dial: '1', flag: '🇨🇦' },
  { name: "Côte d'Ivoire", iso: 'CI', dial: '225', flag: '🇨🇮' },
  { name: 'Egypt', iso: 'EG', dial: '20', flag: '🇪🇬' },
  { name: 'France', iso: 'FR', dial: '33', flag: '🇫🇷' },
  { name: 'Germany', iso: 'DE', dial: '49', flag: '🇩🇪' },
  { name: 'Guinea', iso: 'GN', dial: '224', flag: '🇬🇳' },
  { name: 'Guinea-Bissau', iso: 'GW', dial: '245', flag: '🇬🇼' },
  { name: 'India', iso: 'IN', dial: '91', flag: '🇮🇳' },
  { name: 'Indonesia', iso: 'ID', dial: '62', flag: '🇮🇩' },
  { name: 'Kenya', iso: 'KE', dial: '254', flag: '🇰🇪' },
  { name: 'Madagascar', iso: 'MG', dial: '261', flag: '🇲🇬' },
  { name: 'Malaysia', iso: 'MY', dial: '60', flag: '🇲🇾' },
  { name: 'Mali', iso: 'ML', dial: '223', flag: '🇲🇱' },
  { name: 'Mexico', iso: 'MX', dial: '52', flag: '🇲🇽' },
  { name: 'Montenegro', iso: 'ME', dial: '382', flag: '🇲🇪' },
  { name: 'Morocco', iso: 'MA', dial: '212', flag: '🇲🇦' },
  { name: 'Nepal', iso: 'NP', dial: '977', flag: '🇳🇵' },
  { name: 'Nigeria', iso: 'NG', dial: '234', flag: '🇳🇬' },
  { name: 'Pakistan', iso: 'PK', dial: '92', flag: '🇵🇰' },
  { name: 'Philippines', iso: 'PH', dial: '63', flag: '🇵🇭' },
  { name: 'Poland', iso: 'PL', dial: '48', flag: '🇵🇱' },
  { name: 'Russia', iso: 'RU', dial: '7', flag: '🇷🇺' },
  { name: 'Saint Pierre & Miquelon', iso: 'PM', dial: '508', flag: '🇵🇲' },
  { name: 'Saudi Arabia', iso: 'SA', dial: '966', flag: '🇸🇦' },
  { name: 'South Africa', iso: 'ZA', dial: '27', flag: '🇿🇦' },
  { name: 'Spain', iso: 'ES', dial: '34', flag: '🇪🇸' },
  { name: 'Sudan', iso: 'SD', dial: '249', flag: '🇸🇩' },
  { name: 'Thailand', iso: 'TH', dial: '66', flag: '🇹🇭' },
  { name: 'Togo', iso: 'TG', dial: '228', flag: '🇹🇬' },
  { name: 'Turkey', iso: 'TR', dial: '90', flag: '🇹🇷' },
  { name: 'Ukraine', iso: 'UA', dial: '380', flag: '🇺🇦' },
  { name: 'United Arab Emirates', iso: 'AE', dial: '971', flag: '🇦🇪' },
  { name: 'United Kingdom', iso: 'GB', dial: '44', flag: '🇬🇧' },
  { name: 'United States', iso: 'US', dial: '1', flag: '🇺🇸' },
  { name: 'Vietnam', iso: 'VN', dial: '84', flag: '🇻🇳' }
];

const state = {
  apiEnabled: true,
  rangeEnabled: true,
  rewardEnabled: true,
  shortMsgMode: false,
  newNumberNotify: true,
  apiKey: DEFAULT_API_KEY,
  joinCheckEnabled: true,
  mainGroupLink: process.env.MAIN_GROUP_LINK || 'https://t.me/nhbdofficial',
  mainGroupId: process.env.MAIN_GROUP_ID || '',
  otpGroupLink: process.env.OTP_GROUP_LINK || 'https://t.me/nhbdofficial',
  otpGroupId: process.env.OTP_GROUP_ID || '',
  rangeGroupLink: process.env.RANGE_GROUP_LINK || 'https://t.me/nhbdofficial',
  rangeGroupId: process.env.RANGE_GROUP_ID || '',
  ownerContact: '@noobxvau',
  verifiedUsers: {},
  otpReward: 0.55,
  minWithdraw: 50,
  users: [],
  balances: {},
  numberHistory: [],
  otpStats: { total: 0, byCountry: {} },
  userSession: new Map(),
  lastBotBoardMsg: new Map(),
  userBoardHistory: new Map(),
  waitingSupportFrom: new Set(),
  waitingRangeFrom: new Map(),
  adminWizard: new Map(),
  seenNewItems: new Set(),
  cachedRanges: null
};

function getApiKey() {
  return String(state.apiKey || DEFAULT_API_KEY || '').trim();
}

function maskApiKey(key) {
  const k = String(key || '').trim();
  if (!k) return 'Not Set';
  if (k.length <= 12) return `${k.slice(0, 4)}****`;
  return `${k.slice(0, 10)}••••••••••••${k.slice(-5)}`;
}

function isApiReady() {
  return Boolean(state.apiEnabled && getApiKey());
}

function buildPanelUrl(endpointUrl, extraParams = {}) {
  const rawEndpoint = String(endpointUrl || '').trim();
  const validEndpoint = /^https?:\/\//i.test(rawEndpoint)
    ? rawEndpoint
    : `${PANEL_URLS.base}/${rawEndpoint.replace(/^\/+/, '')}`;

  const merged = {
    api_key: getApiKey(),
    ...extraParams
  };

  try {
    const url = new URL(validEndpoint);
    Object.entries(merged).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        url.searchParams.set(k, String(v).trim());
      }
    });
    return url.toString();
  } catch (_) {
    const qs = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        qs.set(k, String(v).trim());
      }
    });
    const sep = validEndpoint.includes('?') ? '&' : '?';
    return `${validEndpoint}${sep}${qs.toString()}`;
  }
}

async function callPanel(endpointUrl, extraParams = {}, timeout = 10000) {
  const fullUrl = buildPanelUrl(endpointUrl, extraParams);
  return axios.get(fullUrl, {
    timeout,
    headers: {
      'x-api-key': getApiKey()
    }
  });
}

function resolveCountryInfo(rawInput) {
  const str = String(rawInput || '').trim();
  const lower = str.toLowerCase();

  const byNameOrIso = COUNTRY_META.find(
    (c) => lower === c.name.toLowerCase() || lower === c.iso.toLowerCase()
  );
  if (byNameOrIso) {
    return {
      key: byNameOrIso.iso.toLowerCase(),
      name: byNameOrIso.name,
      iso: byNameOrIso.iso,
      label: `${byNameOrIso.flag} ${byNameOrIso.name}`,
      flag: byNameOrIso.flag,
      dial: byNameOrIso.dial
    };
  }

  const digits = str.replace(/[^\d]/g, '');
  const sorted = [...COUNTRY_META].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (digits.startsWith(c.dial)) {
      return {
        key: c.iso.toLowerCase(),
        name: c.name,
        iso: c.iso,
        label: `${c.flag} ${c.name}`,
        flag: c.flag,
        dial: c.dial
      };
    }
  }

  const fallbackCode = digits.slice(0, 3) || 'N/A';
  return {
    key: `code_${fallbackCode}`,
    name: `Country ${fallbackCode}`,
    iso: 'XX',
    label: `🌍 Country ${fallbackCode}`,
    flag: '🌍',
    dial: ''
  };
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  return digits.length >= 6 && digits.length <= 15 ? `+${digits}` : null;
}

function formatDashedOtp(otpRaw) {
  const clean = String(otpRaw || '').replace(/\D/g, '');
  if (clean.length === 6) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  if (clean.length === 5) return `${clean.slice(0, 2)}-${clean.slice(2)}`;
  if (clean.length === 4) return `${clean.slice(0, 2)}-${clean.slice(2)}`;
  return String(otpRaw || '').trim();
}

function getServiceShortTag(service) {
  const s = String(service || '').toLowerCase();
  if (s.includes('whatsapp')) return 'WS';
  if (s.includes('telegram')) return 'TG';
  if (s.includes('facebook')) return 'FB';
  if (s.includes('instagram')) return 'IG';
  return String(service || 'OTP').slice(0, 3).toUpperCase();
}

function sanitizeFirebasePath(dbPath) {
  return String(dbPath || '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

async function dbGet(dbPath) {
  if (!FIREBASE_DB_URL) return null;
  try {
    const safePath = sanitizeFirebasePath(dbPath);
    const res = await axios.get(`${FIREBASE_DB_URL}/${safePath}.json`, { timeout: 8000 });
    return res.data;
  } catch (e) {
    console.error('Firebase GET error:', e.response?.status || e.message);
    return null;
  }
}

async function dbPut(dbPath, data) {
  if (!FIREBASE_DB_URL) return false;
  try {
    const safePath = sanitizeFirebasePath(dbPath);
    const body = JSON.stringify(data === undefined ? null : data);
    await axios.put(`${FIREBASE_DB_URL}/${safePath}.json`, body, {
      timeout: 8000,
      headers: { 'Content-Type': 'application/json' }
    });
    return true;
  } catch (e) {
    console.error('Firebase PUT error:', e.response?.status || e.message);
    return false;
  }
}

async function persistSeenNewItems() {
  const arr = [...state.seenNewItems].slice(-500);
  await dbPut('config/seenNewItems', arr);
}

async function registerUser(userId) {
  if (!userId) return;
  const idStr = String(userId);
  if (!state.users.includes(idStr)) {
    state.users.push(idStr);
    await dbPut('users/list', state.users);
  }
  if (state.balances[idStr] === undefined) {
    state.balances[idStr] = 0;
    await dbPut(`balances/${idStr}`, 0);
  }
}

async function saveNumberToHistory(uid, item) {
  const entry = {
    uid: String(uid),
    service: item.service,
    range: item.range || 'auto',
    phone: item.phone,
    orderId: item.orderId || null,
    country: item.countryLabel,
    time: new Date().toISOString()
  };
  state.numberHistory = [entry, ...state.numberHistory.filter((x) => x.phone !== item.phone)].slice(0, 300);
  await dbPut('history/numbers', state.numberHistory);
}

async function rawSendMessage(chatId, text, reply_markup = null) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown'
  };
  if (reply_markup) payload.reply_markup = reply_markup;
  return bot.telegram.callApi('sendMessage', payload);
}

async function rawEditMessageText(chatId, messageId, text, reply_markup = null) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'Markdown'
  };
  if (reply_markup) payload.reply_markup = reply_markup;
  return bot.telegram.callApi('editMessageText', payload);
}

async function rawDeleteMessage(chatId, messageId) {
  if (!chatId || !messageId) return null;
  try {
    return await bot.telegram.callApi('deleteMessage', {
      chat_id: chatId,
      message_id: Number(messageId)
    });
  } catch (_) {
    return null;
  }
}

function getMainKeyboard(isAdmin) {
  const rows = [
    [{ text: '🟢 GET NUMBER ⋮⋮⋮⋮', style: 'danger' }],
    [
      { text: '🟣 WALLET ⋮⋮⋮⋮', style: 'success' },
      { text: '🔵 TRAFFIC ⋮⋮⋮⋮', style: 'primary' }
    ],
    [
      { text: '🩷 SUPPORT ⋮⋮⋮⋮', style: 'primary' },
      { text: '🟡 NUMBER FILE ⋮⋮⋮⋮', style: 'danger' }
    ]
  ];
  if (isAdmin) rows.push([{ text: '💠 ADMIN PANEL ⋮⋮⋮⋮', style: 'primary' }]);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

function getAdminPanelAsMainKeyboard() {
  return {
    keyboard: [
      [
        { text: state.apiEnabled ? '🟢 API: ON ⋮⋮⋮⋮' : '🔴 API: OFF ⋮⋮⋮⋮', style: state.apiEnabled ? 'success' : 'danger' },
        { text: state.rangeEnabled ? '🔢 Range: ON ⋮⋮⋮⋮' : '🔢 Range: OFF ⋮⋮⋮⋮', style: state.rangeEnabled ? 'success' : 'danger' }
      ],
      [
        { text: state.rewardEnabled ? '💰 Reward: ON ⋮⋮⋮⋮' : '⚪ Zero Mode ⋮⋮⋮⋮', style: state.rewardEnabled ? 'success' : 'primary' },
        { text: state.newNumberNotify ? '🔔 Alert: ON ⋮⋮⋮⋮' : '🔕 Alert: OFF ⋮⋮⋮⋮', style: state.newNumberNotify ? 'success' : 'danger' }
      ],
      [
        { text: state.shortMsgMode ? '📝 Mode: Short ⋮⋮⋮⋮' : '📄 Mode: Long ⋮⋮⋮⋮', style: 'primary' },
        { text: state.joinCheckEnabled ? '🔒 Gate: ON ⋮⋮⋮⋮' : '🔓 Gate: OFF ⋮⋮⋮⋮', style: state.joinCheckEnabled ? 'success' : 'danger' }
      ],
      [
        { text: '🔑 API Key ⋮⋮⋮⋮', style: 'primary' },
        { text: '👤 Owner ⋮⋮⋮⋮', style: 'primary' }
      ],
      [
        { text: '📢 Main Group ⋮⋮⋮⋮', style: 'primary' },
        { text: '📩 OTP Group ⋮⋮⋮⋮', style: 'primary' }
      ],
      [
        { text: '📡 Range Group ⋮⋮⋮⋮', style: 'primary' },
        { text: '📣 Broadcast ⋮⋮⋮⋮', style: 'success' }
      ],
      [
        { text: '🧪 Test SMS ⋮⋮⋮⋮', style: 'success' },
        { text: '👥 Stats ⋮⋮⋮⋮', style: 'primary' }
      ],
      [
        { text: '🧪 Balance API ⋮⋮⋮⋮', style: 'success' },
        { text: '📡 Range API ⋮⋮⋮⋮', style: 'success' }
      ],
      [
        { text: '🔗 Endpoints ⋮⋮⋮⋮', style: 'primary' },
        { text: '🛡️ Info ⋮⋮⋮⋮', style: 'primary' }
      ],
      [
        { text: '⬅️ Main Menu ⋮⋮⋮⋮', style: 'danger' }
      ]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

async function clearPreviousBoards(chatId, userId, keepMsgId = null) {
  const key = `${chatId}_${userId}`;
  const tracked = state.userBoardHistory.get(key) || [];
  const lastMsg = state.lastBotBoardMsg.get(userId);
  const allIds = [...new Set([...tracked, lastMsg].filter(Boolean))];

  for (const mid of allIds) {
    if (keepMsgId && Number(mid) === Number(keepMsgId)) continue;
    await rawDeleteMessage(chatId, mid);
  }
  state.userBoardHistory.set(key, keepMsgId ? [Number(keepMsgId)] : []);
  if (!keepMsgId) state.lastBotBoardMsg.delete(userId);
}

async function sendCleanBoard(ctx, text, reply_markup = null, preferEdit = false) {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  const activeMsgId = ctx.callbackQuery?.message?.message_id || null;
  const incomingUserMsgId = ctx.message?.message_id || null;
  const isAdmin = ADMIN_IDS.includes(Number(userId));
  const fallbackKb = getMainKeyboard(isAdmin);

  if (incomingUserMsgId && chatId) {
    await rawDeleteMessage(chatId, incomingUserMsgId);
  }

  if (activeMsgId && preferEdit && chatId) {
    try {
      const edited = await rawEditMessageText(chatId, activeMsgId, text, reply_markup || null);
      if (userId && edited?.message_id) {
        state.lastBotBoardMsg.set(userId, edited.message_id);
        state.userBoardHistory.set(`${chatId}_${userId}`, [edited.message_id]);
      }
      return edited;
    } catch (_) {}
  }

  await clearPreviousBoards(chatId, userId, null);

  const sent = await rawSendMessage(chatId, text, reply_markup || fallbackKb);
  if (userId && sent?.message_id) {
    state.lastBotBoardMsg.set(userId, sent.message_id);
    state.userBoardHistory.set(`${chatId}_${userId}`, [sent.message_id]);
  }
  return sent;
}

function hasValidGroupLinks() {
  return (
    /^https?:\/\//i.test(String(state.mainGroupLink || '').trim()) &&
    /^https?:\/\//i.test(String(state.otpGroupLink || '').trim())
  );
}

function extractUsernameFromLink(link) {
  const m = String(link || '').trim().match(/^https?:\/\/t\.me\/([A-Za-z0-9_]+)$/i);
  if (!m || m[1].startsWith('+')) return '';
  return `@${m[1]}`;
}

async function checkSingleGroupMember(chatIdOrUsername, userId) {
  if (!chatIdOrUsername || !userId) return null;
  try {
    const res = await bot.telegram.callApi('getChatMember', {
      chat_id: chatIdOrUsername,
      user_id: Number(userId)
    });
    const status = res?.status;
    return ['creator', 'administrator', 'member', 'restricted'].includes(status);
  } catch (_) {
    return null;
  }
}

async function verifyUserInTwoGroups(userId) {
  const idStr = String(userId);
  if (!state.joinCheckEnabled || ADMIN_IDS.includes(Number(userId))) {
    return { ok: true, missingMain: false, missingOtp: false };
  }

  const mainTarget = String(state.mainGroupId || '').trim() || extractUsernameFromLink(state.mainGroupLink);
  const otpTarget = String(state.otpGroupId || '').trim() || extractUsernameFromLink(state.otpGroupLink);

  const mainRes = mainTarget ? await checkSingleGroupMember(mainTarget, userId) : null;
  const otpRes = otpTarget ? await checkSingleGroupMember(otpTarget, userId) : null;

  if (mainRes === false || otpRes === false) {
    return {
      ok: false,
      missingMain: mainRes === false,
      missingOtp: otpRes === false
    };
  }

  if (mainRes === true && otpRes === true) {
    state.verifiedUsers[idStr] = true;
    await dbPut(`verifiedUsers/${idStr}`, true);
    return { ok: true, missingMain: false, missingOtp: false };
  }

  if (state.verifiedUsers[idStr]) {
    return { ok: true, missingMain: false, missingOtp: false };
  }

  return { ok: false, missingMain: true, missingOtp: true };
}

async function sendJoinGateBoard(ctx, missingMain = true, missingOtp = true, preferEdit = false) {
  const rows = [];
  if (hasValidGroupLinks()) {
    rows.push([
      { text: '📢 Main Group', url: state.mainGroupLink, style: 'primary' },
      { text: '📩 OTP Group', url: state.otpGroupLink, style: 'primary' }
    ]);
  }
  rows.push([{ text: '✅ Verify', callback_data: 'verify_groups', style: 'success' }]);

  const text =
    `🟪 *JOIN VERIFICATION BOARD*\n` +
    `🟦 *GET NUMBER চালু করতে ২টি গ্রুপে জয়েন করে Verify করুন*\n` +
    `🟩 ${missingMain ? '❌ Main Group' : '✅ Main Group'}  |  ${missingOtp ? '❌ OTP Group' : '✅ OTP Group'}`;

  return sendCleanBoard(ctx, text, { inline_keyboard: rows }, preferEdit);
}

async function fetchActiveRanges() {
  if (!isApiReady()) return [];
  if (state.cachedRanges && Date.now() - state.cachedRanges.ts < 15000) {
    return state.cachedRanges.items;
  }
  try {
    const res = await callPanel(PANEL_URLS.activeRange, {}, 8000);
    const list = Array.isArray(res.data?.data?.active_ranges)
      ? res.data.data.active_ranges
      : Array.isArray(res.data?.active_ranges)
        ? res.data.active_ranges
        : Array.isArray(res.data)
          ? res.data
          : [];
    state.cachedRanges = { items: list, ts: Date.now() };
    return list;
  } catch (err) {
    console.error('[ACTIVE-RANGE ERR]:', err.response?.data || err.message);
    return [];
  }
}

async function fetchPanelBalanceRaw() {
  if (!isApiReady()) return null;
  try {
    const res = await callPanel(PANEL_URLS.balance, {}, 8000);
    return res.data || null;
  } catch (err) {
    console.error('[BALANCE ERR]:', err.response?.data || err.message);
    return null;
  }
}

async function requestNumberFromPanel(service = 'Telegram', range = '') {
  if (!isApiReady()) return { error: 'API বন্ধ বা API Key নেই।' };
  const cleanService = String(service || 'Telegram').trim() || 'Telegram';
  const params = { service: cleanService };
  if (state.rangeEnabled && range && range !== 'auto') {
    params.range = range;
  }

  const res = await callPanel(PANEL_URLS.getNumber, params, 10000);
  const d = res.data || {};
  if (d.success === false) {
    return { error: d.error || d.message || 'এই রেঞ্জে বর্তমানে কোনো নম্বর নেই।' };
  }

  const phone = normalizePhone(
    d.phoneNumber || d.number || d.phone || d.data?.phoneNumber || d.data?.number || ''
  );
  if (!phone) {
    return { error: d.message || 'এই রেঞ্জে বর্তমানে কোনো নম্বর নেই।' };
  }

  const rawCountryHint = d.country || d.countryName || d.data?.country || phone;
  const countryInfo = resolveCountryInfo(rawCountryHint);
  return {
    service: cleanService,
    range: state.rangeEnabled && range && range !== 'auto' ? range : 'auto',
    phone,
    orderId: d.orderId || d.order_id || d.id || d.data?.orderId || d.data?.order_id || null,
    countryKey: countryInfo.key,
    countryName: countryInfo.name,
    countryIso: countryInfo.iso,
    countryLabel: countryInfo.label,
    flag: countryInfo.flag,
    dial: countryInfo.dial
  };
}

async function requestOtpFromPanel(orderId, phone) {
  if (!isApiReady() || (!orderId && !phone)) return null;
  const params = {};
  if (orderId) params.orderId = orderId;
  if (phone) params.phoneNumber = phone;

  const res = await callPanel(PANEL_URLS.getOtp, params, 10000);
  const d = res.data || {};
  const inner = d.data && typeof d.data === 'object' ? d.data : {};

  const candidates = [d.otp, d.code, d.sms, d.message, inner.otp, inner.code, inner.sms, inner.message];
  for (const val of candidates) {
    if (!val) continue;
    const str = String(val).trim();
    if (/WAITING|PENDING|NO_SMS|NOT_READY|WAIT/i.test(str)) continue;
    const match = str.match(/\b\d{4,8}\b/);
    if (match) return match[0];
  }
  return null;
}

async function recordTraffic(phone) {
  const info = resolveCountryInfo(phone);
  const cur = state.otpStats.byCountry[info.key] || { label: info.label, count: 0 };
  cur.count = Number(cur.count || 0) + 1;
  state.otpStats.byCountry[info.key] = cur;
  state.otpStats.total = Number(state.otpStats.total || 0) + 1;
  await dbPut('stats/otps', state.otpStats);
}

async function deliverOtpToUserAndGroup(uid, item, rawOtp, options = {}) {
  const { sendToUser = true } = options;
  const formattedOtp = formatDashedOtp(rawOtp);
  const digits = String(item.phone || '').replace(/[^\d]/g, '');
  const serviceName = item.service || 'WhatsApp';

  if (sendToUser && uid) {
    const userText =
      `🟩 *OTP RECEIVED BOARD*\n` +
      `🟦 *${item.flag} ${serviceName} (${item.countryName}):* \`+${digits}\`\n` +
      `🟨 *CODE:* \`${formattedOtp}\``;
    const userMarkup = {
      inline_keyboard: [
        [
          {
            text: `📋 ${formattedOtp}`,
            type: 'copy_text',
            copy_text: { text: formattedOtp },
            style: 'success'
          }
        ]
      ]
    };

    await rawSendMessage(uid, userText, userMarkup);
  }

  const otpGroupTarget = String(state.otpGroupId || '').trim() || extractUsernameFromLink(state.otpGroupLink);
  if (!otpGroupTarget) {
    return {
      ok: false,
      reason: 'OTP Group ID বা Username সেট করা নেই (প্রাইভেট লিংক দিলে সাথে -100... Chat ID দিন)।'
    };
  }

  const shortTag = getServiceShortTag(serviceName);
  const prefix = digits.slice(0, 4) || 'N/A';
  const rngCode = item.range && item.range !== 'auto' ? String(item.range) : digits.slice(0, 6);

  const groupText = state.shortMsgMode
    ? `🟩 *OTP* 🟩 ${item.flag} *${item.countryName}* \`+${digits}\` | \`${formattedOtp}\``
    : `🟩 *LIVE OTP BOARD*\n` +
      `🟦 *${item.flag} ${item.countryName}* 🟢 *${shortTag}*\n` +
      `🟪 \`#${item.countryIso}\` *+${digits}*\n` +
      `🟨 *Prefix:* \`${prefix}\` | *Range:* \`#${rngCode}\``;

  const grpButtons = [];
  if (state.mainGroupLink && /^https?:\/\//i.test(state.mainGroupLink)) {
    grpButtons.push({ text: '📢 Channel', url: state.mainGroupLink, style: 'primary' });
  }
  if (bot.botInfo?.username) {
    grpButtons.push({ text: '🤖 Bot Link', url: `https://t.me/${bot.botInfo.username}`, style: 'success' });
  }

  try {
    await rawSendMessage(
      otpGroupTarget,
      groupText,
      grpButtons.length ? { inline_keyboard: [grpButtons] } : null
    );
    return { ok: true, target: otpGroupTarget };
  } catch (e) {
    console.error('[OTP GROUP SEND ERR]:', e.message);
    return { ok: false, reason: e.message };
  }
}

async function extractPanelNewItems() {
  if (!isApiReady()) return [];
  const entries = [];
  const seenInBatch = new Set();

  const ranges = await fetchActiveRanges();
  for (const r of ranges) {
    if (!r || typeof r !== 'object') continue;
    const srv = String(r.service || r.app || 'Number').trim() || 'Number';
    const rng = String(r.range || r.prefix || r.country || '').trim();
    const phone = normalizePhone(r.phoneNumber || r.number || r.phone || '');
    const cInfo = resolveCountryInfo(r.country || r.countryName || phone || rng || '');

    const hasRealNumber = Boolean(phone);
    const hasRealRange = Boolean(rng && !/x{2,}/i.test(rng));
    if (!hasRealNumber && !hasRealRange) continue;

    const key = hasRealNumber
      ? `num_${srv.toLowerCase()}_${phone}`
      : `rng_${srv.toLowerCase()}_${rng.toLowerCase()}`;

    if (seenInBatch.has(key)) continue;
    seenInBatch.add(key);

    entries.push({
      key,
      service: srv,
      range: rng || 'auto',
      phone: phone || null,
      countryLabel: cInfo.label,
      flag: cInfo.flag
    });
  }

  return entries;
}

async function sendNewNumberNotificationToUsers(entry) {
  if (!state.newNumberNotify || !state.users.length) return;

  const text =
    `🟧 *NEW NUMBER NOTIFICATION*\n` +
    `🟦 *Service:* *${entry.service}*\n` +
    `🟩 *Country:* *${entry.countryLabel}*\n` +
    `🟨 *Range:* \`${entry.range}\`` +
    (entry.phone ? `\n🟪 *Number:* \`${entry.phone}\`` : '') +
    `\n🟩 *নতুন নম্বর যুক্ত হয়েছে! এখনই GET NUMBER চাপুন।*`;

  for (const uid of state.users) {
    try {
      await rawSendMessage(uid, text, getMainKeyboard(ADMIN_IDS.includes(Number(uid))));
    } catch (_) {}
  }
}

let isInitialNewNumScan = true;
setInterval(async () => {
  if (!state.newNumberNotify || !isApiReady()) return;
  try {
    const items = await extractPanelNewItems();
    if (!items.length) return;

    if (isInitialNewNumScan) {
      let changed = false;
      for (const it of items) {
        if (!state.seenNewItems.has(it.key)) {
          state.seenNewItems.add(it.key);
          changed = true;
        }
      }
      if (changed) await persistSeenNewItems();
      isInitialNewNumScan = false;
      return;
    }

    let addedNew = false;
    for (const it of items) {
      if (!state.seenNewItems.has(it.key)) {
        state.seenNewItems.add(it.key);
        addedNew = true;
        await sendNewNumberNotificationToUsers(it);
      }
    }
    if (addedNew) {
      await persistSeenNewItems();
    }
  } catch (err) {
    console.error('[NEW-NUM WATCH ERR]:', err.message);
  }
}, 10000);

function buildNumberCard(sess, otp = null, statusLine = '') {
  const item = sess.item;
  const serviceName = item.service || 'Telegram';
  const digits = String(item.phone || '').replace(/[^\d]/g, '');
  const shownPhone =
    sess.stripCC && item.dial && digits.startsWith(item.dial)
      ? digits.slice(item.dial.length)
      : `+${digits}`;

  const text =
    `${item.flag} 🟢 *${serviceName} ${item.countryName}:*\n` +
    `🌍 Country: *${item.countryName}*\n` +
    (item.range && item.range !== 'auto' ? `🔢 Range: \`${item.range}\`\n` : '') +
    (statusLine ? `🟨 *${statusLine}*\n` : '') +
    `⏳ *Waiting for OTP....*` +
    (otp ? `\n✅ *OTP Received:* \`${formatDashedOtp(otp)}\`` : '');

  const rows = [
    [
      {
        text: `${item.flag} 📋 ${shownPhone}`,
        type: 'copy_text',
        copy_text: { text: shownPhone },
        style: 'success'
      }
    ],
    [
      {
        text: '🔐 Get Code',
        callback_data: 'manual_get_code',
        style: 'success'
      }
    ],
    [
      {
        text: sess.autoChecker !== false ? '🟢 Auto Checker On' : '⏸️ Auto Checker Off',
        callback_data: 'toggle_auto_chk',
        style: sess.autoChecker !== false ? 'success' : 'primary'
      },
      {
        text: sess.stripCC ? '🟢 Restore CC' : '❌ Remove CC',
        callback_data: 'toggle_cc',
        style: 'danger'
      }
    ],
    [
      {
        text: '🔄 Change Number',
        callback_data: `chg_num_${encodeURIComponent(serviceName)}__${encodeURIComponent(item.range || 'auto')}`,
        style: 'danger'
      }
    ],
    [
      {
        text: '🔢 Set Range',
        callback_data: `ask_rng_${encodeURIComponent(serviceName)}`,
        style: 'primary'
      }
    ],
    [
      {
        text: '🌐 Change Country',
        callback_data: `pick_srv_${encodeURIComponent(serviceName)}`,
        style: 'primary'
      }
    ]
  ];

  if (state.otpGroupLink && /^https?:\/\//i.test(state.otpGroupLink)) {
    rows.push([{ text: '📩 Otp Group', url: state.otpGroupLink }]);
  }

  return { text, reply_markup: { inline_keyboard: rows } };
}

async function handleGetCodeAction(ctx, preferEdit = true) {
  const uid = ctx.from.id;
  const sess = state.userSession.get(uid);
  if (!sess?.item) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('আগে একটি নম্বর নিন।', { show_alert: true });
    }
    return openServiceMenu(ctx, preferEdit);
  }

  try {
    const otp = await requestOtpFromPanel(sess.item.orderId, sess.item.phone);
    if (otp) {
      sess.otpDelivered = true;
      state.userSession.set(uid, sess);
      await recordTraffic(sess.item.phone);

      if (state.rewardEnabled && Number(state.otpReward) > 0) {
        const curBal = Number(state.balances[String(uid)] || 0);
        const nextBal = Number((curBal + Number(state.otpReward)).toFixed(2));
        state.balances[String(uid)] = nextBal;
        await dbPut(`balances/${uid}`, nextBal);
      }

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery(`✅ Code: ${formatDashedOtp(otp)}`);
      }
      await deliverOtpToUserAndGroup(uid, sess.item, otp, { sendToUser: true });
      const card = buildNumberCard(sess, otp, 'OTP পাওয়া গেছে!');
      return sendCleanBoard(ctx, card.text, card.reply_markup, preferEdit);
    }

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⏳ এখনো OTP আসেনি, আবার চেষ্টা করুন।');
    }
    const card = buildNumberCard(sess, null, 'এখনো OTP আসেনি — আবার Get Code চাপুন।');
    return sendCleanBoard(ctx, card.text, card.reply_markup, preferEdit);
  } catch (err) {
    console.error('[GET-CODE ERR]:', err.response?.data || err.message);
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('OTP আনতে সমস্যা হয়েছে।');
    }
    const card = buildNumberCard(sess, null, 'OTP সার্ভার থেকে কোড আনা যায়নি।');
    return sendCleanBoard(ctx, card.text, card.reply_markup, preferEdit);
  }
}

async function openServiceMenu(ctx, preferEdit = false) {
  const ranges = await fetchActiveRanges();
  const servicesFromApi = [
    ...new Set(ranges.map((r) => String(r?.service || '').trim()).filter(Boolean))
  ];
  const serviceList = servicesFromApi.length
    ? servicesFromApi
    : ['Facebook', 'Instagram', 'WhatsApp', 'Telegram'];

  const rows = [];
  for (let i = 0; i < serviceList.length; i += 2) {
    const s1 = serviceList[i];
    const row = [{ text: `✨ ${s1}`, callback_data: `pick_srv_${encodeURIComponent(s1)}`, style: 'primary' }];
    if (serviceList[i + 1]) {
      const s2 = serviceList[i + 1];
      row.push({ text: `✨ ${s2}`, callback_data: `pick_srv_${encodeURIComponent(s2)}`, style: 'primary' });
    }
    rows.push(row);
  }

  const boardText = `📲 *Select a Service*`;

  return sendCleanBoard(ctx, boardText, { inline_keyboard: rows }, preferEdit);
}

async function openCountryMenu(ctx, service, preferEdit = true) {
  const cleanService = String(service || 'Telegram').trim() || 'Telegram';
  const ranges = await fetchActiveRanges();
  const matched = ranges.filter(
    (r) => String(r?.service || '').toLowerCase() === cleanService.toLowerCase()
  );

  const seenCountries = new Map();
  for (const r of matched) {
    const rawRange = String(r?.range || r?.country || r?.prefix || '').trim();
    if (!rawRange) continue;
    const cInfo = resolveCountryInfo(r?.country || r?.countryName || rawRange);
    if (!seenCountries.has(cInfo.key)) {
      seenCountries.set(cInfo.key, { label: cInfo.label, range: rawRange });
    }
  }

  const countryList = [...seenCountries.values()];
  const rows = [
    [{ text: '🌐 Auto Country', callback_data: `get_num_${encodeURIComponent(cleanService)}__auto`, style: 'success' }]
  ];

  for (let i = 0; i < countryList.length; i += 2) {
    const c1 = countryList[i];
    const row = [
      { text: `${c1.label}`, callback_data: `get_num_${encodeURIComponent(cleanService)}__${encodeURIComponent(c1.range)}`, style: 'primary' }
    ];
    if (countryList[i + 1]) {
      const c2 = countryList[i + 1];
      row.push({
        text: `${c2.label}`,
        callback_data: `get_num_${encodeURIComponent(cleanService)}__${encodeURIComponent(c2.range)}`,
        style: 'primary'
      });
    }
    rows.push(row);
  }

  rows.push([{ text: '⬅️ Back to Services', callback_data: 'back_services', style: 'danger' }]);

  const boardText = `🌍 *${cleanService} — Select Country*`;

  return sendCleanBoard(ctx, boardText, { inline_keyboard: rows }, preferEdit);
}

async function showAdminBoardInReplyMenu(ctx, statusNote = '') {
  if (ctx.message?.message_id && ctx.chat?.id) {
    await rawDeleteMessage(ctx.chat.id, ctx.message.message_id);
  }
  await clearPreviousBoards(ctx.chat.id, ctx.from.id, null);

  const balData = await fetchPanelBalanceRaw();
  const balAmt = balData?.balance !== undefined ? balData.balance : 0;
  const currency = balData?.currency || 'BDT';
  const rate = balData?.perOtpRate !== undefined ? balData.perOtpRate : state.otpReward;
  const totalNums = balData?.totalNumbers !== undefined ? balData.totalNumbers : state.numberHistory.length;
  const totalOtps = balData?.totalOtps !== undefined ? balData.totalOtps : state.otpStats.total;

  const text =
    (statusNote ? `🟨 *STATUS BOARD*\n🟩 *${statusNote}*\n\n` : '') +
    `🟦 *ADMIN CONTROL BOARD*\n` +
    `🟩 *Users:* *${state.users.length}* | *Numbers:* *${totalNums}* | *OTPs:* *${totalOtps}*\n` +
    `🟪 *Balance:* *৳${balAmt}* (${currency}) | *Rate:* *৳${state.rewardEnabled ? rate : 0}*\n` +
    `🟨 *API Key:* \`${maskApiKey(getApiKey())}\`\n` +
    `🟦 *Main:* \`${state.mainGroupLink}\` (\`${state.mainGroupId || 'No ID'}\`)\n` +
    `🟩 *OTP:* \`${state.otpGroupLink}\` (\`${state.otpGroupId || 'No ID'}\`)\n` +
    `🟪 *Range:* \`${state.rangeGroupLink}\` (\`${state.rangeGroupId || 'No ID'}\`)\n` +
    `🟧 *Owner:* \`${state.ownerContact}\``;

  const sent = await rawSendMessage(ctx.chat.id, text, getAdminPanelAsMainKeyboard());
  if (ctx.from?.id && sent?.message_id) {
    state.lastBotBoardMsg.set(ctx.from.id, sent.message_id);
    state.userBoardHistory.set(`${ctx.chat.id}_${ctx.from.id}`, [sent.message_id]);
  }
  return sent;
}

setInterval(async () => {
  for (const [uid, sess] of state.userSession.entries()) {
    if (!sess || !sess.item || sess.otpDelivered || sess.autoChecker === false) continue;
    try {
      const otp = await requestOtpFromPanel(sess.item.orderId, sess.item.phone);
      if (otp) {
        sess.otpDelivered = true;
        state.userSession.set(uid, sess);
        await recordTraffic(sess.item.phone);

        if (state.rewardEnabled && Number(state.otpReward) > 0) {
          const curBal = Number(state.balances[String(uid)] || 0);
          const nextBal = Number((curBal + Number(state.otpReward)).toFixed(2));
          state.balances[String(uid)] = nextBal;
          await dbPut(`balances/${uid}`, nextBal);
        }

        await deliverOtpToUserAndGroup(uid, sess.item, otp, { sendToUser: true });
      }
    } catch (err) {
      console.error('[GET-OTP ERR]:', err.response?.data || err.message);
    }
  }
}, 4000);

bot.command('getcode', async (ctx) => {
  await registerUser(ctx.from.id);
  await handleGetCodeAction(ctx, false);
});

bot.command('getnumber', async (ctx) => {
  await registerUser(ctx.from.id);
  await openServiceMenu(ctx, false);
});

bot.start(async (ctx) => {
  await registerUser(ctx.from.id);
  const isAdmin = ADMIN_IDS.includes(ctx.from.id);

  if (!isAdmin && state.joinCheckEnabled) {
    const chk = await verifyUserInTwoGroups(ctx.from.id);
    if (!chk.ok) {
      return sendJoinGateBoard(ctx, chk.missingMain, chk.missingOtp, false);
    }
  }

  const welcomeText =
    `🟩 *WELCOME BOARD*\n` +
    `🟦 *স্বাগতম! নিচের মেনু থেকে অপশন বেছে নিন*`;

  await sendCleanBoard(ctx, welcomeText, getMainKeyboard(isAdmin));
});

bot.action('verify_groups', async (ctx) => {
  await registerUser(ctx.from.id);
  const idStr = String(ctx.from.id);

  const mainTarget = String(state.mainGroupId || '').trim() || extractUsernameFromLink(state.mainGroupLink);
  const otpTarget = String(state.otpGroupId || '').trim() || extractUsernameFromLink(state.otpGroupLink);

  const mainRes = mainTarget ? await checkSingleGroupMember(mainTarget, ctx.from.id) : true;
  const otpRes = otpTarget ? await checkSingleGroupMember(otpTarget, ctx.from.id) : true;

  if (mainRes === false || otpRes === false) {
    await ctx.answerCbQuery('আগে ২টি গ্রুপেই জয়েন করুন!', { show_alert: true });
    return sendJoinGateBoard(ctx, mainRes === false, otpRes === false, true);
  }

  state.verifiedUsers[idStr] = true;
  await dbPut(`verifiedUsers/${idStr}`, true);
  await ctx.answerCbQuery('✅ ভেরিফাই সফল হয়েছে!');
  await openServiceMenu(ctx, true);
});

bot.hears(/^🟢 GET NUMBER(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  await registerUser(ctx.from.id);
  const isAdmin = ADMIN_IDS.includes(ctx.from.id);

  if (!isAdmin && state.joinCheckEnabled) {
    const chk = await verifyUserInTwoGroups(ctx.from.id);
    if (!chk.ok) {
      return sendJoinGateBoard(ctx, chk.missingMain, chk.missingOtp, false);
    }
  }

  await openServiceMenu(ctx, false);
});

bot.action('manual_get_code', async (ctx) => {
  await handleGetCodeAction(ctx, true);
});

bot.action(/^pick_srv_(.+)$/, async (ctx) => {
  const service = decodeURIComponent(ctx.match[1] || 'Telegram');
  await ctx.answerCbQuery();
  await openCountryMenu(ctx, service, true);
});

bot.action('back_services', async (ctx) => {
  await ctx.answerCbQuery();
  await openServiceMenu(ctx, true);
});

bot.action(/^ask_rng_(.+)$/, async (ctx) => {
  if (!state.rangeEnabled) {
    return ctx.answerCbQuery('Range অপশন বর্তমানে বন্ধ আছে।', { show_alert: true });
  }
  const service = decodeURIComponent(ctx.match[1] || 'Telegram');
  state.waitingRangeFrom.set(ctx.from.id, service);
  await ctx.answerCbQuery();
  await sendCleanBoard(
    ctx,
    `🟨 *CUSTOM RANGE BOARD*\n🟦 *${service} এর জন্য যে Range চান সেটি লিখে পাঠান (যেমন: \`22879\`)*`,
    {
      inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_rng_input', style: 'danger' }]]
    },
    true
  );
});

bot.action('cancel_rng_input', async (ctx) => {
  state.waitingRangeFrom.delete(ctx.from.id);
  await ctx.answerCbQuery('বাতিল করা হয়েছে');
  const sess = state.userSession.get(ctx.from.id);
  if (sess?.item) {
    const card = buildNumberCard(sess, null);
    return sendCleanBoard(ctx, card.text, card.reply_markup, true);
  }
  return openServiceMenu(ctx, true);
});

async function assignAndShowNumber(ctx, service, range, preferEdit = true) {
  const cleanService = String(service || 'Telegram').trim() || 'Telegram';
  const cleanRange = state.rangeEnabled ? String(range || 'auto').trim() || 'auto' : 'auto';

  try {
    const res = await requestNumberFromPanel(cleanService, cleanRange);
    if (!res || res.error) {
      return sendCleanBoard(
        ctx,
        `🟧 *NO NUMBER BOARD*\n🟦 *${cleanService}* ${cleanRange !== 'auto' ? `(Range: \`${cleanRange}\`) ` : ''}এর জন্য নম্বর পাওয়া যায়নি\n${res?.error ? `🟨 *কারণ:* \`${res.error}\`` : ''}`,
        {
          inline_keyboard: [
            [{ text: '🔢 Set Range', callback_data: `ask_rng_${encodeURIComponent(cleanService)}`, style: 'primary' }],
            [{ text: '🌐 Change Country', callback_data: `pick_srv_${encodeURIComponent(cleanService)}`, style: 'primary' }]
          ]
        },
        preferEdit
      );
    }
    const sess = {
      item: res,
      stripCC: false,
      autoChecker: true,
      otpDelivered: false
    };
    state.userSession.set(ctx.from.id, sess);
    await saveNumberToHistory(ctx.from.id, res);
    const card = buildNumberCard(sess, null);
    await sendCleanBoard(ctx, card.text, card.reply_markup, preferEdit);
  } catch (err) {
    console.error('[GET-NUMBER ERR]:', err.response?.data || err.message);
    await sendCleanBoard(
      ctx,
      `🟧 *PANEL ERROR BOARD*\n🟦 *প্যানেল থেকে নম্বর আনতে সমস্যা হয়েছে*`,
      {
        inline_keyboard: [
          [{ text: '🔢 Set Range', callback_data: `ask_rng_${encodeURIComponent(cleanService)}`, style: 'primary' }]
        ]
      },
      preferEdit
    );
  }
}

bot.action(/^get_num_(.+)__(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('নম্বর নেওয়া হচ্ছে...');
  await assignAndShowNumber(ctx, decodeURIComponent(ctx.match[1]), decodeURIComponent(ctx.match[2]), true);
});

bot.action(/^chg_num_(.+)__(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('নম্বর পরিবর্তন হচ্ছে...');
  await assignAndShowNumber(ctx, decodeURIComponent(ctx.match[1]), decodeURIComponent(ctx.match[2]), true);
});

bot.action('toggle_auto_chk', async (ctx) => {
  const sess = state.userSession.get(ctx.from.id);
  if (!sess?.item) return ctx.answerCbQuery('কোনো সক্রিয় নম্বর নেই।');
  sess.autoChecker = sess.autoChecker === false ? true : false;
  state.userSession.set(ctx.from.id, sess);
  await ctx.answerCbQuery(sess.autoChecker ? 'Auto Checker On' : 'Auto Checker Off');
  const card = buildNumberCard(sess, null);
  try {
    await rawEditMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, card.text, card.reply_markup);
  } catch (_) {}
});

bot.action('toggle_cc', async (ctx) => {
  const sess = state.userSession.get(ctx.from.id);
  if (!sess?.item) return ctx.answerCbQuery('কোনো সক্রিয় নম্বর নেই।');
  sess.stripCC = !sess.stripCC;
  state.userSession.set(ctx.from.id, sess);
  await ctx.answerCbQuery(sess.stripCC ? 'CC Removed' : 'CC Restored');
  const card = buildNumberCard(sess, null);
  try {
    await rawEditMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, card.text, card.reply_markup);
  } catch (_) {}
});

bot.hears(/^🟣 WALLET(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  await registerUser(ctx.from.id);
  const bal = state.rewardEnabled ? Number(state.balances[String(ctx.from.id)] || 0) : 0;
  const walletText =
    `🟪 *WALLET BOARD*\n` +
    `🟦 *ID:* \`${ctx.from.id}\`\n` +
    `🟩 *Balance:* *${bal}*\n` +
    `🟨 *Min Withdraw:* *${state.minWithdraw}*`;
  await sendCleanBoard(
    ctx,
    walletText,
    { inline_keyboard: [[{ text: '🟢 Get Number', callback_data: 'back_services', style: 'success' }]] }
  );
});

bot.hears(/^🔵 TRAFFIC(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  await registerUser(ctx.from.id);
  const total = Number(state.otpStats.total || 0);
  const list = Object.values(state.otpStats.byCountry || {});
  const body = !total || !list.length
    ? '🟩 *এখনো কোনো OTP আসেনি*'
    : `🟨 *Total:* *${total}*\n` + list.map((x) => {
        const pct = ((Number(x.count || 0) / total) * 100).toFixed(1);
        return `🟦 ${x.label}: *${x.count}/${total}* (*${pct}%*)`;
      }).join('\n');

  await sendCleanBoard(
    ctx,
    `🟦 *TRAFFIC BOARD*\n${body}`,
    { inline_keyboard: [[{ text: '🟢 Get Number', callback_data: 'back_services', style: 'primary' }]] }
  );
});

bot.hears(/^🟡 NUMBER FILE(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  await registerUser(ctx.from.id);
  const myHist = state.numberHistory.filter((x) => String(x.uid) === String(ctx.from.id)).slice(0, 10);
  const body = !myHist.length
    ? '🟩 *এখনো কোনো নম্বর হিস্ট্রি নেই*'
    : myHist.map((h, idx) => `🟦 ${idx + 1}. *${h.service}* (${h.country || ''}) | \`${h.phone}\` (Range: \`${h.range || 'auto'}\`)`).join('\n');

  await sendCleanBoard(
    ctx,
    `🟨 *NUMBER FILE BOARD*\n${body}`,
    { inline_keyboard: [[{ text: '🟢 Get Number', callback_data: 'back_services', style: 'success' }]] }
  );
});

bot.hears(/^🩷 SUPPORT(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  await registerUser(ctx.from.id);
  state.waitingSupportFrom.add(ctx.from.id);
  await sendCleanBoard(
    ctx,
    `🟪 *SUPPORT BOARD*\n🟩 *আপনার মেসেজটি লিখে পাঠান*`,
    { inline_keyboard: [[{ text: '👤 Owner', url: `https://t.me/${String(state.ownerContact || 'noobxvau').replace(/^@/, '')}`, style: 'primary' }]] }
  );
});

bot.hears(/^💠 ADMIN PANEL(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  await showAdminBoardInReplyMenu(ctx);
});

bot.hears(/^⬅️ Main Menu(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.delete(ctx.from.id);
  await sendCleanBoard(
    ctx,
    `🟩 *MAIN MENU BOARD*\n🟦 *মূল মেনুতে ফিরে আসা হয়েছে*`,
    getMainKeyboard(true)
  );
});

bot.hears(/^🧪 Test SMS(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const sampleItem = {
    service: 'Telegram',
    range: '22879',
    phone: '+22879410829',
    countryName: 'Togo',
    countryIso: 'TG',
    flag: '🇹🇬'
  };
  const sent = await deliverOtpToUserAndGroup(ctx.from.id, sampleItem, '284915', {
    sendToUser: false
  });

  if (sent.ok) {
    await showAdminBoardInReplyMenu(
      ctx,
      `✅ Test SMS OTP গ্রুপ (${sent.target})-এ পাঠানো হয়েছে (Code: 284-915)`
    );
  } else {
    await showAdminBoardInReplyMenu(
      ctx,
      `⚠️ Test SMS পাঠানো যায়নি। কারণ: ${sent.reason}`
    );
  }
});

bot.hears(/^(?:🟢 API: ON|🔴 API: OFF)(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.apiEnabled = !state.apiEnabled;
  state.cachedRanges = null;
  await dbPut('config/apiUrlEnabled', state.apiEnabled);
  await showAdminBoardInReplyMenu(ctx, state.apiEnabled ? '✅ API চালু হয়েছে।' : '⛔ API বন্ধ হয়েছে।');
});

bot.hears(/^🔢 Range: (?:ON|OFF)(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.rangeEnabled = !state.rangeEnabled;
  await dbPut('config/rangeEnabled', state.rangeEnabled);
  await showAdminBoardInReplyMenu(ctx, state.rangeEnabled ? '✅ Range চালু হয়েছে।' : '⛔ Range বন্ধ হয়েছে।');
});

bot.hears(/^(?:💰 Reward: ON|⚪ Zero Mode)(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.rewardEnabled = !state.rewardEnabled;
  await dbPut('config/rewardEnabled', state.rewardEnabled);
  await showAdminBoardInReplyMenu(ctx, state.rewardEnabled ? '✅ Reward চালু হয়েছে।' : '⚪ Zero Balance মোড সক্রিয়।');
});

bot.hears(/^(?:🔔 Alert: ON|🔕 Alert: OFF)(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.newNumberNotify = !state.newNumberNotify;
  await dbPut('config/newNumberNotify', state.newNumberNotify);
  await showAdminBoardInReplyMenu(ctx, state.newNumberNotify ? '🔔 নতুন নম্বর Alert চালু।' : '🔕 নতুন নম্বর Alert বন্ধ।');
});

bot.hears(/^(?:📝 Mode: Short|📄 Mode: Long)(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.shortMsgMode = !state.shortMsgMode;
  await dbPut('config/shortMsgMode', state.shortMsgMode);
  await showAdminBoardInReplyMenu(ctx, `✉️ OTP Group মেসেজ মোড: ${state.shortMsgMode ? 'Short' : 'Long'}`);
});

bot.hears(/^(?:🔒 Gate: ON|🔓 Gate: OFF)(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.joinCheckEnabled = !state.joinCheckEnabled;
  await dbPut('config/joinCheckEnabled', state.joinCheckEnabled);
  await showAdminBoardInReplyMenu(ctx, state.joinCheckEnabled ? '🔒 Join Gate চালু।' : '🔓 Join Gate বন্ধ।');
});

bot.hears(/^🔑 API Key(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, 'key');
  await sendCleanBoard(ctx, '🔑 *API KEY BOARD*\n🟦 *নতুন API Token পাঠান*', getAdminPanelAsMainKeyboard());
});

bot.hears(/^👤 Owner(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, 'owner');
  await sendCleanBoard(ctx, '👤 *OWNER BOARD*\n🟦 *নতুন Owner ইউজারনেম পাঠান (@username)*', getAdminPanelAsMainKeyboard());
});

bot.hears(/^📢 Main Group(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, 'main_grp');
  await sendCleanBoard(ctx, '📢 *MAIN GROUP BOARD*\n🟦 *Main Group লিংক ও Chat ID পাঠান*', getAdminPanelAsMainKeyboard());
});

bot.hears(/^📩 OTP Group(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, 'otp_grp');
  await sendCleanBoard(
    ctx,
    '📩 *OTP GROUP BOARD*\n🟩 *OTP Group লিংক ও Chat ID পাঠান (প্রাইভেট লিংক হলে Chat ID দিন)*',
    getAdminPanelAsMainKeyboard()
  );
});

bot.hears(/^📡 Range Group(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, 'rng_grp');
  await sendCleanBoard(ctx, '📡 *RANGE GROUP BOARD*\n🟦 *Range Group লিংক ও Chat ID পাঠান*', getAdminPanelAsMainKeyboard());
});

bot.hears(/^📣 Broadcast(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, 'bcast');
  await sendCleanBoard(ctx, '📣 *BROADCAST BOARD*\n🟨 *সব ইউজারকে পাঠানোর মেসেজ লিখুন*', getAdminPanelAsMainKeyboard());
});

bot.hears(/^👥 Stats(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const totalBal = Object.values(state.balances || {}).reduce((a, b) => a + Number(b || 0), 0).toFixed(2);
  const text =
    `🟦 *SYSTEM STATS BOARD*\n` +
    `🟩 *Total Users:* *${state.users.length}*\n` +
    `🟪 *Saved Numbers:* *${state.numberHistory.length}*\n` +
    `🟨 *Total OTPs:* *${state.otpStats.total}*\n` +
    `🟧 *User Balances Sum:* *${state.rewardEnabled ? totalBal : 0}*`;
  await sendCleanBoard(ctx, text, getAdminPanelAsMainKeyboard());
});

bot.hears(/^🧪 Balance API(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const data = await fetchPanelBalanceRaw();
  const preview = JSON.stringify(data || { error: 'No response' }, null, 2).slice(0, 1000);
  await sendCleanBoard(ctx, `🧪 *GET /balance BOARD*\n🟦 \`${preview}\``, getAdminPanelAsMainKeyboard());
});

bot.hears(/^📡 Range API(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.cachedRanges = null;
  const list = await fetchActiveRanges();
  const preview = JSON.stringify(list.slice(0, 5), null, 2).slice(0, 1000);
  await sendCleanBoard(ctx, `📡 *GET /active-rangre (${list.length}) BOARD*\n🟪 \`${preview}\``, getAdminPanelAsMainKeyboard());
});

bot.hears(/^🔗 Endpoints(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const text =
    `🔗 *API ENDPOINTS*\n\n` +
    `• Get Number: ${PANEL_URLS.getNumber}\n` +
    `• Get OTP: ${PANEL_URLS.getOtp}\n` +
    `• Active Range: ${PANEL_URLS.activeRange}\n` +
    `• Cancel Number: ${PANEL_URLS.cancelNumber}\n` +
    `• Balance: ${PANEL_URLS.balance}`;
  await sendCleanBoard(ctx, text, getAdminPanelAsMainKeyboard());
});

bot.hears(/^🛡️ Info(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const text =
    `🛡️ *BOT INFO*\n\n` +
    `• Main Group: ${state.mainGroupLink}\n` +
    `• Owner: ${state.ownerContact}\n` +
    `• Email: mnshiddik11@gmail.com`;
  await sendCleanBoard(ctx, text, getAdminPanelAsMainKeyboard());
});

bot.on('text', async (ctx) => {
  const uid = ctx.from.id;
  await registerUser(uid);
  const txt = ctx.message.text.trim();

  if (/^(?:::)?get\s*code$/i.test(txt)) {
    return handleGetCodeAction(ctx, false);
  }

  if (state.waitingRangeFrom.has(uid)) {
    const service = state.waitingRangeFrom.get(uid);
    state.waitingRangeFrom.delete(uid);
    const cleanRange = txt.replace(/[^\dA-Za-z_-]/g, '');
    if (!cleanRange) {
      return sendCleanBoard(ctx, '🟧 *WARNING BOARD*\n🟦 *সঠিক Range লিখুন*', {
        inline_keyboard: [[{ text: '🔢 Set Range', callback_data: `ask_rng_${encodeURIComponent(service)}`, style: 'primary' }]]
      });
    }
    return assignAndShowNumber(ctx, service, cleanRange, false);
  }

  if (ADMIN_IDS.includes(uid) && state.adminWizard.has(uid)) {
    const mode = state.adminWizard.get(uid);
    state.adminWizard.delete(uid);

    if (mode === 'key') {
      state.apiKey = txt;
      state.cachedRanges = null;
      await dbPut('config/apiKey', txt);
      return showAdminBoardInReplyMenu(ctx, '✅ নতুন API Token সেট হয়েছে।');
    }
    if (mode === 'main_grp') {
      const parts = txt.split(/\s+/);
      state.mainGroupLink = parts[0];
      if (parts[1]) state.mainGroupId = parts[1];
      await dbPut('config/mainGroupLink', state.mainGroupLink);
      if (parts[1]) await dbPut('config/mainGroupId', state.mainGroupId);
      return showAdminBoardInReplyMenu(ctx, '✅ Main Group সেট হয়েছে।');
    }
    if (mode === 'otp_grp') {
      const parts = txt.split(/\s+/);
      state.otpGroupLink = parts[0];
      if (parts[1]) state.otpGroupId = parts[1];
      await dbPut('config/otpGroupLink', state.otpGroupLink);
      if (parts[1]) await dbPut('config/otpGroupId', state.otpGroupId);
      return showAdminBoardInReplyMenu(ctx, '✅ OTP Group সেট হয়েছে।');
    }
    if (mode === 'rng_grp') {
      const parts = txt.split(/\s+/);
      state.rangeGroupLink = parts[0];
      if (parts[1]) state.rangeGroupId = parts[1];
      await dbPut('config/rangeGroupLink', state.rangeGroupLink);
      if (parts[1]) await dbPut('config/rangeGroupId', state.rangeGroupId);
      return showAdminBoardInReplyMenu(ctx, '✅ Range Group সেট হয়েছে।');
    }
    if (mode === 'owner') {
      state.ownerContact = txt;
      await dbPut('config/ownerContact', txt);
      return showAdminBoardInReplyMenu(ctx, '✅ Owner তথ্য সেট হয়েছে।');
    }
    if (mode === 'bcast') {
      let sent = 0;
      for (const u of state.users) {
        try {
          await rawSendMessage(u, `🟧 *ANNOUNCEMENT BOARD*\n🟦 *${txt}*`, getMainKeyboard(ADMIN_IDS.includes(Number(u))));
          sent++;
        } catch (_) {}
      }
      return showAdminBoardInReplyMenu(ctx, `✅ ব্রডকাস্ট পাঠানো হয়েছে: ${sent} জনকে।`);
    }
  }

  if (state.waitingSupportFrom.has(uid)) {
    state.waitingSupportFrom.delete(uid);
    await rawSendMessage(SUPPORT_TARGET_ID, `📩 *SUPPORT FROM* \`${uid}\`\n🟩 *${txt}*`);
    return sendCleanBoard(ctx, '🟩 *SENT BOARD*\n🟦 *মেসেজ সাপোর্টে পাঠানো হয়েছে*', {
      inline_keyboard: [[{ text: '🟢 Get Number', callback_data: 'back_services', style: 'success' }]]
    });
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
  if (FIREBASE_DB_URL) {
    const [u, b, st, hist, key, en, rngEn, rewEn, notifEn, shMode, jc, mLink, mId, oLink, oId, rLink, rId, own, vUsers, seenItems] = await Promise.all([
      dbGet('users/list'),
      dbGet('balances'),
      dbGet('stats/otps'),
      dbGet('history/numbers'),
      dbGet('config/apiKey'),
      dbGet('config/apiUrlEnabled'),
      dbGet('config/rangeEnabled'),
      dbGet('config/rewardEnabled'),
      dbGet('config/newNumberNotify'),
      dbGet('config/shortMsgMode'),
      dbGet('config/joinCheckEnabled'),
      dbGet('config/mainGroupLink'),
      dbGet('config/mainGroupId'),
      dbGet('config/otpGroupLink'),
      dbGet('config/otpGroupId'),
      dbGet('config/rangeGroupLink'),
      dbGet('config/rangeGroupId'),
      dbGet('config/ownerContact'),
      dbGet('verifiedUsers'),
      dbGet('config/seenNewItems')
    ]);
    if (Array.isArray(u)) state.users = u;
    if (b && typeof b === 'object') state.balances = b;
    if (st && typeof st === 'object') {
      state.otpStats = { total: Number(st.total || 0), byCountry: st.byCountry || st.byRange || {} };
    }
    if (Array.isArray(hist)) state.numberHistory = hist;
    if (key) state.apiKey = key;
    if (typeof en === 'boolean') state.apiEnabled = en;
    if (typeof rngEn === 'boolean') state.rangeEnabled = rngEn;
    if (typeof rewEn === 'boolean') state.rewardEnabled = rewEn;
    if (typeof notifEn === 'boolean') state.newNumberNotify = notifEn;
    if (typeof shMode === 'boolean') state.shortMsgMode = shMode;
    if (typeof jc === 'boolean') state.joinCheckEnabled = jc;
    if (mLink) state.mainGroupLink = mLink;
    if (mId) state.mainGroupId = String(mId);
    if (oLink) state.otpGroupLink = oLink;
    if (oId) state.otpGroupId = String(oId);
    if (rLink) state.rangeGroupLink = rLink;
    if (rId) state.rangeGroupId = String(rId);
    if (own) state.ownerContact = String(own);
    if (vUsers && typeof vUsers === 'object') state.verifiedUsers = vUsers;
    if (Array.isArray(seenItems)) state.seenNewItems = new Set(seenItems);
  }

  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'মূল মেনু চালু করুন' },
      { command: 'getnumber', description: 'নতুন নম্বর নিন' },
      { command: 'getcode', description: 'OTP কোড আনুন' }
    ]);
  } catch (_) {}

  await bot.launch();
  console.log('Bot running with country names, Get Code action & clean boards...');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
