const { Telegraf } = require('telegraf');
const axios = require('axios');
const http = require('http');

const BOT_TOKEN = process.env.BOT_TOKEN;
const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || '').replace(/\/+$/, '');
const PORT = process.env.PORT || 10000;
const SELF_URL = process.env.RENDER_EXTERNAL_URL || '';

const ADMIN_IDS = [8771921458];
const SUPPORT_TARGET_ID = 8771921458;

const ENDPOINTS = {
  getNumber: 'https://nxv-sms.vercel.app/get-number',
  getOtp: 'https://nxv-sms.vercel.app/get-otp',
  activeRange: 'https://nxv-sms.vercel.app/active-rangre'
};

const DEFAULT_API_KEY = process.env.API_KEY || 'nxv_live_mwr98oy3_ypnnxbi7zjowac7m';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN missing');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const COUNTRY_META = [
  { name: 'Afghanistan', iso: 'AF', dial: '93', flag: '🇦🇫' },
  { name: 'Bangladesh', iso: 'BD', dial: '880', flag: '🇧🇩' },
  { name: 'Egypt', iso: 'EG', dial: '20', flag: '🇪🇬' },
  { name: 'India', iso: 'IN', dial: '91', flag: '🇮🇳' },
  { name: 'Indonesia', iso: 'ID', dial: '62', flag: '🇮🇩' },
  { name: 'Malaysia', iso: 'MY', dial: '60', flag: '🇲🇾' },
  { name: 'Nigeria', iso: 'NG', dial: '234', flag: '🇳🇬' },
  { name: 'Pakistan', iso: 'PK', dial: '92', flag: '🇵🇰' },
  { name: 'Russia', iso: 'RU', dial: '7', flag: '🇷🇺' },
  { name: 'Togo', iso: 'TG', dial: '228', flag: '🇹🇬' },
  { name: 'United Kingdom', iso: 'GB', dial: '44', flag: '🇬🇧' },
  { name: 'United States', iso: 'US', dial: '1', flag: '🇺🇸' }
];

const state = {
  apiEnabled: true,
  apiKey: DEFAULT_API_KEY,
  otpGroupLink: process.env.OTP_GROUP_LINK || 'https://t.me/your_otp_group_link',
  otpReward: 0,
  minWithdraw: 50,
  users: [],
  balances: {},
  otpStats: { total: 0, byCountry: {} },
  userSession: new Map(),
  lastBotBoardMsg: new Map(),
  waitingSupportFrom: new Set(),
  adminWizard: new Map(),
  cachedRanges: null
};

function getApiKey() {
  return String(state.apiKey || DEFAULT_API_KEY || '').trim();
}

function isApiReady() {
  return Boolean(state.apiEnabled && getApiKey());
}

function buildUrlWithKey(baseEndpoint, extraParams = {}) {
  const url = new URL(baseEndpoint);
  const params = {
    api_key: getApiKey(),
    ...extraParams
  };
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      url.searchParams.set(k, String(v).trim());
    }
  });
  return url.toString();
}

async function callEndpoint(baseEndpoint, extraParams = {}, timeout = 10000) {
  const fullUrl = buildUrlWithKey(baseEndpoint, extraParams);
  return axios.get(fullUrl, {
    timeout,
    headers: {
      'x-api-key': getApiKey()
    }
  });
}

function resolveCountry(rawCountryOrPhone) {
  const str = String(rawCountryOrPhone || '').trim();
  const lower = str.toLowerCase();

  const byName = COUNTRY_META.find(
    (c) => lower.includes(c.name.toLowerCase()) || lower === c.iso.toLowerCase()
  );
  if (byName) {
    return {
      key: byName.name.toLowerCase(),
      name: byName.name,
      label: `${byName.flag} ${byName.name} (${byName.iso})`,
      flag: byName.flag,
      dial: byName.dial
    };
  }

  const digits = str.replace(/[^\d]/g, '');
  const sortedByDial = [...COUNTRY_META].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sortedByDial) {
    if (digits.startsWith(c.dial)) {
      return {
        key: c.name.toLowerCase(),
        name: c.name,
        label: `${c.flag} ${c.name} (${c.iso})`,
        flag: c.flag,
        dial: c.dial
      };
    }
  }

  return {
    key: lower || 'unknown',
    name: str || 'Unknown',
    label: `🌍 ${str || 'Unknown'}`,
    flag: '🌍',
    dial: ''
  };
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  return digits.length >= 6 && digits.length <= 15 ? `+${digits}` : null;
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
    [{ text: '🟢 GET NUMBER' }],
    [{ text: '🟣 WALLET' }, { text: '🔵 TRAFFIC' }],
    [{ text: '🩷 SUPPORT' }]
  ];
  if (isAdmin) rows.push([{ text: '💠 ADMIN PANEL' }]);
  return { keyboard: rows, resize_keyboard: true };
}

