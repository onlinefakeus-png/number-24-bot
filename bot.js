const { Telegraf, Markup } = require('telegraf');
const { io } = require('socket.io-client');
const axios = require('axios');
const http = require('http');

const BOT_TOKEN = process.env.BOT_TOKEN;
const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || '').replace(/\/+$/, '');
const PORT = process.env.PORT || 10000;
const SELF_URL = process.env.RENDER_EXTERNAL_URL || '';

const ADMIN_IDS = [8771921458];
const SUPPORT_TARGET_ID = 8771921458;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN missing');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// 'socket' | 'api' | 'auto' | 'off'
let providerMode = process.env.PROVIDER_MODE || 'auto';

// দেশ অনুযায়ী পতাকা, ISO কোড ও ডায়ালিং কোড ম্যাপ
const COUNTRY_META = [
  { keys: ['afghanistan'], name: 'Afghanistan', iso: 'AF', dial: '93', flag: '🇦🇫' },
  { keys: ['bangladesh'], name: 'Bangladesh', iso: 'BD', dial: '880', flag: '🇧🇩' },
  { keys: ['cambodia'], name: 'Cambodia', iso: 'KH', dial: '855', flag: '🇰🇭' },
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
  { keys: ['malaysia'], name: 'Malaysia', iso: 'MY', dial: '60', flag: '🇲🇾' },
  { keys: ['maldives'], name: 'Maldives', iso: 'MV', dial: '960', flag: '🇲🇻' },
  { keys: ['mali'], name: 'Mali', iso: 'ML', dial: '223', flag: '🇲🇱' },
  { keys: ['nepal'], name: 'Nepal', iso: 'NP', dial: '977', flag: '🇳🇵' },
  { keys: ['nigeria'], name: 'Nigeria', iso: 'NG', dial: '234', flag: '🇳🇬' },
  { keys: ['pakistan'], name: 'Pakistan', iso: 'PK', dial: '92', flag: '🇵🇰' },
  { keys: ['russia'], name: 'Russia', iso: 'RU', dial: '7', flag: '🇷🇺' },
  { keys: ['senegal'], name: 'Senegal', iso: 'SN', dial: '221', flag: '🇸🇳' },
  { keys: ['sierra leone', 'sierra'], name: 'Sierra Leone', iso: 'SL', dial: '232', flag: '🇸🇱' },
  { keys: ['uk', 'united kingdom', 'britain', 'england'], name: 'United Kingdom', iso: 'GB', dial: '44', flag: '🇬🇧' },
  { keys: ['usa', 'united states', 'america'], name: 'United States', iso: 'US', dial: '1', flag: '🇺🇸' }
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
      dial: matched.dial
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
    dial: ''
  };
}

function attachCountryCode(rawNumber, dialCode = '') {
  const digits = String(rawNumber || '').replace(/[^\d]/g, '');
  if (!digits || digits.length < 6 || digits.length > 15) return null;

  if (dialCode) {
    if (digits.startsWith(dialCode)) {
      return `+${digits}`;
    }
    // স্থানীয় ০ দিয়ে শুরু হলে ০ বাদ দিয়ে কান্ট্রি কোড বসায়
    const withoutLeadingZero = digits.replace(/^0+/, '');
    return `+${dialCode}${withoutLeadingZero}`;
  }
  return `+${digits}`;
}

const state = {
  socketUrl: process.env.SOCKET_URL || 'https://www.ivasms.com',
  socketPath: process.env.SOCKET_PATH || '/live/socket.io/',
  socketCookie: process.env.SOCKET_COOKIE || '',
  apiUrl: process.env.API_URL || '',
  apiKey: process.env.API_KEY || '',

  // গ্রুপ ও Join Check সেটিংস
  mainGroupLink: process.env.MAIN_GROUP_LINK || 'https://t.me/your_main_group_link',
  mainGroupId: process.env.MAIN_GROUP_ID || '',
  otpGroupLink: process.env.OTP_GROUP_LINK || 'https://t.me/your_otp_group_link',
  otpGroupId: process.env.OTP_GROUP_ID || '',
  joinCheck: true,

  // প্রতিটি এন্ট্রি: { id, service, countryKey, countryLabel, flag, dial, phone }
  numberEntries: [],
  users: [],
  otpsByPhone: {},
  // userId -> { service, countryKey, countryLabel, batchEntries: [], offset: number, autoChecker: boolean, stripCC: boolean, otpDelivered: boolean }
  userSession: new Map(),

  // স্টেট ট্র্যাকিং
  waitingSupportFrom: new Set(),
  adminWizard: new Map()
};

// Firebase Helpers
async function dbGet(path) {
  if (!FIREBASE_DB_URL) return null;
  try {
    const res = await axios.get(`${FIREBASE_DB_URL}/${path}.json`);
    return res.data;
  } catch (e) {
    console.error('Firebase GET error:', e.message);
    return null;
  }
}

async function dbPut(path, data) {
  if (!FIREBASE_DB_URL) return false;
  try {
    await axios.put(`${FIREBASE_DB_URL}/${path}.json`, data);
    return true;
  } catch (e) {
    console.error('Firebase PUT error:', e.message);
    return false;
  }
}

async function persistEntries() {
  await dbPut('pool/entries', state.numberEntries);
}

