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
  waitingSupportFrom: new Set(),
  // adminId -> 'set_socket_url' | 'set_api_url' | 'set_api_key' | 'set_socket_cookie'
  adminInputStep: new Map(),
  otpsByPhone: {},
  userLastNumber: {}
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
  // wss://www.ivasms.com/live/socket.io/?EIO=4&transport=websocket বা https://www.ivasms.com
  const normalized = trimmed.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
  try {
    const parsed = new URL(normalized);
    const origin = parsed.origin;
    const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '/live/socket.io/';
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

// নিচের বাটন পেট (Reply Keyboard)
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

// অ্যাডমিন প্যানেল: আলাদা ON/OFF বাটন + Socket URL / API URL / API Key সেট করার বাটন
function getAdminPanelPayload() {
  const socketOn = providerMode === 'socket' || providerMode === 'auto';
  const apiOn = providerMode === 'api' || providerMode === 'auto';

  const text =
    `💠 *ADMIN PANEL*\n\n` +
    `• বর্তমান মোড: *${providerMode.toUpperCase()}*\n` +
    `• Socket: *${socketOn ? '🟢 ON' : '🔴 OFF'}* (${socketConnected ? 'Connected' : 'Disconnected'})\n` +
    `• API: *${apiOn ? '🟢 ON' : '🔴 OFF'}*\n\n` +
    `• *Socket URL:* \`${state.socketUrl}${state.socketPath}\`\n` +
    `• *API URL:* \`${state.apiUrl || 'Not set'}\`\n` +
    `• *API Key:* \`${maskSecret(state.apiKey)}\``;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        providerMode === 'socket' ? '🔴 Socket OFF' : '🟢 Socket ON',
        providerMode === 'socket' ? 'mode_off' : 'mode_socket'
      ),
      Markup.button.callback(
        providerMode === 'api' ? '🔴 API OFF' : '🟢 API ON',
        providerMode === 'api' ? 'mode_off' : 'mode_api'
      )
    ],
    [
      Markup.button.callback(
        providerMode === 'auto' ? '🔄 Auto (ACTIVE)' : '🔄 Auto ON',
        'mode_auto'
      ),
      Markup.button.callback('⛔ All OFF', 'mode_off')
    ],
    [
      Markup.button.callback('🔌 Set Socket URL', 'cfg_socket_url'),
      Markup.button.callback('🌐 Set API URL', 'cfg_api_url')
    ],
    [
      Markup.button.callback('🔑 Set API Key', 'cfg_api_key'),
      Markup.button.callback('🍪 Set Cookie', 'cfg_socket_cookie')
    ]
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
  await ctx.reply(
    'স্বাগতম! নিচের মেনু থেকে অপশন বেছে নিন:',
    getMainReplyKeyboard(isAdmin)
  );
});

// অ্যাডমিন প্যানেল
bot.hears('💠 ADMIN PANEL', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const { text, keyboard } = getAdminPanelPayload();
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

async function refreshAdminMessage(ctx, toastText) {
  const { text, keyboard } = getAdminPanelPayload();
  if (toastText) await ctx.answerCbQuery(toastText);
  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  } catch (_) {
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  }
}

async function handleModeCallback(ctx, nextMode, label) {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.answerCbQuery('শুধুমাত্র অ্যাডমিন ব্যবহার করতে পারবেন।', { show_alert: true });
  }
  await setProviderMode(nextMode);
  await refreshAdminMessage(ctx, label);
}

bot.action('mode_socket', (ctx) => handleModeCallback(ctx, 'socket', 'Socket মোড ON হয়েছে'));
bot.action('mode_api', (ctx) => handleModeCallback(ctx, 'api', 'API মোড ON হয়েছে'));
bot.action('mode_auto', (ctx) => handleModeCallback(ctx, 'auto', 'Auto মোড ON হয়েছে'));
bot.action('mode_off', (ctx) => handleModeCallback(ctx, 'off', 'সব মোড OFF করা হয়েছে'));

// Socket URL / API URL / API Key সেট করার প্রম্পট
function startConfigPrompt(stepKey, promptMsg) {
  return async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) {
      return ctx.answerCbQuery('শুধুমাত্র অ্যাডমিন ব্যবহার করতে পারবেন।', { show_alert: true });
    }
    state.adminInputStep.set(ctx.from.id, stepKey);
    await ctx.answerCbQuery();
    await ctx.reply(promptMsg, { parse_mode: 'Markdown' });
  };
}

bot.action(
  'cfg_socket_url',
  startConfigPrompt(
    'set_socket_url',
    '🔌 নতুন *Socket URL* পাঠান (যেমন: `wss://www.ivasms.com/live/socket.io/`):'
  )
);

bot.action(
  'cfg_api_url',
  startConfigPrompt(
    'set_api_url',
    '🌐 নতুন *API URL* পাঠান (যেমন: `https://example.com/api.php`):'
  )
);

