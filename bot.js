const { Telegraf } = require('telegraf');
const axios = require('axios');
const http = require('http');

const BOT_TOKEN = process.env.BOT_TOKEN;
const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || '').replace(/\/+$/, '');
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
  apiKey: DEFAULT_API_KEY,
  joinCheckEnabled: true,
  mainGroupLink: process.env.MAIN_GROUP_LINK || 'https://t.me/nhbdofficial',
  mainGroupId: process.env.MAIN_GROUP_ID || '',
  otpGroupLink: process.env.OTP_GROUP_LINK || 'https://t.me/nhbdofficial',
  otpGroupId: process.env.OTP_GROUP_ID || '',
  verifiedUsers: {},
  otpReward: 0.55,
  minWithdraw: 50,
  users: [],
  balances: {},
  numberHistory: [],
  otpStats: { total: 0, byCountry: {} },
  userSession: new Map(),
  lastBotBoardMsg: new Map(),
  waitingSupportFrom: new Set(),
  waitingRangeFrom: new Map(), // userId -> serviceName
  adminWizard: new Map(),
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
  const url = new URL(endpointUrl);
  const merged = {
    api_key: getApiKey(),
    ...extraParams
  };
  Object.entries(merged).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      url.searchParams.set(k, String(v).trim());
    }
  });
  return url.toString();
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
      label: `${byNameOrIso.flag} ${byNameOrIso.name} (${byNameOrIso.iso})`,
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
        label: `${c.flag} ${c.name} (${c.iso})`,
        flag: c.flag,
        dial: c.dial
      };
    }
  }

  const fallbackCode = digits.slice(0, 3) || 'N/A';
  return {
    key: `code_${fallbackCode}`,
    name: `Country +${fallbackCode}`,
    iso: 'XX',
    label: `🌍 Country +${fallbackCode}`,
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

async function registerUser(userId) {
  if (!userId) return;
  const idStr = String(userId);
  if (!state.users.includes(idStr)) {
    state.users.push(idStr);
    await dbPut('users/list', state.users);
  }
  if (state.balances[idStr] === undefined) {
    state.balances[idStr] = 0;
    await dbPut(`balances/${encodeURIComponent(idStr)}`, 0);
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
  try {
    return await bot.telegram.callApi('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  } catch (_) {
    return null;
  }
}

async function sendCleanBoard(ctx, text, reply_markup = null, preferEdit = false) {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  const activeMsgId = ctx.callbackQuery?.message?.message_id || null;

  const prevMsgId = state.lastBotBoardMsg.get(userId);
  if (prevMsgId && prevMsgId !== activeMsgId) {
    await rawDeleteMessage(chatId, prevMsgId);
    state.lastBotBoardMsg.delete(userId);
  }

  if (activeMsgId && preferEdit && chatId) {
    try {
      const edited = await rawEditMessageText(chatId, activeMsgId, text, reply_markup);
      if (userId && edited?.message_id) state.lastBotBoardMsg.set(userId, edited.message_id);
      return edited;
    } catch (_) {}
  }

  const sent = await rawSendMessage(chatId, text, reply_markup);
  if (userId && sent?.message_id) state.lastBotBoardMsg.set(userId, sent.message_id);
  return sent;
}

function getMainKeyboard(isAdmin) {
  const rows = [
    [{ text: '🟢 GET NUMBER', style: 'danger' }],
    [
      { text: '🟣 WALLET', style: 'success' },
      { text: '🔵 TRAFFIC', style: 'primary' }
    ],
    [
      { text: '🩷 SUPPORT', style: 'primary' },
      { text: '🟡 NUMBER FILE', style: 'danger' }
    ]
  ];
  if (isAdmin) rows.push([{ text: '💠 ADMIN PANEL', style: 'primary' }]);
  return { keyboard: rows, resize_keyboard: true };
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
    await dbPut(`verifiedUsers/${encodeURIComponent(idStr)}`, true);
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
    `🔒 *গ্রুপ ভেরিফিকেশন প্রয়োজন*\n\n` +
    `*GET NUMBER* চালু করতে নিচের **২টি গ্রুপ** (**Main Group** ও **OTP Group**)-এ জয়েন করে **✅ Verify** বাটনে চাপুন:\n\n` +
    `${missingMain ? '❌ Main Group' : '✅ Main Group'}  |  ${missingOtp ? '❌ OTP Group' : '✅ OTP Group'}`;

  return sendCleanBoard(ctx, text, { inline_keyboard: rows }, preferEdit);
}

async function fetchActiveRanges() {
  if (!isApiReady()) return [];
  if (state.cachedRanges && Date.now() - state.cachedRanges.ts < 30000) {
    return state.cachedRanges.items;
  }
  try {
    const res = await callPanel(PANEL_URLS.activeRange, {}, 8000);
    console.log('[ACTIVE-RANGE RESP]:', JSON.stringify(res.data));
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
    console.log('[BALANCE RESP]:', JSON.stringify(res.data));
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
  if (range && range !== 'auto') {
    params.range = range;
  }

  const res = await callPanel(PANEL_URLS.getNumber, params, 10000);
  console.log('[GET-NUMBER RESP]:', JSON.stringify(res.data));

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

  const countryInfo = resolveCountryInfo(phone);
  return {
    service: cleanService,
    range: range && range !== 'auto' ? range : 'auto',
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
  console.log('[GET-OTP RESP]:', JSON.stringify(res.data));

  const d = res.data || {};
  const inner = d.data && typeof d.data === 'object' ? d.data : {};

  const candidates = [
    d.otp,
    d.code,
    d.sms,
    d.message,
    inner.otp,
    inner.code,
    inner.sms,
    inner.message
  ];

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

async function deliverOtpToUserAndGroup(uid, item, rawOtp) {
  const formattedOtp = formatDashedOtp(rawOtp);
  const digits = String(item.phone || '').replace(/[^\d]/g, '');
  const serviceName = item.service || 'WhatsApp';

  const userText = `${item.flag} *${serviceName}* \`${digits}\``;
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

  const otpGroupTarget = String(state.otpGroupId || '').trim() || extractUsernameFromLink(state.otpGroupLink);
  if (otpGroupTarget) {
    const shortTag = getServiceShortTag(serviceName);
    const prefix = digits.slice(0, 4) || 'N/A';
    const rngCode = item.range && item.range !== 'auto' ? String(item.range) : digits.slice(0, 6);

    const groupText =
      `${item.flag} *${item.countryName}* 🟢 *${shortTag}*\n\n` +
      `\`#${item.countryIso}\` *${digits}*\n` +
      `Prefix: \`${prefix}\` | Range: \`#${rngCode}\``;

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
    } catch (e) {
      console.error('[OTP GROUP SEND ERR]:', e.message);
    }
  }
}

function buildNumberCard(sess, otp = null) {
  const item = sess.item;
  const serviceName = item.service || 'Telegram';
  const digits = String(item.phone || '').replace(/[^\d]/g, '');
  const shownPhone =
    sess.stripCC && item.dial && digits.startsWith(item.dial)
      ? digits.slice(item.dial.length)
      : `+${digits}`;

  const text =
    `${item.flag} 🟢 *${serviceName} Number Assigned:*\n` +
    `🌍 Country: *${item.countryLabel}*\n` +
    (item.range && item.range !== 'auto' ? `🔢 Range: \`${item.range}\`\n` : '') +
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
      },
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

async function openServiceMenu(ctx, preferEdit = false) {
  const ranges = await fetchActiveRanges();
  const servicesFromApi = [
    ...new Set(
      ranges
        .map((r) => String(r?.service || '').trim())
        .filter(Boolean)
    )
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

  return sendCleanBoard(ctx, '📲 *Select a Service*', { inline_keyboard: rows }, preferEdit);
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
    const cInfo = resolveCountryInfo(rawRange);
    if (!seenCountries.has(cInfo.key)) {
      seenCountries.set(cInfo.key, {
        label: cInfo.label,
        range: rawRange
      });
    }
  }

  const countryList = [...seenCountries.values()];
  const rows = [
    [{ text: '🌐 Auto Country', callback_data: `get_num_${encodeURIComponent(cleanService)}__auto`, style: 'success' }]
  ];

  for (let i = 0; i < countryList.length; i += 2) {
    const c1 = countryList[i];
    const row = [
      { text: c1.label, callback_data: `get_num_${encodeURIComponent(cleanService)}__${encodeURIComponent(c1.range)}`, style: 'primary' }
    ];
    if (countryList[i + 1]) {
      const c2 = countryList[i + 1];
      row.push({
        text: c2.label,
        callback_data: `get_num_${encodeURIComponent(cleanService)}__${encodeURIComponent(c2.range)}`,
        style: 'primary'
      });
    }
    rows.push(row);
  }

  rows.push([{ text: '⬅️ Back to Services', callback_data: 'back_services', style: 'danger' }]);

  return sendCleanBoard(ctx, `🌍 *${cleanService} — Select Country:*`, { inline_keyboard: rows }, preferEdit);
}

async function renderAdminDashboard(ctx, preferEdit = false) {
  const balData = await fetchPanelBalanceRaw();
  const balAmt = balData?.balance !== undefined ? balData.balance : 0;
  const currency = balData?.currency || 'BDT';
  const rate = balData?.perOtpRate !== undefined ? balData.perOtpRate : state.otpReward;
  const totalNums = balData?.totalNumbers !== undefined ? balData.totalNumbers : state.numberHistory.length;
  const totalOtps = balData?.totalOtps !== undefined ? balData.totalOtps : state.otpStats.total;

  const text =
    `💠 *NXV SMS — TELEGRAM BOT & API HUB*\n` +
    `${state.apiEnabled ? '🟢 *API সচল (ACTIVE)*' : '🔴 *API বন্ধ (INACTIVE)*'} | ${state.joinCheckEnabled ? '🔒 *2-Group Join ON*' : '🔓 *Join OFF*'}\n\n` +
    `🔑 *API Token:* \`${maskApiKey(getApiKey())}\`\n` +
    `🌐 *Base URL:* \`${PANEL_URLS.base}\`\n` +
    `👥 *Bot Users:* \`${state.users.length}\`\n\n` +
    `💰 *Panel Balance:* *৳${balAmt}* (${currency})\n` +
    `⚡ *Per OTP Rate:* *৳${rate}*\n` +
    `📞 *Total Numbers:* *${totalNums}* | 📩 *OTPs Received:* *${totalOtps}*\n\n` +
    `📌 *Main Group:* \`${state.mainGroupLink}\`\n` +
    `📌 *OTP Group:* \`${state.otpGroupLink}\``;

  const markup = {
    inline_keyboard: [
      [
        { text: '🔑 Set API Key', callback_data: 'adm_set_key', style: 'primary' },
        { text: state.apiEnabled ? '🟢 API ON' : '🔴 API OFF', callback_data: 'adm_tgl_api', style: state.apiEnabled ? 'success' : 'danger' }
      ],
      [
        { text: '📢 Set Main Group', callback_data: 'adm_set_main_grp', style: 'primary' },
        { text: '📩 Set OTP Group', callback_data: 'adm_set_otp_grp', style: 'primary' }
      ],
      [
        { text: state.joinCheckEnabled ? '🔒 Join Gate ON' : '🔓 Join Gate OFF', callback_data: 'adm_tgl_join', style: state.joinCheckEnabled ? 'success' : 'danger' },
        { text: '📣 Broadcast', callback_data: 'adm_bcast', style: 'primary' }
      ],
      [
        { text: '🧪 Test /balance', callback_data: 'adm_test_bal', style: 'success' },
        { text: '📡 Test /active-rangre', callback_data: 'adm_test_rng', style: 'success' }
      ],
      [
        { text: '🔗 API Endpoints', callback_data: 'adm_endpoints' },
        { text: '🛡️ Community & Support', callback_data: 'adm_community' }
      ]
    ]
  };

  return sendCleanBoard(ctx, text, markup, preferEdit);
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

        if (Number(state.otpReward) > 0) {
          const curBal = Number(state.balances[String(uid)] || 0);
          const nextBal = Number((curBal + Number(state.otpReward)).toFixed(2));
          state.balances[String(uid)] = nextBal;
          await dbPut(`balances/${uid}`, nextBal);
        }

        await deliverOtpToUserAndGroup(uid, sess.item, otp);
      }
    } catch (err) {
      console.error('[GET-OTP ERR]:', err.response?.data || err.message);
    }
  }
}, 4000);

bot.start(async (ctx) => {
  await registerUser(ctx.from.id);
  const isAdmin = ADMIN_IDS.includes(ctx.from.id);

  if (!isAdmin && state.joinCheckEnabled) {
    const chk = await verifyUserInTwoGroups(ctx.from.id);
    if (!chk.ok) {
      return sendJoinGateBoard(ctx, chk.missingMain, chk.missingOtp, false);
    }
  }

  await sendCleanBoard(ctx, 'স্বাগতম! নিচের মেনু থেকে অপশন বেছে নিন:', getMainKeyboard(isAdmin));
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
  await dbPut(`verifiedUsers/${encodeURIComponent(idStr)}`, true);
  await ctx.answerCbQuery('✅ ভেরিফাই সফল হয়েছে!');
  await openServiceMenu(ctx, true);
});

bot.hears('🟢 GET NUMBER', async (ctx) => {
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

bot.action(/^pick_srv_(.+)$/, async (ctx) => {
  const service = decodeURIComponent(ctx.match[1] || 'Telegram');
  await ctx.answerCbQuery();
  await openCountryMenu(ctx, service, true);
});

bot.action('back_services', async (ctx) => {
  await ctx.answerCbQuery();
  await openServiceMenu(ctx, true);
});

// Single Range button from Number Card
bot.action(/^ask_rng_(.+)$/, async (ctx) => {
  const service = decodeURIComponent(ctx.match[1] || 'Telegram');
  state.waitingRangeFrom.set(ctx.from.id, service);
  await ctx.answerCbQuery();
  await sendCleanBoard(
    ctx,
    `🔢 *${service}* এর জন্য যে **Range** চান সেটি লিখে পাঠান (যেমন: \`22879\` বা \`245955\`):`,
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
  const cleanRange = String(range || 'auto').trim() || 'auto';

  try {
    const res = await requestNumberFromPanel(cleanService, cleanRange);
    if (!res || res.error) {
      return sendCleanBoard(
        ctx,
        `⚠️ *${cleanService}* ${cleanRange !== 'auto' ? `(Range: \`${cleanRange}\`) ` : ''}এর জন্য নম্বর পাওয়া যায়নি।\n${res?.error ? `কারণ: \`${res.error}\`` : ''}`,
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
      '❌ প্যানেল থেকে নম্বর আনতে সমস্যা হয়েছে।',
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

bot.hears('🟣 WALLET', async (ctx) => {
  await registerUser(ctx.from.id);
  const bal = Number(state.balances[String(ctx.from.id)] || 0);
  await sendCleanBoard(
    ctx,
    `🟣 *WALLET*\n\n• ID: \`${ctx.from.id}\`\n• Balance: *${bal}*\n• Min Withdraw: *${state.minWithdraw}*`
  );
});

bot.hears('🔵 TRAFFIC', async (ctx) => {
  await registerUser(ctx.from.id);
  const total = Number(state.otpStats.total || 0);
  const list = Object.values(state.otpStats.byCountry || {});
  if (!total || !list.length) {
    return sendCleanBoard(ctx, '📡 *TRAFFIC REPORT*\n\nএখনো কোনো OTP আসেনি।');
  }
  const lines = list.map((x) => {
    const pct = ((Number(x.count || 0) / total) * 100).toFixed(1);
    return `• ${x.label}: *${x.count}/${total}* (*${pct}%*)`;
  });
  await sendCleanBoard(ctx, `📡 *TRAFFIC REPORT*\n\nTotal: *${total}*\n\n${lines.join('\n')}`);
});

bot.hears('🟡 NUMBER FILE', async (ctx) => {
  await registerUser(ctx.from.id);
  const myHist = state.numberHistory.filter((x) => String(x.uid) === String(ctx.from.id)).slice(0, 10);
  if (!myHist.length) {
    return sendCleanBoard(ctx, '🟡 এখনো কোনো নম্বর হিস্ট্রি নেই।');
  }
  const lines = myHist.map(
    (h, idx) => `${idx + 1}. *${h.service}* | \`${h.phone}\` (Range: \`${h.range || 'auto'}\`)`
  );
  await sendCleanBoard(ctx, `🟡 *Number History (সর্বশেষ ১০টি):*\n\n${lines.join('\n')}`);
});

bot.hears('🩷 SUPPORT', async (ctx) => {
  await registerUser(ctx.from.id);
  state.waitingSupportFrom.add(ctx.from.id);
  await sendCleanBoard(ctx, '🩷 আপনার মেসেজটি লিখুন:');
});

bot.hears('💠 ADMIN PANEL', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  await renderAdminDashboard(ctx, false);
});

bot.action('adm_back', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  await ctx.answerCbQuery();
  await renderAdminDashboard(ctx, true);
});

bot.action('adm_tgl_api', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.apiEnabled = !state.apiEnabled;
  state.cachedRanges = null;
  await dbPut('config/apiUrlEnabled', state.apiEnabled);
  await ctx.answerCbQuery(state.apiEnabled ? 'API ON' : 'API OFF');
  await renderAdminDashboard(ctx, true);
});

bot.action('adm_tgl_join', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.joinCheckEnabled = !state.joinCheckEnabled;
  await dbPut('config/joinCheckEnabled', state.joinCheckEnabled);
  await ctx.answerCbQuery(state.joinCheckEnabled ? 'Join Gate ON' : 'Join Gate OFF');
  await renderAdminDashboard(ctx, true);
});

bot.action('adm_set_key', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, 'key');
  await ctx.answerCbQuery();
  await sendCleanBoard(ctx, '🔑 নতুন API Token পাঠান:', {
    inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'adm_back', style: 'danger' }]]
  }, true);
});