async function registerUser(userId) {
  if (!userId) return;
  const idStr = String(userId);
  if (!state.users.includes(idStr)) {
    state.users.push(idStr);
    await dbPut('users/list', state.users);
  }
}

function parseSocketInput(rawInput) {
  const trimmed = String(rawInput || '').trim();
  const normalized = trimmed
    .replace(/^wss:\/\//i, 'https://')
    .replace(/^ws:\/\//i, 'http://');
  try {
    const parsed = new URL(normalized);
    const origin = parsed.origin;
    const path =
      parsed.pathname && parsed.pathname !== '/'
        ? parsed.pathname
        : '/live/socket.io/';
    return { origin, path };
  } catch (_) {
    return { origin: trimmed, path: state.socketPath || '/live/socket.io/' };
  }
}

async function setProviderMode(nextMode) {
  providerMode = nextMode;
  await dbPut('config/providerMode', nextMode);
  initSocket();
}

function normalizePhoneKey(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
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
        await bot.telegram.sendMessage(
          uid,
          `✅ *OTP রিসিভ হয়েছে!*\n\n` +
            `📱 সার্ভিস: *${matched.service}*\n` +
            `${matched.flag || '🌍'} দেশ: *${matched.countryLabel || matched.countryKey}*\n` +
            `📞 নম্বর: \`${matched.phone}\`\n` +
            `🔑 OTP কোড: \`${otp}\``,
          { parse_mode: 'Markdown' }
        );
      } catch (_) {}
    }
  }
}

async function saveOtp(phone, otp) {
  if (!phone || !otp) return;
  const cleanPhone = String(phone).trim();
  const key = normalizePhoneKey(cleanPhone) || cleanPhone;
  state.otpsByPhone[key] = { otp: String(otp), updatedAt: Date.now() };
  await dbPut(`otps/${encodeURIComponent(key)}`, {
    otp: String(otp),
    updatedAt: Date.now()
  });
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

// নম্বর সংগ্রহ ও অটো কান্ট্রি কোড যুক্ত করা
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
  const userMsg =
    `🔔 *নতুন নম্বর যুক্ত হয়েছে!*\n\n` +
    `📱 সার্ভিস: *${service}*\n` +
    `🌍 দেশ: *${countryLabel}*\n` +
    `🔢 যুক্ত হওয়া নম্বর: *${addedCount}*টি\n` +
    `📦 মাধ্যম: *${sourceLabel}*`;

  for (const uid of state.users) {
    try {
      await bot.telegram.sendMessage(uid, userMsg, { parse_mode: 'Markdown' });
    } catch (_) {}
  }
}

async function finalizeAddedNumbers(ctx, service, rawCountry, rawNumbers, sourceLabel) {
  const countryInfo = resolveCountryInfo(rawCountry);
  const phones = extractFormattedPhones(rawNumbers, countryInfo.dial);

  if (!phones.length) {
    await ctx.reply('⚠️ কোনো বৈধ ফোন নম্বর পাওয়া যায়নি। আবার চেষ্টা করুন।');
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
        phone
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

  await ctx.reply(
    `আসসালামু আলাইকুম স্যার, নাম্বার যুক্ত করা সম্পুর্ন হয়েছে স্যার\n\n` +
      `📱 সার্ভিস: *${service}*\n` +
      `🌍 দেশ: *${countryInfo.label}*\n` +
      `➕ নতুন যুক্ত হয়েছে: *${addedCount}*টি\n` +
      `📦 এই দেশে মোট নম্বর: \`${totalForCountry}\`টি (সর্বমোট: \`${state.numberEntries.length}\`টি)`,
    { parse_mode: 'Markdown' }
  );

  await broadcastNewNumbers(service, countryInfo.label, addedCount, sourceLabel);
}

// গ্রুপ মেম্বারশিপ যাচাই
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
  const buttons = [];
  if (state.mainGroupLink) {
    buttons.push([Markup.button.url('📢 Join Main Group', state.mainGroupLink)]);
  }
  if (state.otpGroupLink) {
    buttons.push([Markup.button.url('🔐 Join OTP Group', state.otpGroupLink)]);
  }
  buttons.push([Markup.button.callback('✅ Verify Join', 'verify_group_join')]);

  await ctx.reply(
    '🔒 বট ব্যবহার করতে হলে আগে নিচের গ্রুপগুলোতে জয়েন করুন এবং **Verify Join** চাপুন:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    }
  );
}

// মেইন Reply Keyboard
function getMainReplyKeyboard(isAdmin) {
  const rows = [
    ['📞 GET NUMBER'],
    ['👛 WALLET', '📡 TRAFFIC'],
    ['✅ WA CHECKER'],
    ['🌐 LANGUAGE', '🆘 SUPPORT'],
    ['📄 NUMBER FILE']
  ];
  if (isAdmin) rows.push(['💠 ADMIN PANEL']);
  return Markup.keyboard(rows).resize();
}

function maskSecret(val) {
  if (!val) return 'Not set';
  if (val.length <= 6) return '******';
  return `${val.slice(0, 3)}***${val.slice(-3)}`;
}