async function fetchActiveRanges() {
  if (!isApiReady()) return [];
  if (state.cachedRanges && Date.now() - state.cachedRanges.ts < 30000) {
    return state.cachedRanges.items;
  }

  try {
    const res = await callEndpoint(ENDPOINTS.activeRange, {}, 8000);
    console.log('[ACTIVE-RANGE RESP]:', JSON.stringify(res.data));
    const list = Array.isArray(res.data)
      ? res.data
      : Array.isArray(res.data?.ranges)
        ? res.data.ranges
        : Array.isArray(res.data?.data)
          ? res.data.data
          : [];
    if (list.length) {
      state.cachedRanges = { items: list, ts: Date.now() };
      return list;
    }
  } catch (err) {
    console.error('[ACTIVE-RANGE ERR]:', err.response?.data || err.message);
  }
  return [];
}

async function requestNumberFromPanel(service = 'Telegram', country = '') {
  if (!isApiReady()) return null;
  const params = {
    service: service || 'Telegram'
  };
  if (country && country !== 'auto') {
    params.country = country;
  }

  const res = await callEndpoint(ENDPOINTS.getNumber, params, 10000);
  console.log('[GET-NUMBER RESP]:', JSON.stringify(res.data));

  const data = res.data || {};
  if (data.success === false) return null;

  const phone = normalizePhone(
    data.phoneNumber || data.number || data.phone || data.data?.phoneNumber || data.data?.number || ''
  );
  if (!phone) return null;

  const countryInfo = data.country
    ? resolveCountry(data.country)
    : resolveCountry(phone);

  return {
    phone,
    orderId: data.orderId || data.order_id || data.data?.orderId || data.data?.order_id || null,
    countryKey: countryInfo.key,
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

  const res = await callEndpoint(ENDPOINTS.getOtp, params, 10000);
  console.log('[GET-OTP RESP]:', JSON.stringify(res.data));

  const d = res.data || {};
  if (String(d.status || '').toUpperCase() === 'RECEIVED' && d.otp) {
    return String(d.otp).trim();
  }
  if (d.otp && !/WAITING|PENDING|NO_SMS/i.test(String(d.otp))) {
    const match = String(d.otp).match(/\b\d{4,8}\b/);
    return match ? match[0] : null;
  }
  return null;
}

async function recordTraffic(phone) {
  const c = resolveCountry(phone);
  const cur = state.otpStats.byCountry[c.key] || { label: c.label, count: 0 };
  cur.count = Number(cur.count || 0) + 1;
  state.otpStats.byCountry[c.key] = cur;
  state.otpStats.total = Number(state.otpStats.total || 0) + 1;
  await dbPut('stats/otps', state.otpStats);
}

function buildNumberCard(item, stripCC = false, otp = null) {
  const digits = String(item.phone || '').replace(/[^\d]/g, '');
  const shownPhone =
    stripCC && item.dial && digits.startsWith(item.dial)
      ? digits.slice(item.dial.length)
      : `+${digits}`;

  const text =
    `${item.flag} *${item.service} Number Assigned:*\n` +
    `🌍 Country: *${item.countryLabel}*\n` +
    (otp ? `✅ *OTP Received:* \`${otp}\`` : `⏳ *Waiting for OTP....*`);

  const rows = [
    [
      {
        text: `🟢 ${item.flag} 📋 ${shownPhone}`,
        type: 'copy_text',
        copy_text: { text: shownPhone }
      }
    ],
    [
      {
        text: '🔄 Change Number',
        callback_data: `chg_num_${encodeURIComponent(item.service)}__${encodeURIComponent(item.countryKey || 'auto')}`
      },
      {
        text: stripCC ? '🟢 Restore CC' : '🔴 Remove CC',
        callback_data: 'toggle_cc'
      }
    ]
  ];

  if (state.otpGroupLink && /^https?:\/\//i.test(state.otpGroupLink)) {
    rows.push([{ text: '🟡 Otp Group', url: state.otpGroupLink }]);
  }

  return { text, reply_markup: { inline_keyboard: rows } };
}

setInterval(async () => {
  for (const [uid, sess] of state.userSession.entries()) {
    if (!sess || !sess.item || sess.otpDelivered) continue;
    try {
      const otp = await requestOtpFromPanel(sess.item.orderId, sess.item.phone);
      if (otp) {
        sess.otpDelivered = true;
        state.userSession.set(uid, sess);
        await recordTraffic(sess.item.phone);

        let rewardMsg = '';
        if (Number(state.otpReward) > 0) {
          const curBal = Number(state.balances[String(uid)] || 0);
          const nextBal = Number((curBal + Number(state.otpReward)).toFixed(2));
          state.balances[String(uid)] = nextBal;
          await dbPut(`balances/${uid}`, nextBal);
          rewardMsg = `\n💰 Reward: +${state.otpReward} (Balance: \`${nextBal}\`)`;
        }

        await rawSendMessage(
          uid,
          `✅ *OTP Received!*\n\n` +
            `📱 Service: *${sess.item.service}*\n` +
            `📞 Number: \`${sess.item.phone}\`\n` +
            `🔑 OTP: \`${otp}\`${rewardMsg}`
        );
      }
    } catch (err) {
      console.error('[GET-OTP ERR]:', err.response?.data || err.message);
    }
  }
}, 4000);

bot.start(async (ctx) => {
  await registerUser(ctx.from.id);
  const isAdmin = ADMIN_IDS.includes(ctx.from.id);
  await sendCleanBoard(ctx, 'স্বাগতম! নিচের মেনু থেকে অপশন বেছে নিন:', getMainKeyboard(isAdmin));
});

bot.hears('🟢 GET NUMBER', async (ctx) => {
  await registerUser(ctx.from.id);
  const ranges = await fetchActiveRanges();
  const services = [
    ...new Set(
      ranges
        .map((r) => (typeof r === 'object' ? r.service || r.service_name : ''))
        .filter(Boolean)
    )
  ];
  const serviceList = services.length ? services : ['Telegram', 'WhatsApp'];

  const rows = [];
  for (let i = 0; i < serviceList.length; i += 2) {
    const row = [
      { text: `🟢 ${serviceList[i].toUpperCase()}`, callback_data: `pick_srv_${encodeURIComponent(serviceList[i])}` }
    ];
    if (serviceList[i + 1]) {
      row.push({
        text: `🔵 ${serviceList[i + 1].toUpperCase()}`,
        callback_data: `pick_srv_${encodeURIComponent(serviceList[i + 1])}`
      });
    }
    rows.push(row);
  }

  await sendCleanBoard(ctx, '🟡 *Select a Service*', { inline_keyboard: rows });
});

bot.action(/^pick_srv_(.+)$/, async (ctx) => {
  const service = decodeURIComponent(ctx.match[1]);
  await ctx.answerCbQuery();

  const ranges = await fetchActiveRanges();
  const countries = [
    ...new Set(
      ranges
        .filter((r) => {
          const srv = typeof r === 'object' ? (r.service || r.service_name || '') : '';
          return !srv || srv.toLowerCase() === service.toLowerCase();
        })
        .map((r) => (typeof r === 'string' ? r : r.country || r.country_name || r.name || ''))
        .filter(Boolean)
    )
  ];

  const rows = [
    [{ text: '🌍 Auto Range', callback_data: `get_num_${encodeURIComponent(service)}__auto` }]
  ];

  for (let i = 0; i < countries.length; i += 2) {
    const c1 = resolveCountry(countries[i]);
    const row = [
      { text: c1.label, callback_data: `get_num_${encodeURIComponent(service)}__${encodeURIComponent(c1.name)}` }
    ];
    if (countries[i + 1]) {
      const c2 = resolveCountry(countries[i + 1]);
      row.push({
        text: c2.label,
        callback_data: `get_num_${encodeURIComponent(service)}__${encodeURIComponent(c2.name)}`
      });
    }
    rows.push(row);
  }

  await sendCleanBoard(ctx, `📱 *${service} — Select Country / Range:*`, { inline_keyboard: rows }, true);
});

async function handleNumberRequest(ctx, service, country) {
  await ctx.answerCbQuery('নম্বর নেওয়া হচ্ছে...');
  try {
    const item = await requestNumberFromPanel(service, country);
    if (!item) {
      return sendCleanBoard(ctx, `⚠️ *${service}* এর জন্য নম্বর পাওয়া যায়নি।`, null, true);
    }
    state.userSession.set(ctx.from.id, {
      item,
      stripCC: false,
      otpDelivered: false
    });
    const card = buildNumberCard(item, false, null);
    await sendCleanBoard(ctx, card.text, card.reply_markup, true);
  } catch (err) {
    console.error('[GET-NUMBER ERR]:', err.response?.data || err.message);
    await sendCleanBoard(ctx, '❌ নম্বর আনতে সমস্যা হয়েছে।', null, true);
  }
}

bot.action(/^get_num_(.+)__(.+)$/, async (ctx) => {
  await handleNumberRequest(ctx, decodeURIComponent(ctx.match[1]), decodeURIComponent(ctx.match[2]));
});

bot.action(/^chg_num_(.+)__(.+)$/, async (ctx) => {
  await handleNumberRequest(ctx, decodeURIComponent(ctx.match[1]), decodeURIComponent(ctx.match[2]));
});

bot.action('toggle_cc', async (ctx) => {
  const sess = state.userSession.get(ctx.from.id);
  if (!sess?.item) return ctx.answerCbQuery('কোনো সক্রিয় নম্বর নেই।');
  sess.stripCC = !sess.stripCC;
  state.userSession.set(ctx.from.id, sess);
  await ctx.answerCbQuery(sess.stripCC ? 'CC Removed' : 'CC Restored');
  const card = buildNumberCard(sess.item, sess.stripCC, null);
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

bot.hears('🩷 SUPPORT', async (ctx) => {
  await registerUser(ctx.from.id);
  state.waitingSupportFrom.add(ctx.from.id);
  await sendCleanBoard(ctx, '🩷 আপনার মেসেজটি লিখুন:');
});

bot.hears('💠 ADMIN PANEL', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const markup = {
    inline_keyboard: [
      [
        { text: '🟣 Set API KEY', callback_data: 'set_key' },
        { text: state.apiEnabled ? '🟢 API ON' : '🔴 API OFF', callback_data: 'tgl_api' }
      ],
      [{ text: '📣 Broadcast', callback_data: 'set_bcast' }]
    ]
  };
  await sendCleanBoard(
    ctx,
    `💠 *ADMIN PANEL*\n\n• Users: \`${state.users.length}\`\n• API Status: *${state.apiEnabled ? '🟢 ON' : '🔴 OFF'}*`,
    markup
  );
});

bot.action('tgl_api', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.apiEnabled = !state.apiEnabled;
  state.cachedRanges = null;
  await dbPut('config/apiUrlEnabled', state.apiEnabled);
  await ctx.answerCbQuery(state.apiEnabled ? 'API ON' : 'API OFF');
  await sendCleanBoard(ctx, `✅ API এখন *${state.apiEnabled ? '🟢 ON' : '🔴 OFF'}*`, null, true);
});

bot.action('set_key', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, 'key');
  await ctx.answerCbQuery();
  await sendCleanBoard(ctx, 'নতুন API KEY পাঠান:');
});

