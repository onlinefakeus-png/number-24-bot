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
  { name: 'Andorra', iso: 'AD', dial: '376', flag: '🇦🇩' },
  { name: 'Angola', iso: 'AO', dial: '244', flag: '🇦🇴' },
  { name: 'Argentina', iso: 'AR', dial: '54', flag: '🇦🇷' },
  { name: 'Armenia', iso: 'AM', dial: '374', flag: '🇦🇲' },
  { name: 'Australia', iso: 'AU', dial: '61', flag: '🇦🇺' },
  { name: 'Austria', iso: 'AT', dial: '43', flag: '🇦🇹' },
  { name: 'Azerbaijan', iso: 'AZ', dial: '994', flag: '🇦🇿' },
  { name: 'Bahrain', iso: 'BH', dial: '973', flag: '🇧🇭' },
  { name: 'Bangladesh', iso: 'BD', dial: '880', flag: '🇧🇩' },
  { name: 'Belarus', iso: 'BY', dial: '375', flag: '🇧🇾' },
  { name: 'Belgium', iso: 'BE', dial: '32', flag: '🇧🇪' },
  { name: 'Belize', iso: 'BZ', dial: '501', flag: '🇧🇿' },
  { name: 'Benin', iso: 'BJ', dial: '229', flag: '🇧🇯' },
  { name: 'Bhutan', iso: 'BT', dial: '975', flag: '🇧🇹' },
  { name: 'Bolivia', iso: 'BO', dial: '591', flag: '🇧🇴' },
  { name: 'Bosnia & Herzegovina', iso: 'BA', dial: '387', flag: '🇧🇦' },
  { name: 'Botswana', iso: 'BW', dial: '267', flag: '🇧🇼' },
  { name: 'Brazil', iso: 'BR', dial: '55', flag: '🇧🇷' },
  { name: 'Brunei', iso: 'BN', dial: '673', flag: '🇧🇳' },
  { name: 'Bulgaria', iso: 'BG', dial: '359', flag: '🇧🇬' },
  { name: 'Burkina Faso', iso: 'BF', dial: '226', flag: '🇧🇫' },
  { name: 'Burundi', iso: 'BI', dial: '257', flag: '🇧🇮' },
  { name: 'Cambodia', iso: 'KH', dial: '855', flag: '🇰🇭' },
  { name: 'Cameroon', iso: 'CM', dial: '237', flag: '🇨🇲' },
  { name: 'Canada', iso: 'CA', dial: '1', flag: '🇨🇦' },
  { name: 'Central African Republic', iso: 'CF', dial: '236', flag: '🇨🇫' },
  { name: 'Chad', iso: 'TD', dial: '235', flag: '🇹🇩' },
  { name: 'Chile', iso: 'CL', dial: '56', flag: '🇨🇱' },
  { name: 'China', iso: 'CN', dial: '86', flag: '🇨🇳' },
  { name: 'Colombia', iso: 'CO', dial: '57', flag: '🇨🇴' },
  { name: 'Comoros', iso: 'KM', dial: '269', flag: '🇰🇲' },
  { name: 'Congo (DRC)', iso: 'CD', dial: '243', flag: '🇨🇩' },
  { name: 'Congo (Republic)', iso: 'CG', dial: '242', flag: '🇨🇬' },
  { name: 'Costa Rica', iso: 'CR', dial: '506', flag: '🇨🇷' },
  { name: "Côte d'Ivoire", iso: 'CI', dial: '225', flag: '🇨🇮' },
  { name: 'Croatia', iso: 'HR', dial: '385', flag: '🇭🇷' },
  { name: 'Cuba', iso: 'CU', dial: '53', flag: '🇨🇺' },
  { name: 'Cyprus', iso: 'CY', dial: '357', flag: '🇨🇾' },
  { name: 'Czechia', iso: 'CZ', dial: '420', flag: '🇨🇿' },
  { name: 'Denmark', iso: 'DK', dial: '45', flag: '🇩🇰' },
  { name: 'Djibouti', iso: 'DJ', dial: '253', flag: '🇩🇯' },
  { name: 'Dominican Republic', iso: 'DO', dial: '1809', flag: '🇩🇴' },
  { name: 'Ecuador', iso: 'EC', dial: '593', flag: '🇪🇨' },
  { name: 'Egypt', iso: 'EG', dial: '20', flag: '🇪🇬' },
  { name: 'El Salvador', iso: 'SV', dial: '503', flag: '🇸🇻' },
  { name: 'Equatorial Guinea', iso: 'GQ', dial: '240', flag: '🇬🇶' },
  { name: 'Eritrea', iso: 'ER', dial: '291', flag: '🇪🇷' },
  { name: 'Estonia', iso: 'EE', dial: '372', flag: '🇪🇪' },
  { name: 'Eswatini', iso: 'SZ', dial: '268', flag: '🇸🇿' },
  { name: 'Ethiopia', iso: 'ET', dial: '251', flag: '🇪🇹' },
  { name: 'Fiji', iso: 'FJ', dial: '679', flag: '🇫🇯' },
  { name: 'Finland', iso: 'FI', dial: '358', flag: '🇫🇮' },
  { name: 'France', iso: 'FR', dial: '33', flag: '🇫🇷' },
  { name: 'Gabon', iso: 'GA', dial: '241', flag: '🇬🇦' },
  { name: 'Gambia', iso: 'GM', dial: '220', flag: '🇬🇲' },
  { name: 'Georgia', iso: 'GE', dial: '995', flag: '🇬🇪' },
  { name: 'Germany', iso: 'DE', dial: '49', flag: '🇩🇪' },
  { name: 'Ghana', iso: 'GH', dial: '233', flag: '🇬🇭' },
  { name: 'Greece', iso: 'GR', dial: '30', flag: '🇬🇷' },
  { name: 'Guatemala', iso: 'GT', dial: '502', flag: '🇬🇹' },
  { name: 'Guinea', iso: 'GN', dial: '224', flag: '🇬🇳' },
  { name: 'Guinea-Bissau', iso: 'GW', dial: '245', flag: '🇬🇼' },
  { name: 'Guyana', iso: 'GY', dial: '592', flag: '🇬🇾' },
  { name: 'Haiti', iso: 'HT', dial: '509', flag: '🇭🇹' },
  { name: 'Honduras', iso: 'HN', dial: '504', flag: '🇭🇳' },
  { name: 'Hong Kong', iso: 'HK', dial: '852', flag: '🇭🇰' },
  { name: 'Hungary', iso: 'HU', dial: '36', flag: '🇭🇺' },
  { name: 'Iceland', iso: 'IS', dial: '354', flag: '🇮🇸' },
  { name: 'India', iso: 'IN', dial: '91', flag: '🇮🇳' },
  { name: 'Indonesia', iso: 'ID', dial: '62', flag: '🇮🇩' },
  { name: 'Iran', iso: 'IR', dial: '98', flag: '🇮🇷' },
  { name: 'Iraq', iso: 'IQ', dial: '964', flag: '🇮🇶' },
  { name: 'Ireland', iso: 'IE', dial: '353', flag: '🇮🇪' },
  { name: 'Israel', iso: 'IL', dial: '972', flag: '🇮🇱' },
  { name: 'Italy', iso: 'IT', dial: '39', flag: '🇮🇹' },
  { name: 'Jamaica', iso: 'JM', dial: '1876', flag: '🇯🇲' },
  { name: 'Japan', iso: 'JP', dial: '81', flag: '🇯🇵' },
  { name: 'Jordan', iso: 'JO', dial: '962', flag: '🇯🇴' },
  { name: 'Kazakhstan', iso: 'KZ', dial: '7', flag: '🇰🇿' },
  { name: 'Kenya', iso: 'KE', dial: '254', flag: '🇰🇪' },
  { name: 'Kuwait', iso: 'KW', dial: '965', flag: '🇰🇼' },
  { name: 'Kyrgyzstan', iso: 'KG', dial: '996', flag: '🇰🇬' },
  { name: 'Laos', iso: 'LA', dial: '856', flag: '🇱🇦' },
  { name: 'Latvia', iso: 'LV', dial: '371', flag: '🇱🇻' },
  { name: 'Lebanon', iso: 'LB', dial: '961', flag: '🇱🇧' },
  { name: 'Lesotho', iso: 'LS', dial: '266', flag: '🇱🇸' },
  { name: 'Liberia', iso: 'LR', dial: '231', flag: '🇱🇷' },
  { name: 'Libya', iso: 'LY', dial: '218', flag: '🇱🇾' },
  { name: 'Lithuania', iso: 'LT', dial: '370', flag: '🇱🇹' },
  { name: 'Luxembourg', iso: 'LU', dial: '352', flag: '🇱🇺' },
  { name: 'Macao', iso: 'MO', dial: '853', flag: '🇲🇴' },
  { name: 'Madagascar', iso: 'MG', dial: '261', flag: '🇲🇬' },
  { name: 'Malawi', iso: 'MW', dial: '265', flag: '🇲🇼' },
  { name: 'Malaysia', iso: 'MY', dial: '60', flag: '🇲🇾' },
  { name: 'Maldives', iso: 'MV', dial: '960', flag: '🇲🇻' },
  { name: 'Mali', iso: 'ML', dial: '223', flag: '🇲🇱' },
  { name: 'Malta', iso: 'MT', dial: '356', flag: '🇲🇹' },
  { name: 'Mauritania', iso: 'MR', dial: '222', flag: '🇲🇷' },
  { name: 'Mauritius', iso: 'MU', dial: '230', flag: '🇲🇺' },
  { name: 'Mexico', iso: 'MX', dial: '52', flag: '🇲🇽' },
  { name: 'Moldova', iso: 'MD', dial: '373', flag: '🇲🇩' },
  { name: 'Mongolia', iso: 'MN', dial: '976', flag: '🇲🇳' },
  { name: 'Montenegro', iso: 'ME', dial: '382', flag: '🇲🇪' },
  { name: 'Morocco', iso: 'MA', dial: '212', flag: '🇲🇦' },
  { name: 'Mozambique', iso: 'MZ', dial: '258', flag: '🇲🇿' },
  { name: 'Myanmar', iso: 'MM', dial: '95', flag: '🇲🇲' },
  { name: 'Namibia', iso: 'NA', dial: '264', flag: '🇳🇦' },
  { name: 'Nepal', iso: 'NP', dial: '977', flag: '🇳🇵' },
  { name: 'Netherlands', iso: 'NL', dial: '31', flag: '🇳🇱' },
  { name: 'New Zealand', iso: 'NZ', dial: '64', flag: '🇳🇿' },
  { name: 'Nicaragua', iso: 'NI', dial: '505', flag: '🇳🇮' },
  { name: 'Niger', iso: 'NE', dial: '227', flag: '🇳🇪' },
  { name: 'Nigeria', iso: 'NG', dial: '234', flag: '🇳🇬' },
  { name: 'North Korea', iso: 'KP', dial: '850', flag: '🇰🇵' },
  { name: 'North Macedonia', iso: 'MK', dial: '389', flag: '🇲🇰' },
  { name: 'Norway', iso: 'NO', dial: '47', flag: '🇳🇴' },
  { name: 'Oman', iso: 'OM', dial: '968', flag: '🇴🇲' },
  { name: 'Pakistan', iso: 'PK', dial: '92', flag: '🇵🇰' },
  { name: 'Palestine', iso: 'PS', dial: '970', flag: '🇵🇸' },
  { name: 'Panama', iso: 'PA', dial: '507', flag: '🇵🇦' },
  { name: 'Papua New Guinea', iso: 'PG', dial: '675', flag: '🇵🇬' },
  { name: 'Paraguay', iso: 'PY', dial: '595', flag: '🇵🇾' },
  { name: 'Peru', iso: 'PE', dial: '51', flag: '🇵🇪' },
  { name: 'Philippines', iso: 'PH', dial: '63', flag: '🇵🇭' },
  { name: 'Poland', iso: 'PL', dial: '48', flag: '🇵🇱' },
  { name: 'Portugal', iso: 'PT', dial: '351', flag: '🇵🇹' },
  { name: 'Qatar', iso: 'QA', dial: '974', flag: '🇶🇦' },
  { name: 'Romania', iso: 'RO', dial: '40', flag: '🇷🇴' },
  { name: 'Russia', iso: 'RU', dial: '7', flag: '🇷🇺' },
  { name: 'Rwanda', iso: 'RW', dial: '250', flag: '🇷🇼' },
  { name: 'Saint Pierre & Miquelon', iso: 'PM', dial: '508', flag: '🇵🇲' },
  { name: 'Saudi Arabia', iso: 'SA', dial: '966', flag: '🇸🇦' },
  { name: 'Senegal', iso: 'SN', dial: '221', flag: '🇸🇳' },
  { name: 'Serbia', iso: 'RS', dial: '381', flag: '🇷🇸' },
  { name: 'Sierra Leone', iso: 'SL', dial: '232', flag: '🇸🇱' },
  { name: 'Singapore', iso: 'SG', dial: '65', flag: '🇸🇬' },
  { name: 'Slovakia', iso: 'SK', dial: '421', flag: '🇸🇰' },
  { name: 'Slovenia', iso: 'SI', dial: '386', flag: '🇸🇮' },
  { name: 'Somalia', iso: 'SO', dial: '252', flag: '🇸🇴' },
  { name: 'South Africa', iso: 'ZA', dial: '27', flag: '🇿🇦' },
  { name: 'South Korea', iso: 'KR', dial: '82', flag: '🇰🇷' },
  { name: 'South Sudan', iso: 'SS', dial: '211', flag: '🇸🇸' },
  { name: 'Spain', iso: 'ES', dial: '34', flag: '🇪🇸' },
  { name: 'Sri Lanka', iso: 'LK', dial: '94', flag: '🇱🇰' },
  { name: 'Sudan', iso: 'SD', dial: '249', flag: '🇸🇩' },
  { name: 'Suriname', iso: 'SR', dial: '597', flag: '🇸🇷' },
  { name: 'Sweden', iso: 'SE', dial: '46', flag: '🇸🇪' },
  { name: 'Switzerland', iso: 'CH', dial: '41', flag: '🇨🇭' },
  { name: 'Syria', iso: 'SY', dial: '963', flag: '🇸🇾' },
  { name: 'Taiwan', iso: 'TW', dial: '886', flag: '🇹🇼' },
  { name: 'Tajikistan', iso: 'TJ', dial: '992', flag: '🇹🇯' },
  { name: 'Tanzania', iso: 'TZ', dial: '255', flag: '🇹🇿' },
  { name: 'Thailand', iso: 'TH', dial: '66', flag: '🇹🇭' },
  { name: 'Timor-Leste', iso: 'TL', dial: '670', flag: '🇹🇱' },
  { name: 'Togo', iso: 'TG', dial: '228', flag: '🇹🇬' },
  { name: 'Tunisia', iso: 'TN', dial: '216', flag: '🇹🇳' },
  { name: 'Turkey', iso: 'TR', dial: '90', flag: '🇹🇷' },
  { name: 'Turkmenistan', iso: 'TM', dial: '993', flag: '🇹🇲' },
  { name: 'Uganda', iso: 'UG', dial: '256', flag: '🇺🇬' },
  { name: 'Ukraine', iso: 'UA', dial: '380', flag: '🇺🇦' },
  { name: 'United Arab Emirates', iso: 'AE', dial: '971', flag: '🇦🇪' },
  { name: 'United Kingdom', iso: 'GB', dial: '44', flag: '🇬🇧' },
  { name: 'United States', iso: 'US', dial: '1', flag: '🇺🇸' },
  { name: 'Uruguay', iso: 'UY', dial: '598', flag: '🇺🇾' },
  { name: 'Uzbekistan', iso: 'UZ', dial: '998', flag: '🇺🇿' },
  { name: 'Venezuela', iso: 'VE', dial: '58', flag: '🇻🇪' },
  { name: 'Vietnam', iso: 'VN', dial: '84', flag: '🇻🇳' },
  { name: 'Yemen', iso: 'YE', dial: '967', flag: '🇾🇪' },
  { name: 'Zambia', iso: 'ZM', dial: '260', flag: '🇿🇲' },
  { name: 'Zimbabwe', iso: 'ZW', dial: '263', flag: '🇿🇼' }
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
    return { error: d.error || d.message || 'এই দেশে বর্তমানে কোনো নম্বর নেই।' };
  }

  const phone = normalizePhone(
    d.phoneNumber || d.number || d.phone || d.data?.phoneNumber || d.data?.number || ''
  );
  if (!phone) {
    return { error: d.message || 'এই দেশে বর্তমানে কোনো নম্বর নেই।' };
  }

  const countryInfo = resolveCountryInfo(phone);
  return {
    service: cleanService,
    range: range && range !== 'auto' ? range : 'auto',
    phone,
    orderId: d.orderId || d.order_id || d.data?.orderId || d.data?.order_id || null,
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

  // 1st image style: flag + Service + digits, then inline copy button with dashed OTP
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

  // 2nd image style: pushed to OTP group if configured
  const otpGroupTarget = String(state.otpGroupId || '').trim() || extractUsernameFromLink(state.otpGroupLink);
  if (otpGroupTarget) {
    const shortTag = getServiceShortTag(serviceName);
    const prefix = digits.slice(0, 4) || 'N/A';
    const rngCode = item.range && item.range !== 'auto' ? String(item.range).slice(0, 6) : digits.slice(0, 6);

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
  const totalNums = balData?.totalNumbers !== undefined ? balData.totalNumbers : 0;
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

async function handleNumberReq(ctx, service, range) {
  const cleanService = String(service || 'Telegram').trim() || 'Telegram';
  const cleanRange = String(range || 'auto').trim() || 'auto';
  await ctx.answerCbQuery('নম্বর নেওয়া হচ্ছে...');

  try {
    const res = await requestNumberFromPanel(cleanService, cleanRange);
    if (!res || res.error) {
      return sendCleanBoard(
        ctx,
        `⚠️ *${cleanService}* এর জন্য নম্বর পাওয়া যায়নি।\n${res?.error ? `কারণ: \`${res.error}\`` : ''}`,
        {
          inline_keyboard: [
            [{ text: '🌍 Change Country', callback_data: `pick_srv_${encodeURIComponent(cleanService)}`, style: 'primary' }],
            [{ text: '⬅️ Back to Services', callback_data: 'back_services', style: 'danger' }]
          ]
        },
        true
      );
    }
    const sess = {
      item: res,
      stripCC: false,
      autoChecker: true,
      otpDelivered: false
    };
    state.userSession.set(ctx.from.id, sess);
    const card = buildNumberCard(sess, null);
    await sendCleanBoard(ctx, card.text, card.reply_markup, true);
  } catch (err) {
    console.error('[GET-NUMBER ERR]:', err.response?.data || err.message);
    await sendCleanBoard(
      ctx,
      '❌ প্যানেল থেকে নম্বর আনতে সমস্যা হয়েছে।',
      {
        inline_keyboard: [
          [{ text: '🌍 Change Country', callback_data: `pick_srv_${encodeURIComponent(cleanService)}`, style: 'primary' }]
        ]
      },
      true
    );
  }
}

bot.action(/^get_num_(.+)__(.+)$/, async (ctx) => {
  await handleNumberReq(ctx, decodeURIComponent(ctx.match[1]), decodeURIComponent(ctx.match[2]));
});

bot.action(/^chg_num_(.+)__(.+)$/, async (ctx) => {
  await handleNumberReq(ctx, decodeURIComponent(ctx.match[1]), decodeURIComponent(ctx.match[2]));
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
  const sess = state.userSession.get(ctx.from.id);
  await sendCleanBoard(
    ctx,
    sess?.item
      ? `🟡 *Active Number*\n\n• Service: *${sess.item.service}*\n• Country: *${sess.item.countryLabel}*\n• Number: \`${sess.item.phone}\`\n• Order ID: \`${sess.item.orderId || 'N/A'}\``
      : '🟡 কোনো সক্রিয় নম্বর নেই।'
  );
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
    const [u, b, st, key, en, jc, mLink, mId, oLink, oId, vUsers] = await Promise.all([
      dbGet('users/list'),
      dbGet('balances'),
      dbGet('stats/otps'),
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
  console.log('Bot running with dashed OTP copy buttons and OTP group delivery...');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