// মেইন অ্যাডমিন প্যানেল
function getMainAdminPayload() {
  const socketOn = providerMode === 'socket' || providerMode === 'auto';
  const apiOn = providerMode === 'api' || providerMode === 'auto';

  const text =
    `💠 *ADMIN PANEL*\n\n` +
    `• *Saved Numbers:* \`${state.numberEntries.length}\`\n` +
    `• *Total Users:* \`${state.users.length}\`\n` +
    `• *Mode:* *${providerMode.toUpperCase()}*\n` +
    `• *Socket:* *${socketOn ? '🟢 ON' : '🔴 OFF'}* (${socketConnected ? 'Connected' : 'Disconnected'})\n` +
    `• *API:* *${apiOn ? '🟢 ON' : '🔴 OFF'}*\n` +
    `• *Join Check:* ${state.joinCheck ? '🟢 ON' : '🔴 OFF'}`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('➕ Add Number', 'adm_add_number'),
      Markup.button.callback('🗑️ Clear All Stock', 'adm_clear_stock')
    ],
    [
      Markup.button.callback('🔌 API Setup', 'sub_api_menu'),
      Markup.button.callback('⚡ Socket Setup', 'sub_socket_menu')
    ],
    [Markup.button.callback('👥 Group Setup', 'sub_group_menu')],
    [
      Markup.button.callback(
        providerMode === 'auto' ? '🔄 Auto (ACTIVE)' : '🔄 Auto Mode',
        'mode_auto'
      ),
      Markup.button.callback('⛔ All OFF', 'mode_off')
    ]
  ]);

  return { text, keyboard };
}

function getApiSetupPayload() {
  const apiOn = providerMode === 'api' || providerMode === 'auto';
  const text =
    `🔌 *API SETUP*\n\n` +
    `• *API Status:* *${apiOn ? '🟢 ON' : '🔴 OFF'}*\n` +
    `• *API URL:* \`${state.apiUrl || 'Not set'}\`\n` +
    `• *API Key:* \`${maskSecret(state.apiKey)}\``;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🌐 Set API URL', 'cfg_api_url'),
      Markup.button.callback('🔑 Set API Key', 'cfg_api_key')
    ],
    [
      Markup.button.callback(
        providerMode === 'api' ? '🔴 API OFF' : '🟢 API ON',
        providerMode === 'api' ? 'mode_off' : 'mode_api'
      )
    ],
    [Markup.button.callback('🔙 Back to Admin Panel', 'back_admin_main')]
  ]);

  return { text, keyboard };
}

function getSocketSetupPayload() {
  const socketOn = providerMode === 'socket' || providerMode === 'auto';
  const text =
    `⚡ *SOCKET SETUP*\n\n` +
    `• *Socket Status:* *${socketOn ? '🟢 ON' : '🔴 OFF'}* (${socketConnected ? 'Connected' : 'Disconnected'})\n` +
    `• *Socket URL:* \`${state.socketUrl}${state.socketPath}\`\n` +
    `• *Cookie:* \`${state.socketCookie ? 'Set' : 'Not set'}\``;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🔌 Set Socket URL', 'cfg_socket_url'),
      Markup.button.callback('🍪 Set Cookie', 'cfg_socket_cookie')
    ],
    [
      Markup.button.callback(
        providerMode === 'socket' ? '🔴 Socket OFF' : '🟢 Socket ON',
        providerMode === 'socket' ? 'mode_off' : 'mode_socket'
      )
    ],
    [Markup.button.callback('🔙 Back to Admin Panel', 'back_admin_main')]
  ]);

  return { text, keyboard };
}

function getGroupSetupPayload() {
  const text =
    `👥 *GROUP SETUP*\n\n` +
    `• *Join Check:* ${state.joinCheck ? '🟢 ON' : '🔴 OFF'}\n` +
    `• *Main Link:* ${state.mainGroupLink || 'Not set'}\n` +
    `• *Main ID:* \`${state.mainGroupId || 'Not set'}\`\n` +
    `• *OTP Link:* ${state.otpGroupLink || 'Not set'}\n` +
    `• *OTP ID:* \`${state.otpGroupId || 'Not set'}\``;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🔗 Set Main Link', 'adm_main_link'),
      Markup.button.callback('🆔 Set Main ID', 'adm_main_id')
    ],
    [
      Markup.button.callback('🔗 Set OTP Link', 'adm_otp_link'),
      Markup.button.callback('🆔 Set OTP ID', 'adm_otp_id')
    ],
    [
      Markup.button.callback(
        state.joinCheck ? '🟡 Join Check OFF' : '🟢 Join Check ON',
        'adm_toggle_join'
      )
    ],
    [Markup.button.callback('🔙 Back to Admin Panel', 'back_admin_main')]
  ]);

  return { text, keyboard };
}

// HTTP REST API
async function fetchOtpViaApi(phone) {
  if (!state.apiUrl || !phone) return null;
  const res = await axios.get(state.apiUrl, {
    params: { api_key: state.apiKey, action: 'getOtp', number: phone, phone },
    timeout: 10000
  });
  const d = res.data || {};
  return d.otp || d.code || d.sms_code || d.data?.otp || d.data?.code || null;
}

// Socket.IO
let socketClient = null;
let socketConnected = false;