bot.action('set_bcast', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, 'bcast');
  await ctx.answerCbQuery();
  await sendCleanBoard(ctx, 'সব ইউজারকে পাঠানোর মেসেজ লিখুন:');
});

bot.on('text', async (ctx) => {
  const uid = ctx.from.id;
  await registerUser(uid);
  const txt = ctx.message.text.trim();

  if (ADMIN_IDS.includes(uid) && state.adminWizard.has(uid)) {
    const mode = state.adminWizard.get(uid);
    state.adminWizard.delete(uid);

    if (mode === 'key') {
      state.apiKey = txt;
      state.cachedRanges = null;
      await dbPut('config/apiKey', txt);
      return rawSendMessage(ctx.chat.id, '✅ API KEY সেট হয়েছে।');
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
    const [u, b, st, key, en] = await Promise.all([
      dbGet('users/list'),
      dbGet('balances'),
      dbGet('stats/otps'),
      dbGet('config/apiKey'),
      dbGet('config/apiUrlEnabled')
    ]);
    if (Array.isArray(u)) state.users = u;
    if (b && typeof b === 'object') state.balances = b;
    if (st && typeof st === 'object') {
      state.otpStats = { total: Number(st.total || 0), byCountry: st.byCountry || {} };
    }
    if (key) state.apiKey = key;
    if (typeof en === 'boolean') state.apiEnabled = en;
  }
  await bot.launch();
  console.log('Bot running with exact NXV endpoints...');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