bot.action(
  'cfg_api_key',
  startConfigPrompt('set_api_key', '🔑 নতুন *API Key* পাঠান:')
);

bot.action(
  'cfg_socket_cookie',
  startConfigPrompt('set_socket_cookie', '🍪 নতুন *Socket Cookie* পাঠান (বা `clear` লিখুন):')
);

// সাপোর্ট মেসেজ
bot.hears('🆘 SUPPORT', async (ctx) => {
  state.waitingSupportFrom.add(ctx.from.id);
  await ctx.reply('🆘 আপনার মেসেজটি লিখুন। সরাসরি সাপোর্টে পাঠানো হবে।');
});

// GET NUMBER
bot.hears('📞 GET NUMBER', async (ctx) => {
  if (providerMode === 'off') {
    return ctx.reply('⚠️ বর্তমানে নম্বর সার্ভিস OFF আছে।');
  }
  await ctx.reply('⏳ নম্বর খোঁজা হচ্ছে...');
  try {
    let number = null;
    if (providerMode === 'api' || providerMode === 'auto') {
      number = await fetchNumberViaApi();
    }
    if (!number) {
      return ctx.reply('⚠️ এখন কোনো নম্বর পাওয়া যায়নি। পরে আবার চেষ্টা করুন।');
    }

    state.userLastNumber[ctx.from.id] = number;
    await ctx.reply(
      `📞 নম্বর: \`${number}\`\n\nOTP আসলে অটোমেটিক পাঠানো হবে।`,
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
    `📡 মোড: *${providerMode.toUpperCase()}* | Socket: ${socketConnected ? '🟢 Connected' : '🔴 Disconnected'}`,
    { parse_mode: 'Markdown' }
  )
);
bot.hears('✅ WA CHECKER', (ctx) => ctx.reply('✅ WhatsApp Checker সার্ভিস প্রস্তুত।'));
bot.hears('🌐 LANGUAGE', (ctx) => ctx.reply('🌐 বর্তমান ভাষা: বাংলা (BN)'));
bot.hears('📄 NUMBER FILE', (ctx) => ctx.reply('📄 Number File অপশন সক্রিয় আছে।'));

// টেক্সট হ্যান্ডলার: অ্যাডমিন কনফিগ সেভ করা অথবা ইউজারের সাপোর্ট মেসেজ ফরওয়ার্ড
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const inputText = ctx.message.text.trim();

  // ১. অ্যাডমিন কনফিগ ইনপুট চেক
  if (ADMIN_IDS.includes(userId) && state.adminInputStep.has(userId)) {
    const step = state.adminInputStep.get(userId);
    state.adminInputStep.delete(userId);

    if (step === 'set_socket_url') {
      const { origin, path } = parseSocketInput(inputText);
      state.socketUrl = origin;
      state.socketPath = path;
      await dbPut('config/socketUrl', origin);
      await dbPut('config/socketPath', path);
      initSocket();
      await ctx.reply(`✅ Socket URL সেট হয়েছে:\n\`${origin}${path}\``, { parse_mode: 'Markdown' });
      return;
    }

    if (step === 'set_api_url') {
      state.apiUrl = inputText;
      await dbPut('config/apiUrl', inputText);
      await ctx.reply(`✅ API URL সেট হয়েছে:\n\`${inputText}\``, { parse_mode: 'Markdown' });
      return;
    }

    if (step === 'set_api_key') {
      state.apiKey = inputText;
      await dbPut('config/apiKey', inputText);
      await ctx.reply('✅ API Key সেট হয়েছে।');
      return;
    }

    if (step === 'set_socket_cookie') {
      const val = inputText.toLowerCase() === 'clear' ? '' : inputText;
      state.socketCookie = val;
      await dbPut('config/socketCookie', val);
      initSocket();
      await ctx.reply(val ? '✅ Socket Cookie সেট হয়েছে।' : '✅ Socket Cookie মুছে ফেলা হয়েছে।');
      return;
    }
  }

  // ২. ইউজারের সাপোর্ট মেসেজ (8771921458)
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
    const savedMode = await dbGet('config/providerMode');
    const savedSocketUrl = await dbGet('config/socketUrl');
    const savedSocketPath = await dbGet('config/socketPath');
    const savedCookie = await dbGet('config/socketCookie');
    const savedApiUrl = await dbGet('config/apiUrl');
    const savedApiKey = await dbGet('config/apiKey');

    if (savedMode && ['socket', 'api', 'auto', 'off'].includes(savedMode)) {
      providerMode = savedMode;
    }
    if (savedSocketUrl) state.socketUrl = savedSocketUrl;
    if (savedSocketPath) state.socketPath = savedSocketPath;
    if (savedCookie) state.socketCookie = savedCookie;
    if (savedApiUrl) state.apiUrl = savedApiUrl;
    if (savedApiKey) state.apiKey = savedApiKey;
  }

  initSocket();
  await bot.launch();
  console.log('Bot @number_24_bot with Admin Panel is running...');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