function initSocket() {
  if (socketClient) {
    try {
      socketClient.disconnect();
    } catch (_) {}
    socketClient = null;
  }
  socketConnected = false;

  const shouldUseSocket = providerMode === 'socket' || providerMode === 'auto';
  if (!shouldUseSocket || !state.socketUrl) return;

  const extraHeaders = {};
  if (state.socketCookie) extraHeaders.Cookie = state.socketCookie;

  socketClient = io(state.socketUrl, {
    path: state.socketPath || '/live/socket.io/',
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 3000,
    extraHeaders
  });

  socketClient.on('connect', () => {
    socketConnected = true;
    console.log('Socket.IO connected:', state.socketUrl);
  });

  socketClient.on('disconnect', (reason) => {
    socketConnected = false;
    console.log('Socket.IO disconnected:', reason);
  });

  socketClient.on('connect_error', (err) => {
    socketConnected = false;
    console.log('Socket.IO error (fallback ready):', err.message);
  });

  const handleIncomingSms = async (payload) => {
    if (!payload) return;
    const phone =
      payload.number ||
      payload.phone ||
      payload.cli ||
      payload.data?.number ||
      payload.data?.phone;
    const rawText =
      payload.otp ||
      payload.code ||
      payload.sms ||
      payload.message ||
      payload.data?.otp ||
      '';
    const match = String(rawText).match(/\b\d{4,8}\b/);
    const otp = match ? match[0] : String(rawText).trim();
    if (phone && otp) {
      await saveOtp(phone, otp);
    }
  };

  socketClient.onAny(async (_eventName, ...args) => {
    const first = args[0];
    if (first && typeof first === 'object') {
      await handleIncomingSms(first);
    }
  });
}

// Auto Checker লুপ
setInterval(async () => {
  for (const [uid, sess] of state.userSession.entries()) {
    if (!sess || !sess.autoChecker || sess.otpDelivered || !Array.isArray(sess.batchEntries)) {
      continue;
    }
    for (const item of sess.batchEntries) {
      let otp = await getSavedOtp(item.phone);
      if (!otp && (providerMode === 'api' || providerMode === 'auto')) {
        try {
          otp = await fetchOtpViaApi(item.phone);
          if (otp) await saveOtp(item.phone, otp);
        } catch (_) {}
      }
      if (otp) {
        sess.otpDelivered = true;
        state.userSession.set(uid, sess);
        try {
          await bot.telegram.sendMessage(
            uid,
            `✅ *OTP রিসিভ হয়েছে!*\n\n` +
              `📱 সার্ভিস: *${item.service}*\n` +
              `${item.flag || '🌍'} দেশ: *${item.countryLabel || item.countryKey}*\n` +
              `📞 নম্বর: \`${item.phone}\`\n` +
              `🔑 OTP কোড: \`${otp}\``,
            { parse_mode: 'Markdown' }
          );
        } catch (_) {}
        break;
      }
    }
  }
}, 5000);

// /start
bot.start(async (ctx) => {
  await registerUser(ctx.from.id);
  const isAdmin = ADMIN_IDS.includes(ctx.from.id);
  if (!isAdmin && !(await isUserVerifiedInGroups(ctx))) {
    await ctx.reply('স্বাগতম! নিচের মেনু:', getMainReplyKeyboard(false));
    return sendGroupVerifyPrompt(ctx);
  }
  await ctx.reply(
    'স্বাগতম! নিচের মেনু থেকে অপশন বেছে নিন:',
    getMainReplyKeyboard(isAdmin)
  );
});

bot.action('verify_group_join', async (ctx) => {
  await registerUser(ctx.from.id);
  const ok = await isUserVerifiedInGroups(ctx);
  if (ok) {
    await ctx.answerCbQuery('✅ ভেরিফাই সফল হয়েছে!');
    await ctx.reply('✅ গ্রুপ ভেরিফিকেশন সম্পন্ন হয়েছে। এখন বট ব্যবহার করতে পারবেন।');
  } else {
    await ctx.answerCbQuery('❌ আগে গ্রুপগুলোতে জয়েন করুন।', { show_alert: true });
  }
});

// অ্যাডমিন প্যানেল ও সাব-মেনু নেভিগেশন
async function renderPayload(ctx, payloadGetter, toastText = '') {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.answerCbQuery('শুধুমাত্র অ্যাডমিন ব্যবহার করতে পারবেন।', { show_alert: true });
  }
  if (toastText) await ctx.answerCbQuery(toastText);
  const { text, keyboard } = payloadGetter();
  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  } catch (_) {
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  }
}

bot.hears('💠 ADMIN PANEL', async (ctx) => {
  await registerUser(ctx.from.id);
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const { text, keyboard } = getMainAdminPayload();
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action('back_admin_main', (ctx) => renderPayload(ctx, getMainAdminPayload));
bot.action('sub_api_menu', (ctx) => renderPayload(ctx, getApiSetupPayload));
bot.action('sub_socket_menu', (ctx) => renderPayload(ctx, getSocketSetupPayload));
bot.action('sub_group_menu', (ctx) => renderPayload(ctx, getGroupSetupPayload));

// অ্যাডমিন থেকে সব স্টক মোছার বাটন (শুধুমাত্র অ্যাডমিন চাইলে মুছবে)
bot.action('adm_clear_stock', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.answerCbQuery('শুধুমাত্র অ্যাডমিন ব্যবহার করতে পারবেন।', { show_alert: true });
  }
  state.numberEntries = [];
  await persistEntries();
  await renderPayload(ctx, getMainAdminPayload, 'সব স্টক নম্বর মুছে ফেলা হয়েছে');
});

