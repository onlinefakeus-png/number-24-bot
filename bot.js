const { Telegraf, Markup } = require('telegraf');
const { io } = require('socket.io-client');
const axios = require('axios');
const http = require('http');

const BOT_TOKEN = process.env.BOT_TOKEN;
const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || '').replace(/\/+$/, '');
const PORT = process.env.PORT || 10000;
const SELF_URL = process.env.RENDER_EXTERNAL_URL || '';

// আপনার টেলিগ্রাম অ্যাডমিন/সাপোর্ট ইউজার আইডি
const ADMIN_IDS = [8771921458];
const SUPPORT_TARGET_ID = 8771921458;

// iVASMS Socket.IO URL ও মোড ('auto' | 'socket' | 'api')
const SOCKET_URL = process.env.SOCKET_URL || 'https://www.ivasms.com';
const SOCKET_PATH = process.env.SOCKET_PATH || '/live/socket.io/';
let providerMode = process.env.PROVIDER_MODE || 'auto';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN missing');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ইন-মেমোরি স্টেট (FIREBASE_DB_URL থাকলে সিঙ্ক হবে)
const state = {
  apiUrl: process.env.API_URL || '',
  apiKey: process.env.API_KEY || '',
  socketCookie: process.env.SOCKET_COOKIE || '',
  waitingSupportFrom: new Set(),
  otpsByPhone: {},
  services: {},
  userLastNumber: {}
};

// Firebase Helper
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

// স্ক্রিনশটের রঙ অনুযায়ী বাটন লেআউট (Telegram Bot API style support)
function getMainMenuInline() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📞 GET NUMBER', callback_data: 'menu_get_number', style: 'danger' }],
        [
          { text: '📲 WALLET', callback_data: 'menu_wallet', style: 'success' },
          { text: '📡 TRAFFIC', callback_data: 'menu_traffic', style: 'primary' }
        ],
        [{ text: '🟢 WA CHECKER', callback_data: 'menu_wa_checker', style: 'success' }],
        [
          { text: '🌐 LANGUAGE', callback_data: 'menu_language', style: 'primary' },
          { text: '🆘 SUPPORT', callback_data: 'menu_support', style: 'primary' }
        ],
        [{ text: '📄 NUMBER FILE', callback_data: 'menu_number_file', style: 'danger' }]
      ]
    }
  };
}

function getMainReplyKeyboard(isAdmin) {
  const rows = [
    ['📞 GET NUMBER'],
    ['📲 WALLET', '📡 TRAFFIC'],
    ['🟢 WA CHECKER'],
    ['🌐 LANGUAGE', '🆘 SUPPORT'],
    ['📄 NUMBER FILE']
  ];
  if (isAdmin) rows.push(['💠 ADMIN PANEL']);
  return Markup.keyboard(rows).resize();
}

// HTTP REST API Fallback ফাংশন
async function fetchNumberViaApi(service = '', country = '') {
  if (!state.apiUrl) return null;
  const res = await axios.get(state.apiUrl, {
    params: {
      api_key: state.apiKey,
      service,
      country
    },
    timeout: 12000
  });
  const d = res.data || {};
  return d.number || d.phone || d.data?.number || d.data?.phone || null;
}

async function fetchOtpViaApi(phone) {
  if (!state.apiUrl || !phone) return null;
  const res = await axios.get(state.apiUrl, {
    params: {
      api_key: state.apiKey,
      action: 'getOtp',
      number: phone,
      phone
    },
    timeout: 10000
  });
  const d = res.data || {};
  return d.otp || d.code || d.sms_code || d.data?.otp || d.data?.code || null;
}

// Socket.IO কানেকশন (iVASMS লাইভ ইভেন্টের জন্য)
let socketClient = null;
let socketConnected = false;