bot.action('adm_set_main_grp', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, 'main_grp');
  await ctx.answerCbQuery();
  await sendCleanBoard(
    ctx,
    '📢 Main Group লিংক পাঠান (চাইলে স্পেস দিয়ে Chat ID ও দিতে পারেন, যেমন `https://t.me/group -100123456`):',
    { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'adm_back', style: 'danger' }]] },
    true
  );
});

bot.action('adm_set_otp_grp', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, 'otp_grp');
  await ctx.answerCbQuery();
  await sendCleanBoard(
    ctx,
    '📩 OTP Group লিংক পাঠান (চাইলে স্পেস দিয়ে Chat ID ও দিতে পারেন, যেমন `https://t.me/group -100123456`):',
    { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'adm_back', style: 'danger' }]] },
    true
  );
});

bot.action('adm_bcast', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, 'bcast');
  await ctx.answerCbQuery();
  await sendCleanBoard(ctx, '📣 সব ইউজারকে পাঠানোর মেসেজ লিখুন:', {
    inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'adm_back', style: 'danger' }]]
  }, true);
});

bot.action('adm_test_bal', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  await ctx.answerCbQuery('Testing /balance...');
  const data = await fetchPanelBalanceRaw();
  const preview = JSON.stringify(data || { error: 'No response' }, null, 2).slice(0, 1200);
  await sendCleanBoard(
    ctx,
    `🧪 *TERMINAL: GET /balance*\n\n\`\`\`json\n${preview}\n\`\`\``,
    { inline_keyboard: [[{ text: '⬅️ Back to Panel', callback_data: 'adm_back', style: 'danger' }]] },
    true
  );
});