// Add Number শুরু (ধাপ ১: Service)
bot.action('adm_add_number', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.answerCbQuery('শুধুমাত্র অ্যাডমিন ব্যবহার করতে পারবেন।', { show_alert: true });
  }
  state.adminWizard.set(ctx.from.id, { step: 'ask_service', draft: {} });
  await ctx.answerCbQuery();
  await ctx.reply(
    '1️⃣ সার্ভিসের নাম লিখুন (যেমন: `WhatsApp` অথবা `Telegram` বা আপনার পছন্দমতো):',
    { parse_mode: 'Markdown' }
  );
});

// মোড পরিবর্তন
async function handleModeSwitch(ctx, nextMode, label, viewGetter) {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.answerCbQuery('শুধুমাত্র অ্যাডমিন ব্যবহার করতে পারবেন।', { show_alert: true });
  }
  await setProviderMode(nextMode);
  await renderPayload(ctx, viewGetter, label);
}

bot.action('mode_socket', (ctx) =>
  handleModeSwitch(ctx, 'socket', 'Socket মোড ON হয়েছে', getSocketSetupPayload)
);
bot.action('mode_api', (ctx) =>
  handleModeSwitch(ctx, 'api', 'API মোড ON হয়েছে', getApiSetupPayload)
);
bot.action('mode_auto', (ctx) =>
  handleModeSwitch(ctx, 'auto', 'Auto মোড ON হয়েছে', getMainAdminPayload)
);
bot.action('mode_off', (ctx) =>
  handleModeSwitch(ctx, 'off', 'সব মোড OFF করা হয়েছে', getMainAdminPayload)
);

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
    await ctx.reply(promptMsg, { parse_mode: 'Markdown' });
  };
}

bot.action('adm_main_link', startFieldPrompt('set_main_link', '🔗 নতুন *Main Group Link* পাঠান:'));
bot.action('adm_main_id', startFieldPrompt('set_main_id', '🆔 নতুন *Main Group ID* পাঠান:'));
bot.action('adm_otp_link', startFieldPrompt('set_otp_link', '🔗 নতুন *OTP Group Link* পাঠান:'));
bot.action('adm_otp_id', startFieldPrompt('set_otp_id', '🆔 নতুন *OTP Group ID* পাঠান:'));
bot.action('cfg_socket_url', startFieldPrompt('set_socket_url', '🔌 নতুন *Socket URL* পাঠান:'));
bot.action(
  'cfg_socket_cookie',
  startFieldPrompt('set_socket_cookie', '🍪 নতুন *Socket Cookie* পাঠান (বা `clear` লিখুন):')
);
bot.action('cfg_api_url', startFieldPrompt('set_api_url', '🌐 নতুন *API URL* পাঠান:'));
bot.action('cfg_api_key', startFieldPrompt('set_api_key', '🔑 নতুন *API Key* পাঠান:'));

// অ্যাডমিন থেকে ম্যানুয়াল OTP পুশ কমান্ড: /setotp <number> <otp>
bot.command('setotp', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  const phone = parts[1];
  const otp = parts[2];
  if (!phone || !otp) {
    return ctx.reply('ব্যবহার: `/setotp +201500155889 123456`', { parse_mode: 'Markdown' });
  }
  await saveOtp(phone, otp);
  await ctx.reply(`✅ \`${phone}\` নম্বরের জন্য OTP \`${otp}\` সেভ ও পাঠানো হয়েছে।`, {
    parse_mode: 'Markdown'
  });
});

// সাপোর্ট মেসেজ
bot.hears('🆘 SUPPORT', async (ctx) => {
  await registerUser(ctx.from.id);
  state.waitingSupportFrom.add(ctx.from.id);
  await ctx.reply('🆘 আপনার মেসেজটি লিখুন। সরাসরি সাপোর্টে পাঠানো হবে।');
});

// NUMBER FILE বাটন (দেশ ও সার্ভিস অনুযায়ী সংরক্ষিত নম্বর সামারি)
bot.hears('📄 NUMBER FILE', async (ctx) => {
  await registerUser(ctx.from.id);
  if (!state.numberEntries.length) {
    return ctx.reply('📄 বর্তমানে কোনো নম্বর ফাইল/স্টক যুক্ত নেই।');
  }
  const summaryMap = new Map();
  for (const item of state.numberEntries) {
    const key = `${item.service} | ${item.countryLabel || item.countryKey}`;
    summaryMap.set(key, (summaryMap.get(key) || 0) + 1);
  }
  const lines = Array.from(summaryMap.entries()).map(
    ([key, count]) => `• *${key}*: \`${count}\`টি`
  );
  await ctx.reply(
    `📄 *NUMBER FILE STOCK*\n\n${lines.join('\n')}\n\n📦 মোট সংরক্ষিত নম্বর: \`${state.numberEntries.length}\`টি`,
    { parse_mode: 'Markdown' }
  );
});

