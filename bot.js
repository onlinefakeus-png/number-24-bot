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

  // Service + Country + Number এন্ট্রি লিস্ট
  numberEntries: [],
  otpsByPhone: {},
  userLastNumber: {},

  // স্টেট ট্র্যাকিং
  waitingSupportFrom: new Set(),
  // adminId -> { step: string, draft: object }
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

async function saveOtp(phone, otp) {
  if (!phone || !otp) return;
  const cleanPhone = String(phone).replace(/\s+/g, '');
  state.otpsByPhone[cleanPhone] = { otp: String(otp), updatedAt: Date.now() };
  await dbPut(`otps/${encodeURIComponent(cleanPhone)}`, {
    otp: String(otp),
    updatedAt: Date.now()
  });
}

async function getSavedOtp(phone) {
  const cleanPhone = String(phone).replace(/\s+/g, '');
  if (state.otpsByPhone[cleanPhone]?.otp) {
    return state.otpsByPhone[cleanPhone].otp;
  }
  const remote = await dbGet(`otps/${encodeURIComponent(cleanPhone)}`);
  if (remote?.otp) {
    state.otpsByPhone[cleanPhone] = remote;
    return remote.otp;
  }
  return null;
}

async function addServiceCountryNumbers(service, country, rawNumbers) {
  const phones = String(rawNumbers || '')
    .split(/[\n,]+/)
    .map((n) => n.trim())
    .filter(Boolean);
  if (!phones.length) return 0;

  let added = 0;
  for (const phone of phones) {
    state.numberEntries.push({
      service: service.trim(),
      country: country.trim(),
      phone
    });
    added++;
  }
  await dbPut('pool/entries', state.numberEntries);
  return added;
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
      if (!member || ['left', 'kicked', 'restricted'].includes(member.status)) {
        if (member?.status === 'restricted' && member.is_member === false) {
          return false;
        }
        if (['left', 'kicked'].includes(member?.status)) {
          return false;
        }
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

// মেইন অ্যাডমিন প্যানেল (আলাদা আলাদা সেকশন বাটন)
function getMainAdminPayload() {
  const socketOn = providerMode === 'socket' || providerMode === 'auto';
  const apiOn = providerMode === 'api' || providerMode === 'auto';

  const text =
    `💠 *ADMIN PANEL*\n\n` +
    `• *Stock Numbers:* \`${state.numberEntries.length}\`\n` +
    `• *Mode:* *${providerMode.toUpperCase()}*\n` +
    `• *Socket:* *${socketOn ? '🟢 ON' : '🔴 OFF'}* (${socketConnected ? 'Connected' : 'Disconnected'})\n` +
    `• *API:* *${apiOn ? '🟢 ON' : '🔴 OFF'}*\n` +
    `• *Join Check:* ${state.joinCheck ? '🟢 ON' : '🔴 OFF'}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('➕ Add Number', 'adm_add_number')],
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

// সাব-মেনু ১: API Setup
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

// সাব-মেনু ২: Socket Setup
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

// সাব-মেনু ৩: Group Setup
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
async function fetchNumberViaApi(service = '', country = '') {
  if (!state.apiUrl) return null;
  const res = await axios.get(state.apiUrl, {
    params: { api_key: state.apiKey, service, country },
    timeout: 12000
  });
  const d = res.data || {};
  return d.number || d.phone || d.data?.number || d.data?.phone || null;
}

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

// /start
bot.start(async (ctx) => {
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
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const { text, keyboard } = getMainAdminPayload();
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action('back_admin_main', (ctx) => renderPayload(ctx, getMainAdminPayload));
bot.action('sub_api_menu', (ctx) => renderPayload(ctx, getApiSetupPayload));
bot.action('sub_socket_menu', (ctx) => renderPayload(ctx, getSocketSetupPayload));
bot.action('sub_group_menu', (ctx) => renderPayload(ctx, getGroupSetupPayload));

// Add Number শুরু (ধাপ ১: Service)
bot.action('adm_add_number', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.answerCbQuery('শুধুমাত্র অ্যাডমিন ব্যবহার করতে পারবেন।', { show_alert: true });
  }
  state.adminWizard.set(ctx.from.id, { step: 'ask_service', draft: {} });
  await ctx.answerCbQuery();
  await ctx.reply('1️⃣ সার্ভিসের নাম লিখুন (যেমন: `WhatsApp` অথবা `Telegram` বা আপনার পছন্দমতো):', {
    parse_mode: 'Markdown'
  });
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
bot.action('cfg_socket_cookie', startFieldPrompt('set_socket_cookie', '🍪 নতুন *Socket Cookie* পাঠান (বা `clear` লিখুন):'));
bot.action('cfg_api_url', startFieldPrompt('set_api_url', '🌐 নতুন *API URL* পাঠান:'));
bot.action('cfg_api_key', startFieldPrompt('set_api_key', '🔑 নতুন *API Key* পাঠান:'));

// সাপোর্ট মেসেজ
bot.hears('🆘 SUPPORT', async (ctx) => {
  state.waitingSupportFrom.add(ctx.from.id);
  await ctx.reply('🆘 আপনার মেসেজটি লিখুন। সরাসরি সাপোর্টে পাঠানো হবে।');
});

// GET NUMBER
bot.hears('📞 GET NUMBER', async (ctx) => {
  const isAdmin = ADMIN_IDS.includes(ctx.from.id);
  if (!isAdmin && !(await isUserVerifiedInGroups(ctx))) {
    return sendGroupVerifyPrompt(ctx);
  }
  if (providerMode === 'off') {
    return ctx.reply('⚠️ বর্তমানে নম্বর সার্ভিস OFF আছে।');
  }

  await ctx.reply('⏳ নম্বর খোঁজা হচ্ছে...');
  try {
    let entry = null;
    let number = null;

    if (state.numberEntries.length > 0) {
      entry = state.numberEntries.shift();
      number = entry.phone;
      await dbPut('pool/entries', state.numberEntries);
    } else if (providerMode === 'api' || providerMode === 'auto') {
      number = await fetchNumberViaApi();
    }

    if (!number) {
      return ctx.reply('⚠️ এখন কোনো নম্বর পাওয়া যায়নি। পরে আবার চেষ্টা করুন।');
    }

    state.userLastNumber[ctx.from.id] = number;
    const metaInfo = entry
      ? `📱 Service: *${entry.service}*\n🌍 Country: *${entry.country}*\n`
      : '';

    await ctx.reply(
      `${metaInfo}📞 নম্বর: \`${number}\`\n\nOTP আসলে অটোমেটিক পাঠানো হবে।`,
      { parse_mode: 'Markdown' }
    );

    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      let otp = await getSavedOtp(number);
      if (!otp && (providerMode === 'api' || providerMode === 'auto')) {
        otp = await fetchOtpViaApi(number);
        if (otp) await saveOtp(number, otp);
      }
      if (otp) {
        await ctx.reply(
          `✅ Code Received\n📞 Number: \`${number}\`\n🔑 OTP: \`${otp}\``,
          { parse_mode: 'Markdown' }
        );
        return;
      }
    }
  } catch (err) {
    console.error('Get number error:', err.message);
    await ctx.reply('❌ নম্বর আনতে সমস্যা হয়েছে।');
  }
});