bot.action('adm_test_rng', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  await ctx.answerCbQuery('Testing /active-rangre...');
  state.cachedRanges = null;
  const list = await fetchActiveRanges();
  const preview = JSON.stringify(list.slice(0, 6), null, 2).slice(0, 1200);
  await sendCleanBoard(
    ctx,
    `📡 *TERMINAL: GET /active-rangre*\nTotal Ranges: *${list.length}*\n\n\`\`\`json\n${preview}\n\`\`\``,
    { inline_keyboard: [[{ text: '⬅️ Back to Panel', callback_data: 'adm_back', style: 'danger' }]] },
    true
  );
});

bot.action('adm_endpoints', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  await ctx.answerCbQuery();
  const text =
    `🔗 *TELEGRAM BOT API URLS*\n\n` +
    `1️⃣ *Get Number:*\n\`${PANEL_URLS.getNumber}\`\n\n` +
    `2️⃣ *Get OTP:*\n\`${PANEL_URLS.getOtp}\`\n\n` +
    `3️⃣ *Active Range:*\n\`${PANEL_URLS.activeRange}\`\n\n` +
    `4️⃣ *Cancel Number:*\n\`${PANEL_URLS.cancelNumber}\`\n\n` +
    `5️⃣ *Check Balance:*\n\`${PANEL_URLS.balance}\``;

  await sendCleanBoard(
    ctx,
    text,
    { inline_keyboard: [[{ text: '⬅️ Back to Panel', callback_data: 'adm_back', style: 'danger' }]] },
    true
  );
});