// GET NUMBER -> ১. Service নির্বাচন
async function showServiceSelection(ctx, isEdit = false) {
  if (providerMode === 'off') {
    return ctx.reply('⚠️ বর্তমানে নম্বর সার্ভিস OFF আছে।');
  }

  const services = [...new Set(state.numberEntries.map((e) => e.service).filter(Boolean))];
  if (!services.length) {
    return ctx.reply('⚠️ এখন কোনো সার্ভিস বা নম্বর স্টকে নেই।');
  }

  const rows = [];
  for (let i = 0; i < services.length; i += 2) {
    const row = [
      Markup.button.callback(
        `📱 ${services[i]}`,
        `pick_srv_${encodeURIComponent(services[i])}`
      )
    ];
    if (services[i + 1]) {
      row.push(
        Markup.button.callback(
          `📱 ${services[i + 1]}`,
          `pick_srv_${encodeURIComponent(services[i + 1])}`
        )
      );
    }
    rows.push(row);
  }

  const msgText = '1️⃣ প্রথমে **Service** বেছে নিন:';
  if (isEdit) {
    try {
      await ctx.editMessageText(msgText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(rows)
      });
      return;
    } catch (_) {}
  }
  await ctx.reply(msgText, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) });
}

bot.hears('📞 GET NUMBER', async (ctx) => {
  await registerUser(ctx.from.id);
  const isAdmin = ADMIN_IDS.includes(ctx.from.id);
  if (!isAdmin && !(await isUserVerifiedInGroups(ctx))) {
    return sendGroupVerifyPrompt(ctx);
  }
  await showServiceSelection(ctx, false);
});

// ২. Country নির্বাচন (প্রত্যেক দেশের পতাকা ও নামসহ আলাদা বাটন)
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

  const countries = Array.from(countryMap.entries());
  if (!countries.length) {
    const emptyText = `⚠️ *${service}* সার্ভিসে এখন কোনো দেশ বা নম্বর নেই।`;
    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Back to Service', 'back_srv_list')]
    ]);
    if (isEdit) {
      try {
        return await ctx.editMessageText(emptyText, { parse_mode: 'Markdown', ...kb });
      } catch (_) {}
    }
    return ctx.reply(emptyText, { parse_mode: 'Markdown', ...kb });
  }

  const rows = [];
  for (let i = 0; i < countries.length; i += 2) {
    const [k1, lbl1] = countries[i];
    const row = [
      Markup.button.callback(
        lbl1,
        `pick_cnt_${encodeURIComponent(service)}__${encodeURIComponent(k1)}`
      )
    ];
    if (countries[i + 1]) {
      const [k2, lbl2] = countries[i + 1];
      row.push(
        Markup.button.callback(
          lbl2,
          `pick_cnt_${encodeURIComponent(service)}__${encodeURIComponent(k2)}`
        )
      );
    }
    rows.push(row);
  }
  rows.push([Markup.button.callback('🔙 Back to Service', 'back_srv_list')]);

  const msgText = `📱 *${service} Select Country:*`;
  if (isEdit) {
    try {
      await ctx.editMessageText(msgText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(rows)
      });
      return;
    } catch (_) {}
  }
  await ctx.reply(msgText, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) });
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