function initSocket() {
  if (providerMode === 'api') return;
  if (socketClient) {
    try { socketClient.disconnect(); } catch (_) {}
  }

  const extraHeaders = {};
  if (state.socketCookie) {
    extraHeaders.Cookie = state.socketCookie;
  }

  socketClient = io(SOCKET_URL, {
    path: SOCKET_PATH,
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 3000,
    extraHeaders
  });

  socketClient.on('connect', () => {
    socketConnected = true;
    console.log('Socket.IO connected:', SOCKET_URL);
  });

  socketClient.on('disconnect', (reason) => {
    socketConnected = false;
    console.log('Socket.IO disconnected:', reason);
  });

  socketClient.on('connect_error', (err) => {
    socketConnected = false;
    console.log('Socket.IO error (fallback ready):', err.message);
  });

  // সম্ভাব্য লাইভ SMS/OTP ইভেন্ট লিসেনার
  const handleIncomingSms = async (payload) => {
    if (!payload) return;
    const phone = payload.number || payload.phone || payload.cli || payload.data?.number || payload.data?.phone;
    const rawText = payload.otp || payload.code || payload.sms || payload.message || payload.data?.otp || '';
    const match = String(rawText).match(/\b\d{4,8}\b/);
    const otp = match ? match[0] : String(rawText).trim();
    if (phone && otp) {
      await saveOtp(phone, otp);
    }
  };

  socketClient.onAny(async (eventName, ...args) => {
    const first = args[0];
    if (first && typeof first === 'object') {
      await handleIncomingSms(first);
    }
  });
}

// /start কমান্ড
bot.start(async (ctx) => {
  const isAdmin = ADMIN_IDS.includes(ctx.from.id);
  await ctx.reply(
    'স্বাগতম! নিচের মেনু থেকে অপশন বেছে নিন:',
    getMainReplyKeyboard(isAdmin)
  );
  await ctx.reply('কুইক অ্যাকশন মেনু:', getMainMenuInline());
});

// সাপোর্ট মেসেজ শুরু করার ফাংশন
async function promptSupport(ctx) {
  state.waitingSupportFrom.add(ctx.from.id);
  await ctx.reply('🆘 আপনার মেসেজটি লিখুন। সরাসরি সাপোর্টে (Admin) পাঠিয়ে দেওয়া হবে।');
}

bot.hears('🆘 SUPPORT', promptSupport);
bot.action('menu_support', async (ctx) => {
  await ctx.answerCbQuery();
  await promptSupport(ctx);
});

// GET NUMBER হ্যান্ডলার (Socket + Firebase + API Fallback)
async function handleGetNumber(ctx) {
  await ctx.reply('⏳ নম্বর খোঁজা হচ্ছে...');
  try {
    let number = null;
    if (providerMode === 'api' || providerMode === 'auto' || !socketConnected) {
      number = await fetchNumberViaApi();
    }

    if (!number) {
      return ctx.reply('⚠️ এখন কোনো নম্বর পাওয়া যায়নি। পরে আবার চেষ্টা করুন।');
    }

    state.userLastNumber[ctx.from.id] = number;
    await ctx.reply(`📞 নম্বর: \`${number}\`\n\nOTP আসলে অটোমেটিক পাঠানো হবে।`, {
      parse_mode: 'Markdown'
    });

    // সর্বোচ্চ ৩ মিনিট (৬০ বার * ৩ সেকেন্ড) Socket/Firebase/API থেকে OTP চেক
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      let otp = await getSavedOtp(number);
      if (!otp && (providerMode === 'api' || providerMode === 'auto' || !socketConnected)) {
        otp = await fetchOtpViaApi(number);
        if (otp) await saveOtp(number, otp);
      }
      if (otp) {
        await ctx.reply(`✅ Code Received\n📞 Number: \`${number}\`\n🔑 OTP: \`${otp}\``, {
          parse_mode: 'Markdown'
        });
        return;
      }
    }
  } catch (err) {
    console.error('Get number error:', err.message);
    await ctx.reply('❌ নম্বর আনতে সমস্যা হয়েছে।');
  }
}

bot.hears('📞 GET NUMBER', handleGetNumber);
bot.action('menu_get_number', async (ctx) => {
  await ctx.answerCbQuery();
  await handleGetNumber(ctx);
});