bot.action('adm_community', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  await ctx.answerCbQuery();
  const text =
    `🛡️ *এডমিন ও অফিসিয়াল কমিউনিটি*\n\n` +
    `📢 Channel: *https://t.me/nhbdofficial*\n` +
    `👨‍💻 Developer: *NOOBXVAU* (\`@noobxvau\`)\n` +
    `✉️ Email: \`mnshiddik11@gmail.com\``;

  await sendCleanBoard(
    ctx,
    text,
    {
      inline_keyboard: [
        [{ text: '📢 Official Channel', url: 'https://t.me/nhbdofficial', style: 'primary' }],
        [{ text: '⬅️ Back to Panel', callback_data: 'adm_back', style: 'danger' }]
      ]
    },
    true
  );
});

bot.on('text', async (ctx) => {
  const uid = ctx.from.id;
  await registerUser(uid);
  const txt = ctx.message.text.trim();

  // User submitted a Range after clicking "🔢 Set Range"
  if (state.waitingRangeFrom.has(uid)) {
    const service = state.waitingRangeFrom.get(uid);
    state.waitingRangeFrom.delete(uid);
    const cleanRange = txt.replace(/[^\dA-Za-z_-]/g, '');
    if (!cleanRange) {
      return rawSendMessage(ctx.chat.id, '⚠️ সঠিক Range লিখুন।');
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
      return rawSendMessage(ctx.chat.id, '✅ নতুন API Token সেট হয়েছে।');
    }
    if (mode === 'main_grp') {
      const parts = txt.split(/\s+/);
      state.mainGroupLink = parts[0];
      if (parts[1]) state.mainGroupId = parts[1];
      await dbPut('config/mainGroupLink', state.mainGroupLink);
      if (parts[1]) await dbPut('config/mainGroupId', state.mainGroupId);
      return rawSendMessage(ctx.chat.id, '✅ Main Group সেট হয়েছে।');
    }
    if (mode === 'otp_grp') {
      const parts = txt.split(/\s+/);
      state.otpGroupLink = parts[0];
      if (parts[1]) state.otpGroupId = parts[1];
      await dbPut('config/otpGroupLink', state.otpGroupLink);
      if (parts[1]) await dbPut('config/otpGroupId', state.otpGroupId);
      return rawSendMessage(ctx.chat.id, '✅ OTP Group সেট হয়েছে।');
    }
    if (mode === 'bcast') {
      let sent = 0;
      for (const u of state.users) {
        try {
          await rawSendMessage(u, `📣 *ANNOUNCEMENT*\n\n${txt}`);
          sent++;
        } catch (_) {}
      }
      return rawSendMessage(ctx.chat.id, `✅ পাঠানো হয়েছে: *${sent}* জনকে।`);
    }
  }

  if (state.waitingSupportFrom.has(uid)) {
    state.waitingSupportFrom.delete(uid);
    await rawSendMessage(SUPPORT_TARGET_ID, `📩 *Support from* \`${uid}\`:\n\n${txt}`);
    return rawSendMessage(ctx.chat.id, '✅ মেসেজ সাপোর্টে পাঠানো হয়েছে।');
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
    const [u, b, st, hist, key, en, jc, mLink, mId, oLink, oId, vUsers] = await Promise.all([
      dbGet('users/list'),
      dbGet('balances'),
      dbGet('stats/otps'),
      dbGet('history/numbers'),
      dbGet('config/apiKey'),
      dbGet('config/apiUrlEnabled'),
      dbGet('config/joinCheckEnabled'),
      dbGet('config/mainGroupLink'),
      dbGet('config/mainGroupId'),
      dbGet('config/otpGroupLink'),
      dbGet('config/otpGroupId'),
      dbGet('verifiedUsers')
    ]);
    if (Array.isArray(u)) state.users = u;
    if (b && typeof b === 'object') state.balances = b;
    if (st && typeof st === 'object') {
      state.otpStats = { total: Number(st.total || 0), byCountry: st.byCountry || st.byRange || {} };
    }
    if (Array.isArray(hist)) state.numberHistory = hist;
    if (key) state.apiKey = key;
    if (typeof en === 'boolean') state.apiEnabled = en;
    if (typeof jc === 'boolean') state.joinCheckEnabled = jc;
    if (mLink) state.mainGroupLink = mLink;
    if (mId) state.mainGroupId = String(mId);
    if (oLink) state.otpGroupLink = oLink;
    if (oId) state.otpGroupId = String(oId);
    if (vUsers && typeof vUsers === 'object') state.verifiedUsers = vUsers;
  }
  await bot.launch();
  console.log('Bot running with single Set Range button on number card and history logging...');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