// ৩. ৩টা করে নম্বর দেখানো ও Change Number (নম্বর না মুছে পুল থেকেই নেয়)
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

  if (!pool.length) {
    return {
      text: `⚠️ *${service}* (${countryKey}) এর কোনো নম্বর স্টকে নেই।`,
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback('🌐 Change Country', `chg_cnt_${encodeURIComponent(service)}`)],
        [Markup.button.callback('🔙 Back to Service', 'back_srv_list')]
      ])
    };
  }

  const sampleMeta = pool[0];
  const countryLabel = sampleMeta.countryLabel || resolveCountryInfo(countryKey).label;
  const flag = sampleMeta.flag || resolveCountryInfo(countryLabel).flag;

  let offset =
    typeof existingSess.offset === 'number' &&
    existingSess.service === service &&
    existingSess.countryKey === countryKey
      ? existingSess.offset
      : 0;

  if (options.advanceBatch) {
    offset = (offset + 3) % pool.length;
  } else if (!options.keepCurrentBatch) {
    offset = 0;
  }

  let picked = options.keepCurrentBatch && Array.isArray(existingSess.batchEntries) && existingSess.batchEntries.length
    ? existingSess.batchEntries
    : [];

  if (!picked.length || options.advanceBatch || !options.keepCurrentBatch) {
    picked = [];
    for (let i = 0; i < Math.min(3, pool.length); i++) {
      picked.push(pool[(offset + i) % pool.length]);
    }
  }

  const otpLines = [];
  let anyOtpFound = false;

  for (const item of picked) {
    const savedOtp = await getSavedOtp(item.phone);
    if (savedOtp) {
      anyOtpFound = true;
      otpLines.push(`✅ \`${item.phone}\` → 🔑 *${savedOtp}*`);
    }
  }

  state.userSession.set(userId, {
    service,
    countryKey,
    countryLabel,
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
  for (const item of picked) {
    const shownNum = formatDisplayPhone(item.phone, stripCC, item.dial);
    keyboardRows.push([
      Markup.button.callback(
        `${flag} 📋 ${shownNum}`,
        `copy_num_${encodeURIComponent(item.phone)}`
      )
    ]);
  }

  keyboardRows.push([
    Markup.button.callback(
      autoChecker ? '🟢 Auto Checker On' : '🔴 Auto Checker Off',
      'toggle_auto_checker'
    ),
    Markup.button.callback(
      stripCC ? '➕ Restore CC' : '✖ Remove CC',
      'toggle_remove_cc'
    )
  ]);

  keyboardRows.push([
    Markup.button.callback(
      '🔄 Change Number',
      `chg_num_${encodeURIComponent(service)}__${encodeURIComponent(countryKey)}`
    )
  ]);

  keyboardRows.push([
    Markup.button.callback(
      '🌐 Change Country',
      `chg_cnt_${encodeURIComponent(service)}`
    )
  ]);

  if (state.otpGroupLink && /^https?:\/\//i.test(state.otpGroupLink)) {
    keyboardRows.push([Markup.button.url('📂 Otp Group', state.otpGroupLink)]);
  } else {
    keyboardRows.push([Markup.button.callback('📂 Otp Group', 'open_otp_group_fallback')]);
  }

  return {
    text,
    keyboard: Markup.inlineKeyboard(keyboardRows)
  };
}

bot.action(/^pick_cnt_(.+)__(.+)$/, async (ctx) => {
  const service = decodeURIComponent(ctx.match[1]);
  const countryKey = decodeURIComponent(ctx.match[2]);
  await ctx.answerCbQuery();

  const { text, keyboard } = await buildAssignedCard(ctx.from.id, service, countryKey, {
    keepCurrentBatch: false,
    advanceBatch: false
  });
  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action(/^copy_num_(.+)$/, async (ctx) => {
  const phone = decodeURIComponent(ctx.match[1]);
  await ctx.answerCbQuery(`নম্বর: ${phone}`, { show_alert: false });
  await ctx.reply(`📋 নম্বর: \`${phone}\``, { parse_mode: 'Markdown' });
});

bot.action('toggle_auto_checker', async (ctx) => {
  const sess = state.userSession.get(ctx.from.id);
  if (!sess) return ctx.answerCbQuery('কোনো সক্রিয় নম্বর নেই।');
  const nextAuto = !sess.autoChecker;
  await ctx.answerCbQuery(nextAuto ? 'Auto Checker On' : 'Auto Checker Off');
  const { text, keyboard } = await buildAssignedCard(
    ctx.from.id,
    sess.service,
    sess.countryKey,
    { keepCurrentBatch: true, autoChecker: nextAuto }
  );
  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  } catch (_) {}
});

bot.action('toggle_remove_cc', async (ctx) => {
  const sess = state.userSession.get(ctx.from.id);
  if (!sess) return ctx.answerCbQuery('কোনো সক্রিয় নম্বর নেই।');
  const nextStrip = !sess.stripCC;
  await ctx.answerCbQuery(nextStrip ? 'CC Remove করা হয়েছে' : 'CC যুক্ত করা হয়েছে');
  const { text, keyboard } = await buildAssignedCard(
    ctx.from.id,
    sess.service,
    sess.countryKey,
    { keepCurrentBatch: true, stripCC: nextStrip }
  );
  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  } catch (_) {}
});

bot.action(/^chg_num_(.+)__(.+)$/, async (ctx) => {
  const service = decodeURIComponent(ctx.match[1]);
  const countryKey = decodeURIComponent(ctx.match[2]);
  await ctx.answerCbQuery('নতুন নম্বর পরিবর্তন করা হচ্ছে...');

  const { text, keyboard } = await buildAssignedCard(ctx.from.id, service, countryKey, {
    keepCurrentBatch: false,
    advanceBatch: true
  });
  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  } catch (_) {
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  }
});

bot.action(/^chg_cnt_(.+)$/, async (ctx) => {
  const service = decodeURIComponent(ctx.match[1]);
  await ctx.answerCbQuery();
  await showCountrySelection(ctx, service, true);
});

bot.action('open_otp_group_fallback', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    state.otpGroupLink
      ? `📂 OTP Group Link: ${state.otpGroupLink}`
      : '📂 OTP Group Link এখনো সেট করা হয়নি।'
  );
});

// অন্যান্য বাটন
bot.hears('👛 WALLET', async (ctx) => {
  await registerUser(ctx.from.id);
  return ctx.reply('👛 আপনার ওয়ালেট ব্যালেন্স তথ্য এখানে দেখা যাবে।');
});
bot.hears('📡 TRAFFIC', async (ctx) => {
  await registerUser(ctx.from.id);
  return ctx.reply(
    `📡 মোড: *${providerMode.toUpperCase()}* | Socket: ${socketConnected ? '🟢 Connected' : '🔴 Disconnected'} | Saved Stock: \`${state.numberEntries.length}\``,
    { parse_mode: 'Markdown' }
  );
});
bot.hears('✅ WA CHECKER', async (ctx) => {
  await registerUser(ctx.from.id);
  return ctx.reply('✅ WhatsApp Checker সার্ভিস প্রস্তুত।');
});
bot.hears('🌐 LANGUAGE', async (ctx) => {
  await registerUser(ctx.from.id);
  return ctx.reply('🌐 বর্তমান ভাষা: বাংলা (BN)');
});

// ধাপ ৩-এ .TXT / Number File গ্রহণ
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
    await ctx.reply('❌ ফাইলটি পড়তে সমস্যা হয়েছে। অনুগ্রহ করে .txt ফাইল পাঠান।');
  }
});