// অন্যান্য বাটন
bot.hears('👛 WALLET', (ctx) => ctx.reply('👛 আপনার ওয়ালেট ব্যালেন্স তথ্য এখানে দেখা যাবে।'));
bot.hears('📡 TRAFFIC', (ctx) =>
  ctx.reply(
    `📡 মোড: *${providerMode.toUpperCase()}* | Socket: ${socketConnected ? '🟢 Connected' : '🔴 Disconnected'} | Stock: \`${state.numberEntries.length}\``,
    { parse_mode: 'Markdown' }
  )
);
bot.hears('✅ WA CHECKER', (ctx) => ctx.reply('✅ WhatsApp Checker সার্ভিস প্রস্তুত।'));
bot.hears('🌐 LANGUAGE', (ctx) => ctx.reply('🌐 বর্তমান ভাষা: বাংলা (BN)'));
bot.hears('📄 NUMBER FILE', (ctx) => ctx.reply('📄 Number File অপশন সক্রিয় আছে।'));

// টেক্সট হ্যান্ডলার: অ্যাডমিন উইজার্ড / কনফিগ অথবা সাপোর্ট মেসেজ
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const inputText = ctx.message.text.trim();

  if (ADMIN_IDS.includes(userId) && state.adminWizard.has(userId)) {
    const current = state.adminWizard.get(userId);

    // ধাপ ১: Service -> ধাপ ২: Country -> ধাপ ৩: Numbers
    if (current.step === 'ask_service') {
      current.draft.service = inputText;
      current.step = 'ask_country';
      state.adminWizard.set(userId, current);
      await ctx.reply('2️⃣ দেশের নাম লিখুন (যেমন: `Bangladesh`, `India`, `USA` ইত্যাদি):', {
        parse_mode: 'Markdown'
      });
      return;
    }

    if (current.step === 'ask_country') {
      current.draft.country = inputText;
      current.step = 'ask_numbers';
      state.adminWizard.set(userId, current);
      await ctx.reply('3️⃣ এক বা একাধিক নম্বর পাঠান (প্রতি লাইনে বা কমা দিয়ে আলাদা করে):');
      return;
    }

    if (current.step === 'ask_numbers') {
      state.adminWizard.delete(userId);
      const { service, country } = current.draft;
      const added = await addServiceCountryNumbers(service, country, inputText);
      await ctx.reply(
        `✅ *${added}*টি নম্বর যুক্ত হয়েছে!\n📱 Service: *${service}*\n🌍 Country: *${country}*\n📦 মোট স্টক: \`${state.numberEntries.length}\``,
        { parse_mode: 'Markdown' }
      );
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
      savedEntries
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
      dbGet('pool/entries')
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
  }

  initSocket();
  await bot.launch();
  console.log('Bot @number_24_bot with Admin Panel is running...');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