// অন্যান্য বাটনের সাড়া
bot.hears('📲 WALLET', (ctx) => ctx.reply('📲 আপনার ওয়ালেট ব্যালেন্স তথ্য এখানে দেখা যাবে।'));
bot.action('menu_wallet', async (ctx) => { await ctx.answerCbQuery(); return ctx.reply('📲 আপনার ওয়ালেট ব্যালেন্স তথ্য এখানে দেখা যাবে।'); });

bot.hears('📡 TRAFFIC', (ctx) => ctx.reply(`📡 বর্তমান মোড: *${providerMode.toUpperCase()}* | Socket: ${socketConnected ? '🟢 Connected' : '🔴 Disconnected'}`, { parse_mode: 'Markdown' }));
bot.action('menu_traffic', async (ctx) => { await ctx.answerCbQuery(); return ctx.reply(`📡 বর্তমান মোড: *${providerMode.toUpperCase()}* | Socket: ${socketConnected ? '🟢 Connected' : '🔴 Disconnected'}`, { parse_mode: 'Markdown' }); });

bot.hears('🟢 WA CHECKER', (ctx) => ctx.reply('🟢 WhatsApp Checker সার্ভিস প্রস্তুত।'));
bot.action('menu_wa_checker', async (ctx) => { await ctx.answerCbQuery(); return ctx.reply('🟢 WhatsApp Checker সার্ভিস প্রস্তুত।'); });

bot.hears('🌐 LANGUAGE', (ctx) => ctx.reply('🌐 বর্তমান ভাষা: বাংলা (BN)'));
bot.action('menu_language', async (ctx) => { await ctx.answerCbQuery(); return ctx.reply('🌐 বর্তমান ভাষা: বাংলা (BN)'); });

bot.hears('📄 NUMBER FILE', (ctx) => ctx.reply('📄 Number File অপশন সক্রিয় আছে।'));
bot.action('menu_number_file', async (ctx) => { await ctx.answerCbQuery(); return ctx.reply('📄 Number File অপশন সক্রিয় আছে।'); });

// অ্যাডমিন প্যানেল (শুধুমাত্র 8771921458)
bot.hears('💠 ADMIN PANEL', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  await ctx.reply(
    `💠 *ADMIN PANEL*\nMode: \`${providerMode}\`\nSocket: ${socketConnected ? 'Connected' : 'Disconnected'}\n\nমোড বদলাতে কমান্ড দিন:\n/mode socket\n/mode api\n/mode auto`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('mode', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  const nextMode = (parts[1] || '').toLowerCase();
  if (!['auto', 'socket', 'api'].includes(nextMode)) {
    return ctx.reply('ব্যবহার: /mode socket অথবা /mode api অথবা /mode auto');
  }
  providerMode = nextMode;
  initSocket();
  await ctx.reply(`✅ মোড পরিবর্তন হয়ে *${providerMode.toUpperCase()}* সেট হয়েছে।`, { parse_mode: 'Markdown' });
});

// ইউজারের সাপোর্ট মেসেজ সরাসরি 8771921458 আইডিতে ফরওয়ার্ড
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  if (!state.waitingSupportFrom.has(userId)) return;
  state.waitingSupportFrom.delete(userId);

  const username = ctx.from.username ? `@${ctx.from.username}` : 'N/A';
  const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'User';

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

// Keep-Alive HTTP Server (Render sleep প্রতিরোধে)
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
    const savedApiUrl = await dbGet('config/apiUrl');
    const savedApiKey = await dbGet('config/apiKey');
    const savedCookie = await dbGet('config/socketCookie');
    if (savedApiUrl) state.apiUrl = savedApiUrl;
    if (savedApiKey) state.apiKey = savedApiKey;
    if (savedCookie) state.socketCookie = savedCookie;
  }

  initSocket();
  await bot.launch();
  console.log('Bot @number_24_bot with Admin Panel is running...');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