// টেক্সট হ্যান্ডলার: অ্যাডমিন উইজার্ড / কনফিগ অথবা সাপোর্ট মেসেজ
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
      await ctx.reply(
        '2️⃣ দেশের নাম লিখুন (যেমন: `Afghanistan`, `Egypt`, `Bangladesh`, `Pakistan` ইত্যাদি):',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (current.step === 'ask_country') {
      current.draft.country = inputText;
      current.step = 'ask_numbers';
      state.adminWizard.set(userId, current);
      await ctx.reply(
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
      await ctx.reply('✅ Main Group Link সেট হয়েছে।');
      return;
    }

    if (current.step === 'set_main_id') {
      state.mainGroupId = inputText;
      await dbPut('config/mainGroupId', inputText);
      await ctx.reply('✅ Main Group ID সেট হয়েছে।');
      return;
    }

    if (current.step === 'set_otp_link') {
      state.otpGroupLink = inputText;
      await dbPut('config/otpGroupLink', inputText);
      await ctx.reply('✅ OTP Group Link সেট হয়েছে।');
      return;
    }

    if (current.step === 'set_otp_id') {
      state.otpGroupId = inputText;
      await dbPut('config/otpGroupId', inputText);
      await ctx.reply('✅ OTP Group ID সেট হয়েছে।');
      return;
    }

    if (current.step === 'set_socket_url') {
      const { origin, path } = parseSocketInput(inputText);
      state.socketUrl = origin;
      state.socketPath = path;
      await dbPut('config/socketUrl', origin);
      await dbPut('config/socketPath', path);
      initSocket();
      await ctx.reply(`✅ Socket URL সেট হয়েছে:\n\`${origin}${path}\``, {
        parse_mode: 'Markdown'
      });
      return;
    }

    if (current.step === 'set_socket_cookie') {
      const val = inputText.toLowerCase() === 'clear' ? '' : inputText;
      state.socketCookie = val;
      await dbPut('config/socketCookie', val);
      initSocket();
      await ctx.reply(val ? '✅ Socket Cookie সেট হয়েছে।' : '✅ Socket Cookie মুছে ফেলা হয়েছে।');
      return;
    }

    if (current.step === 'set_api_url') {
      state.apiUrl = inputText;
      await dbPut('config/apiUrl', inputText);
      await ctx.reply(`✅ API URL সেট হয়েছে:\n\`${inputText}\``, {
        parse_mode: 'Markdown'
      });
      return;
    }

    if (current.step === 'set_api_key') {
      state.apiKey = inputText;
      await dbPut('config/apiKey', inputText);
      await ctx.reply('✅ API Key সেট হয়েছে।');
      return;
    }
  }

  // সাপোর্ট মেসেজ (8771921458)
  if (!state.waitingSupportFrom.has(userId)) return;
  state.waitingSupportFrom.delete(userId);

  const username = ctx.from.username ? `@${ctx.from.username}` : 'N/A';
  const fullName =
    [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'User';

  try {
    await bot.telegram.sendMessage(
      SUPPORT_TARGET_ID,
      `📩 *নতুন সাপোর্ট মেসেজ*\n👤 নাম: ${fullName}\n🆔 আইডি: \`${userId}\`\n🔗 ইউজারনেম: ${username}\n\n💬 মেসেজ:\n${ctx.message.text}`,
      { parse_mode: 'Markdown' }
    );
    await ctx.reply('✅ আপনার মেসেজটি সাপোর্টে পাঠানো হয়েছে। শীঘ্রই উত্তর পাবেন।');
  } catch (err) {
    console.error('Support forward error:', err.message);
    await ctx.reply('❌ সাপোর্টে মেসেজ পাঠাতে সমস্যা হয়েছে।');
  }
});

// Keep-Alive Server
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
      savedMode,
      savedSocketUrl,
      savedSocketPath,
      savedCookie,
      savedApiUrl,
      savedApiKey,
      savedMainLink,
      savedMainId,
      savedOtpLink,
      savedOtpId,
      savedJoinCheck,
      savedEntries,
      savedUsers
    ] = await Promise.all([
      dbGet('config/providerMode'),
      dbGet('config/socketUrl'),
      dbGet('config/socketPath'),
      dbGet('config/socketCookie'),
      dbGet('config/apiUrl'),
      dbGet('config/apiKey'),
      dbGet('config/mainGroupLink'),
      dbGet('config/mainGroupId'),
      dbGet('config/otpGroupLink'),
      dbGet('config/otpGroupId'),
      dbGet('config/joinCheck'),
      dbGet('pool/entries'),
      dbGet('users/list')
    ]);

    if (savedMode && ['socket', 'api', 'auto', 'off'].includes(savedMode)) {
      providerMode = savedMode;
    }
    if (savedSocketUrl) state.socketUrl = savedSocketUrl;
    if (savedSocketPath) state.socketPath = savedSocketPath;
    if (savedCookie) state.socketCookie = savedCookie;
    if (savedApiUrl) state.apiUrl = savedApiUrl;
    if (savedApiKey) state.apiKey = savedApiKey;
    if (savedMainLink) state.mainGroupLink = savedMainLink;
    if (savedMainId) state.mainGroupId = savedMainId;
    if (savedOtpLink) state.otpGroupLink = savedOtpLink;
    if (savedOtpId) state.otpGroupId = savedOtpId;
    if (typeof savedJoinCheck === 'boolean') state.joinCheck = savedJoinCheck;
    if (Array.isArray(savedEntries)) state.numberEntries = savedEntries;
    if (Array.isArray(savedUsers)) state.users = savedUsers;
  }

  initSocket();
  await bot.launch();
  console.log('Bot @number_24_bot with Admin Panel is running...');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
