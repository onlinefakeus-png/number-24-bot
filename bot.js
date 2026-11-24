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

const IMS_DEFAULT_URL = String(process.env.IMS_BASE_URL || 'https://imssms.org/api/v1/rest')
  .trim()
  .replace(/\/+$/, '');
const IMS_DEFAULT_TOKEN = String(process.env.IMS_API_TOKEN || '').trim();

const TWENTY_MIN_MS = 20 * 60 * 1000;
const TEN_MIN_MS = 10 * 60 * 1000;
const OTP_POLL_MS = 6000;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN missing');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const regionNamesEn =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function isoToFlag(iso2) {
  const code = String(iso2 || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '🌍';
  const A = 0x1f1e6;
  return String.fromCodePoint(A + code.charCodeAt(0) - 65, A + code.charCodeAt(1) - 65);
}

function isoToCountryName(iso2) {
  const code = String(iso2 || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return 'Global';
  try {
    return regionNamesEn?.of(code) || code;
  } catch (_) {
    return code;
  }
}

const CANADA_AREA_CODES = new Set([
  '204', '226', '236', '249', '250', '263', '289', '306', '343', '354',
  '365', '367', '368', '403', '416', '418', '428', '431', '437', '438',
  '450', '468', '474', '506', '514', '519', '548', '579', '581', '587',
  '604', '613', '639', '647', '672', '683', '705', '709', '742', '753',
  '778', '780', '782', '807', '819', '825', '867', '873', '902', '905',
  '942', '947'
]);

const DIAL_TO_ISO_ENTRIES = [
  ['1242', 'BS'], ['1246', 'BB'], ['1264', 'AI'], ['1268', 'AG'], ['1284', 'VG'],
  ['1340', 'VI'], ['1345', 'KY'], ['1441', 'BM'], ['1473', 'GD'], ['1649', 'TC'],
  ['1664', 'MS'], ['1670', 'MP'], ['1671', 'GU'], ['1684', 'AS'], ['1721', 'SX'],
  ['1758', 'LC'], ['1767', 'DM'], ['1784', 'VC'], ['1787', 'PR'], ['1809', 'DO'],
  ['1829', 'DO'], ['1849', 'DO'], ['1868', 'TT'], ['1869', 'KN'], ['1876', 'JM'],
  ['1939', 'PR'],
  ['211', 'SS'], ['212', 'MA'], ['213', 'DZ'], ['216', 'TN'], ['218', 'LY'],
  ['220', 'GM'], ['221', 'SN'], ['222', 'MR'], ['223', 'ML'], ['224', 'GN'],
  ['225', 'CI'], ['226', 'BF'], ['227', 'NE'], ['228', 'TG'], ['229', 'BJ'],
  ['230', 'MU'], ['231', 'LR'], ['232', 'SL'], ['233', 'GH'], ['234', 'NG'],
  ['235', 'TD'], ['236', 'CF'], ['237', 'CM'], ['238', 'CV'], ['239', 'ST'],
  ['240', 'GQ'], ['241', 'GA'], ['242', 'CG'], ['243', 'CD'], ['244', 'AO'],
  ['245', 'GW'], ['246', 'IO'], ['247', 'AC'], ['248', 'SC'], ['249', 'SD'],
  ['250', 'RW'], ['251', 'ET'], ['252', 'SO'], ['253', 'DJ'], ['254', 'KE'],
  ['255', 'TZ'], ['256', 'UG'], ['257', 'BI'], ['258', 'MZ'], ['260', 'ZM'],
  ['261', 'MG'], ['262', 'RE'], ['263', 'ZW'], ['264', 'NA'], ['265', 'MW'],
  ['266', 'LS'], ['267', 'BW'], ['268', 'SZ'], ['269', 'KM'], ['290', 'SH'],
  ['291', 'ER'], ['297', 'AW'], ['298', 'FO'], ['299', 'GL'],
  ['350', 'GI'], ['351', 'PT'], ['352', 'LU'], ['353', 'IE'], ['354', 'IS'],
  ['355', 'AL'], ['356', 'MT'], ['357', 'CY'], ['358', 'FI'], ['359', 'BG'],
  ['370', 'LT'], ['371', 'LV'], ['372', 'EE'], ['373', 'MD'], ['374', 'AM'],
  ['375', 'BY'], ['376', 'AD'], ['377', 'MC'], ['378', 'SM'], ['380', 'UA'],
  ['381', 'RS'], ['382', 'ME'], ['383', 'XK'], ['385', 'HR'], ['386', 'SI'],
  ['387', 'BA'], ['389', 'MK'],
  ['420', 'CZ'], ['421', 'SK'], ['423', 'LI'],
  ['500', 'FK'], ['501', 'BZ'], ['502', 'GT'], ['503', 'SV'], ['504', 'HN'],
  ['505', 'NI'], ['506', 'CR'], ['507', 'PA'], ['508', 'PM'], ['509', 'HT'],
  ['590', 'GP'], ['591', 'BO'], ['592', 'GY'], ['593', 'EC'], ['594', 'GF'],
  ['595', 'PY'], ['596', 'SR'], ['597', 'SR'], ['598', 'UY'], ['599', 'CW'],
  ['670', 'TL'], ['672', 'NF'], ['673', 'BN'], ['674', 'NR'], ['675', 'PG'],
  ['676', 'TO'], ['677', 'SB'], ['678', 'VU'], ['679', 'FJ'], ['680', 'PW'],
  ['681', 'WF'], ['682', 'CK'], ['683', 'NU'], ['685', 'WS'], ['686', 'KI'],
  ['687', 'NC'], ['688', 'TV'], ['689', 'PF'], ['690', 'TK'], ['691', 'FM'],
  ['692', 'MH'],
  ['850', 'KP'], ['852', 'HK'], ['853', 'MO'], ['855', 'KH'], ['856', 'LA'],
  ['880', 'BD'], ['886', 'TW'],
  ['960', 'MV'], ['961', 'LB'], ['962', 'JO'], ['963', 'SY'], ['964', 'IQ'],
  ['965', 'KW'], ['966', 'SA'], ['967', 'YE'], ['968', 'OM'], ['970', 'PS'],
  ['971', 'AE'], ['972', 'IL'], ['973', 'BH'], ['974', 'QA'], ['975', 'BT'],
  ['976', 'MN'], ['977', 'NP'], ['992', 'TJ'], ['993', 'TM'], ['994', 'AZ'],
  ['995', 'GE'], ['996', 'KG'], ['998', 'UZ'],
  ['20', 'EG'], ['27', 'ZA'], ['30', 'GR'], ['31', 'NL'], ['32', 'BE'],
  ['33', 'FR'], ['34', 'ES'], ['36', 'HU'], ['39', 'IT'], ['40', 'RO'],
  ['41', 'CH'], ['43', 'AT'], ['44', 'GB'], ['45', 'DK'], ['46', 'SE'],
  ['47', 'NO'], ['48', 'PL'], ['49', 'DE'], ['51', 'PE'], ['52', 'MX'],
  ['53', 'CU'], ['54', 'AR'], ['55', 'BR'], ['56', 'CL'], ['57', 'CO'],
  ['58', 'VE'], ['60', 'MY'], ['61', 'AU'], ['62', 'ID'], ['63', 'PH'],
  ['64', 'NZ'], ['65', 'SG'], ['66', 'TH'], ['81', 'JP'], ['82', 'KR'],
  ['84', 'VN'], ['86', 'CN'], ['90', 'TR'], ['91', 'IN'], ['92', 'PK'],
  ['93', 'AF'], ['94', 'LK'], ['95', 'MM'], ['98', 'IR'],
  ['7', 'RU'], ['1', 'US']
];

const ALL_ISO_CODES = [
  'AF','AX','AL','DZ','AS','AD','AO','AI','AQ','AG','AR','AM','AW','AU','AT','AZ',
  'BS','BH','BD','BB','BY','BE','BZ','BJ','BM','BT','BO','BQ','BA','BW','BV','BR',
  'IO','BN','BG','BF','BI','CV','KH','CM','CA','KY','CF','TD','CL','CN','CX','CC',
  'CO','KM','CG','CD','CK','CR','CI','HR','CU','CW','CY','CZ','DK','DJ','DM','DO',
  'EC','EG','SV','GQ','ER','EE','SZ','ET','FK','FO','FJ','FI','FR','GF','PF','TF',
  'GA','GM','GE','DE','GH','GI','GR','GL','GD','GP','GU','GT','GG','GN','GW','GY',
  'HT','HM','VA','HN','HK','HU','IS','IN','ID','IR','IQ','IE','IM','IL','IT','JM',
  'JP','JE','JO','KZ','KE','KI','KP','KR','KW','KG','LA','LV','LB','LS','LR','LY',
  'LI','LT','LU','MO','MG','MW','MY','MV','ML','MT','MH','MQ','MR','MU','YT','MX',
  'FM','MD','MC','MN','ME','MS','MA','MZ','MM','NA','NR','NP','NL','NC','NZ','NI',
  'NE','NG','NU','NF','MK','MP','NO','OM','PK','PW','PS','PA','PG','PY','PE','PH',
  'PN','PL','PT','PR','QA','RE','RO','RU','RW','BL','SH','KN','LC','MF','PM','VC',
  'WS','SM','ST','SA','SN','RS','SC','SL','SG','SX','SK','SI','SB','SO','ZA','GS',
  'SS','ES','LK','SD','SR','SJ','SE','CH','SY','TW','TJ','TZ','TH','TL','TG','TK',
  'TO','TT','TN','TR','TM','TC','TV','UG','UA','AE','GB','US','UM','UY','UZ','VU',
  'VE','VN','VG','VI','WF','EH','YE','ZM','ZW'
];

const COUNTRY_NAME_TO_ISO = new Map(
  ALL_ISO_CODES.map((iso) => [isoToCountryName(iso).toLowerCase(), iso])
);
COUNTRY_NAME_TO_ISO.set('uk', 'GB');
COUNTRY_NAME_TO_ISO.set('united kingdom', 'GB');
COUNTRY_NAME_TO_ISO.set('great britain', 'GB');
COUNTRY_NAME_TO_ISO.set('usa', 'US');
COUNTRY_NAME_TO_ISO.set('united states', 'US');
COUNTRY_NAME_TO_ISO.set('united states of america', 'US');
COUNTRY_NAME_TO_ISO.set('uae', 'AE');
COUNTRY_NAME_TO_ISO.set('ivory coast', 'CI');
COUNTRY_NAME_TO_ISO.set("cote d'ivoire", 'CI');
COUNTRY_NAME_TO_ISO.set("côte d'ivoire", 'CI');
COUNTRY_NAME_TO_ISO.set('russia', 'RU');
COUNTRY_NAME_TO_ISO.set('russian federation', 'RU');
COUNTRY_NAME_TO_ISO.set('vietnam', 'VN');
COUNTRY_NAME_TO_ISO.set('south korea', 'KR');
COUNTRY_NAME_TO_ISO.set('north korea', 'KP');
COUNTRY_NAME_TO_ISO.set('laos', 'LA');
COUNTRY_NAME_TO_ISO.set('moldova', 'MD');
COUNTRY_NAME_TO_ISO.set('bolivia', 'BO');
COUNTRY_NAME_TO_ISO.set('venezuela', 'VE');
COUNTRY_NAME_TO_ISO.set('tanzania', 'TZ');
COUNTRY_NAME_TO_ISO.set('syria', 'SY');
COUNTRY_NAME_TO_ISO.set('iran', 'IR');

const state = {
  apiEnabled: true,
  rangeEnabled: true,
  rewardEnabled: true,
  shortMsgMode: false,
  newNumberNotify: true,
  baseUrl: IMS_DEFAULT_URL,
  apiKey: IMS_DEFAULT_TOKEN,
  customNumbers: [],
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
  cachedRanges: null,
  cachedNumbers: null
};

const hitSnapshotsByKey = new Map();
let lastImsCallTs = 0;

function getImsBaseUrl() {
  const cleaned = String(state.baseUrl || IMS_DEFAULT_URL || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(cleaned) ? cleaned : '';
}

function getImsApiToken() {
  return String(state.apiKey || IMS_DEFAULT_TOKEN || '').trim();
}

function maskImsToken(token) {
  const t = String(token || '').trim();
  if (!t) return 'Not Set';
  if (t.length <= 10) return `${t.slice(0, 3)}****`;
  return `${t.slice(0, 8)}••••••••••••${t.slice(-4)}`;
}

function isImsReady() {
  return Boolean(state.apiEnabled && getImsBaseUrl() && getImsApiToken());
}

function getImsEndpoints() {
  const b = getImsBaseUrl();
  if (!b) {
    return {
      base: '',
      ranges: '',
      numbers: '',
      cdrs: '',
      messages: ''
    };
  }
  return {
    base: b,
    ranges: `${b}/ranges`,
    numbers: `${b}/numbers`,
    cdrs: `${b}/cdrs`,
    messages: `${b}/messages`
  };
}

function buildImsUrl(endpointUrl, extraParams = {}) {
  const rawEndpoint = String(endpointUrl || '').trim();
  const base = getImsBaseUrl();
  const validEndpoint = /^https?:\/\//i.test(rawEndpoint)
    ? rawEndpoint
    : `${base}/${rawEndpoint.replace(/^\/+/, '')}`;

  const token = getImsApiToken();
  const merged = {
    token,
    ...extraParams
  };

  const url = new URL(validEndpoint);
  Object.entries(merged).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      url.searchParams.set(k, String(v).trim());
    }
  });
  return url.toString();
}

async function paceImsRateLimit() {
  const now = Date.now();
  const waitMs = Math.max(0, 1100 - (now - lastImsCallTs));
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastImsCallTs = Date.now();
}

async function callImsPanel(endpointUrl, extraParams = {}, timeout = 20000) {
  await paceImsRateLimit();
  const token = getImsApiToken();
  const fullUrl = buildImsUrl(endpointUrl, extraParams);
  return axios.get(fullUrl, {
    timeout,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
}

function buildCountryResultFromIso(iso, fallbackDial = '') {
  const cleanIso = String(iso || '').toUpperCase();
  const name = isoToCountryName(cleanIso);
  const flag = isoToFlag(cleanIso);
  const dialEntry = DIAL_TO_ISO_ENTRIES.find(([, code]) => code === cleanIso);
  return {
    key: cleanIso.toLowerCase(),
    name,
    iso: cleanIso,
    label: `${flag} ${name}`,
    flag,
    dial: fallbackDial || (dialEntry ? dialEntry[0] : '')
  };
}

function resolveCountryInfo(primaryInput, secondaryInput = '') {
  const candidates = [primaryInput, secondaryInput].filter(
    (v) => v !== undefined && v !== null && String(v).trim() !== ''
  );

  for (const raw of candidates) {
    const str = String(raw).trim();
    const cleanedText = str.replace(/x+$/i, '').trim();
    const lower = cleanedText.toLowerCase();

    if (/^[a-z]{2}$/i.test(lower)) {
      return buildCountryResultFromIso(lower.toUpperCase());
    }
    if (COUNTRY_NAME_TO_ISO.has(lower)) {
      return buildCountryResultFromIso(COUNTRY_NAME_TO_ISO.get(lower));
    }
    for (const [cName, iso] of COUNTRY_NAME_TO_ISO.entries()) {
      if (cName.length >= 4 && lower.includes(cName)) {
        return buildCountryResultFromIso(iso);
      }
    }
  }

  for (const raw of candidates) {
    const str = String(raw).trim();
    if (/[a-zA-Z]/.test(str.replace(/x+$/i, ''))) continue;

    const digits = str.replace(/[^\d]/g, '');
    if (!digits) continue;

    if (digits.startsWith('1') && digits.length >= 4) {
      const area3 = digits.slice(1, 4);
      if (CANADA_AREA_CODES.has(area3)) {
        return buildCountryResultFromIso('CA', `1${area3}`);
      }
    }

    for (const [dial, iso] of DIAL_TO_ISO_ENTRIES) {
      if (digits.startsWith(dial)) {
        return buildCountryResultFromIso(iso, dial);
      }
    }
  }

  return {
    key: 'global',
    name: 'Global',
    iso: 'GL',
    label: '🌍 Global',
    flag: '🌍',
    dial: ''
  };
}

function normalizePhone(raw) {
  let digits = String(raw || '').replace(/[^\d]/g, '');
  if (digits.startsWith('00') && digits.length > 8) {
    digits = digits.slice(2);
  }
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
}

function parseNumbersFromInput(rawText) {
  const text = String(rawText || '');
  const phones = [];

  const matches = text.match(/\+?\d[\d\s\-().]{6,22}\d/g) || [];
  for (const m of matches) {
    const p = normalizePhone(m);
    if (p && !phones.includes(p)) {
      phones.push(p);
    }
  }

  if (!phones.length) {
    const chunks = text.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean);
    for (const chunk of chunks) {
      const p = normalizePhone(chunk);
      if (p && !phones.includes(p)) {
        phones.push(p);
      }
    }
  }

  return phones;
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

function extractHitsValue(r) {
  const raw =
    r?.hits ??
    r?.hit ??
    r?.hitCount ??
    r?.hit_count ??
    r?.totalHits ??
    r?.traffic ??
    r?.clicks ??
    0;
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 ? num : 0;
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
        { text: '⚙️ Panel & Add Num ⋮⋮⋮⋮', style: 'success' },
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
        { text: '📊 Num Status ⋮⋮⋮⋮', style: 'primary' },
        { text: '🔗 Endpoints ⋮⋮⋮⋮', style: 'primary' }
      ],
      [
        { text: '🛡️ Info ⋮⋮⋮⋮', style: 'primary' },
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

function normalizeActiveRangeList(rawData) {
  if (Array.isArray(rawData?.data?.active_ranges)) return rawData.data.active_ranges;
  if (Array.isArray(rawData?.active_ranges)) return rawData.active_ranges;
  if (Array.isArray(rawData?.ranges)) return rawData.ranges;
  if (Array.isArray(rawData?.data)) return rawData.data;
  if (Array.isArray(rawData)) return rawData;
  if (rawData && typeof rawData === 'object') {
    const items = [];
    for (const [k, v] of Object.entries(rawData)) {
      if (v && typeof v === 'object') {
        items.push({ service: v.service || v.app || k, ...v });
      }
    }
    return items;
  }
  return [];
}

async function fetchActiveRanges() {
  if (!isImsReady()) return [];
  if (state.cachedRanges && Date.now() - state.cachedRanges.ts < 15000) {
    return state.cachedRanges.items;
  }
  const ep = getImsEndpoints();
  try {
    const res = await callImsPanel(ep.ranges, {}, 20000);
    const list = normalizeActiveRangeList(res.data);
    state.cachedRanges = { items: list, ts: Date.now() };
    return list;
  } catch (err) {
    console.error('[IMS RANGES ERR]:', err.response?.data || err.message);
    return state.cachedRanges?.items || [];
  }
}

async function fetchImsNumbersList() {
  if (!isImsReady()) return [];
  if (state.cachedNumbers && Date.now() - state.cachedNumbers.ts < 15000) {
    return state.cachedNumbers.items;
  }
  const ep = getImsEndpoints();
  try {
    const res = await callImsPanel(ep.numbers, {}, 20000);
    const list = normalizeActiveRangeList(res.data);
    state.cachedNumbers = { items: list, ts: Date.now() };
    return list;
  } catch (err) {
    console.error('[IMS NUMBERS ERR]:', err.response?.data || err.message);
    return state.cachedNumbers?.items || [];
  }
}

async function fetchPanelBalanceRaw() {
  if (!isImsReady()) return null;
  const ep = getImsEndpoints();
  try {
    const [rangesRes, numbersRes] = await Promise.all([
      callImsPanel(ep.ranges, {}, 15000).catch(() => ({ data: [] })),
      callImsPanel(ep.numbers, {}, 15000).catch(() => ({ data: [] }))
    ]);
    const rangesCount = normalizeActiveRangeList(rangesRes.data).length;
    const numbersCount = normalizeActiveRangeList(numbersRes.data).length;
    return {
      api: 'IMS REST v1',
      status: 'connected',
      rangesCount,
      numbersCount
    };
  } catch (err) {
    console.error('[IMS STATUS ERR]:', err.response?.data || err.message);
    return null;
  }
}

function getAlreadyUsedPhoneDigitsSet() {
  const usedDigits = new Set();

  for (const h of state.numberHistory || []) {
    const d = String(h?.phone || '').replace(/[^\d]/g, '');
    if (d) usedDigits.add(d);
  }

  for (const c of state.customNumbers || []) {
    if (c?.used && c?.phone) {
      const d = String(c.phone).replace(/[^\d]/g, '');
      if (d) usedDigits.add(d);
    }
  }

  for (const [, sess] of state.userSession.entries()) {
    if (sess?.item?.phone) {
      const d = String(sess.item.phone).replace(/[^\d]/g, '');
      if (d) usedDigits.add(d);
    }
  }

  return usedDigits;
}

async function getPanelAndPoolNumberUsageStats() {
  const customList = Array.isArray(state.customNumbers) ? state.customNumbers : [];
  const customUsed = customList.filter((x) => Boolean(x?.used)).length;
  const customUnused = customList.filter((x) => !x?.used).length;

  const usedPhoneSet = getAlreadyUsedPhoneDigitsSet();

  let imsTotal = 0;
  let imsUsed = 0;
  let imsUnused = 0;
  let imsError = '';

  if (!isImsReady()) {
    imsError = 'IMS API সেট বা চালু নেই';
  } else {
    try {
      const ep = getImsEndpoints();
      const [numRes, msgRes] = await Promise.all([
        callImsPanel(ep.numbers, {}, 20000),
        callImsPanel(ep.messages, { records: 100 }, 20000).catch(() => ({ data: [] }))
      ]);

      const rawNums = normalizeActiveRangeList(numRes.data);
      const rawMsgs = Array.isArray(msgRes.data?.data)
        ? msgRes.data.data
        : Array.isArray(msgRes.data?.messages)
        ? msgRes.data.messages
        : Array.isArray(msgRes.data)
        ? msgRes.data
        : [];

      const msgPhoneDigits = new Set();
      for (const m of rawMsgs) {
        const d = String(m?.number || m?.to || m?.destination || m?.phone || '').replace(/[^\d]/g, '');
        if (d) msgPhoneDigits.add(d);
      }

      const uniquePanelPhones = new Set();
      for (const row of rawNums) {
        const p = normalizePhone(
          row?.number || row?.phone || row?.phoneNumber || row?.msisdn || row?.did || ''
        );
        const digits = p ? p.replace(/[^\d]/g, '') : String(row?.id || '').trim();
        if (!digits || uniquePanelPhones.has(digits)) continue;
        uniquePanelPhones.add(digits);
        imsTotal += 1;

        const isRowUsed =
          Boolean(row?.used) ||
          Boolean(row?.assigned) ||
          String(row?.status || '').toLowerCase() === 'used' ||
          usedPhoneSet.has(digits) ||
          [...msgPhoneDigits].some((md) => md.endsWith(digits) || digits.endsWith(md));

        if (isRowUsed) imsUsed += 1;
        else imsUnused += 1;
      }
    } catch (err) {
      console.error('[NUM STATUS ERR]:', err.response?.data || err.message);
      imsError = 'প্যানেল নম্বর স্ট্যাটাস আনতে সমস্যা হয়েছে';
    }
  }

  return {
    customTotal: customList.length,
    customUsed,
    customUnused,
    imsTotal,
    imsUsed,
    imsUnused,
    imsError
  };
}

function pickCustomNumberFromPool(service = 'Telegram', range = '', countryHint = '') {
  const cleanService = String(service || 'Telegram').trim().toLowerCase();
  const cleanRange = String(range || '').trim().toLowerCase();
  const cleanCountry = String(countryHint || '').trim().toLowerCase();
  const pool = Array.isArray(state.customNumbers) ? state.customNumbers : [];

  const idx = pool.findIndex((entry) => {
    if (!entry || entry.used) return false;
    const srvMatch = String(entry.service || '').toLowerCase() === cleanService;
    if (!srvMatch) return false;

    if (cleanCountry && cleanCountry !== 'auto') {
      const cName = String(entry.countryName || '').toLowerCase();
      const cKey = String(entry.countryKey || '').toLowerCase();
      if (cName !== cleanCountry && cKey !== cleanCountry) return false;
    }

    if (!cleanRange || cleanRange === 'auto') return true;
    const phoneDigits = String(entry.phone || '').replace(/[^\d]/g, '');
    const rngStr = String(entry.range || '').toLowerCase();
    return rngStr === cleanRange || phoneDigits.startsWith(cleanRange.replace(/[^\d]/g, ''));
  });

  if (idx === -1) return null;
  const chosen = pool[idx];
  chosen.used = true;
  return chosen;
}

async function pickImsNumberFromApi(service = 'Telegram', range = '', countryHint = '') {
  if (!isImsReady()) return null;
  const nums = await fetchImsNumbersList();
  const cleanRangeDigits = String(range || '').replace(/[^\d]/g, '');
  const cleanCountry = String(countryHint || '').trim().toLowerCase();
  const usedDigits = getAlreadyUsedPhoneDigitsSet();

  for (const row of nums) {
    const isRowAlreadyUsed =
      Boolean(row?.used) ||
      Boolean(row?.assigned) ||
      String(row?.status || '').toLowerCase() === 'used';
    if (isRowAlreadyUsed) continue;

    const phone = normalizePhone(
      row?.number || row?.phone || row?.phoneNumber || row?.msisdn || row?.did || ''
    );
    if (!phone) continue;

    const digits = phone.replace(/[^\d]/g, '');
    if (usedDigits.has(digits)) continue;

    const cInfo = resolveCountryInfo(phone, row?.country || row?.country_name || cleanCountry);

    if (cleanCountry && cleanCountry !== 'auto') {
      if (cInfo.name.toLowerCase() !== cleanCountry && cInfo.key !== cleanCountry) {
        continue;
      }
    }

    if (cleanRangeDigits && range !== 'auto') {
      const rowRange = String(row?.range || row?.prefix || '').replace(/[^\d]/g, '');
      if (!digits.startsWith(cleanRangeDigits) && rowRange !== cleanRangeDigits) {
        continue;
      }
    }

    return {
      service: String(service || row?.service || 'Telegram').trim() || 'Telegram',
      range: cleanRangeDigits || (range && range !== 'auto' ? range : 'auto'),
      phone,
      orderId: row?.id || `IMS-${digits}`,
      countryKey: cInfo.key,
      countryName: cInfo.name,
      countryIso: cInfo.iso,
      countryLabel: cInfo.label,
      flag: cInfo.flag,
      dial: cInfo.dial
    };
  }

  return null;
}

// ১. GET NUMBER (আগের নিয়মে: সার্ভিস -> দেশ -> নম্বর)
async function requestGetNumberFromIms(service = 'Telegram', range = '') {
  const cleanService = String(service || 'Telegram').trim() || 'Telegram';
  const customHit = pickCustomNumberFromPool(cleanService, range);
  if (customHit) {
    await dbPut('customNumbers/list', state.customNumbers);
    const cInfo = resolveCountryInfo(customHit.phone, customHit.countryName || customHit.range);
    return {
      service: cleanService,
      range: customHit.range || (range && range !== 'auto' ? range : 'auto'),
      phone: customHit.phone,
      orderId: customHit.orderId || `CUSTOM-${Date.now()}`,
      countryKey: cInfo.key,
      countryName: cInfo.name,
      countryIso: cInfo.iso,
      countryLabel: cInfo.label,
      flag: cInfo.flag,
      dial: cInfo.dial
    };
  }

  const imsHit = await pickImsNumberFromApi(cleanService, state.rangeEnabled ? range : '', '');
  if (imsHit) return imsHit;

  return { error: 'সব নম্বর ব্যবহার শেষ হয়ে গেছে। নতুন নম্বর যুক্ত না করা পর্যন্ত আর নম্বর দেওয়া হবে না।' };
}

// ২. NOTIFICATION BUTTON নম্বর নেওয়ার আলাদা ফাংশন
async function requestNotificationNumber(service = 'Telegram', range = 'auto', country = '') {
  const cleanService = String(service || 'Telegram').trim() || 'Telegram';
  const cleanRange = String(range || 'auto').trim() || 'auto';
  const cleanCountry = String(country || '').trim();

  const customHit = pickCustomNumberFromPool(cleanService, cleanRange, cleanCountry);
  if (customHit) {
    await dbPut('customNumbers/list', state.customNumbers);
    const cInfo = resolveCountryInfo(customHit.phone, customHit.countryName || cleanCountry || customHit.range);
    return {
      service: cleanService,
      range: customHit.range || (cleanRange !== 'auto' ? cleanRange : 'auto'),
      phone: customHit.phone,
      orderId: customHit.orderId || `CUSTOM-${Date.now()}`,
      countryKey: cInfo.key,
      countryName: cInfo.name,
      countryIso: cInfo.iso,
      countryLabel: cInfo.label,
      flag: cInfo.flag,
      dial: cInfo.dial
    };
  }

  const imsHit = await pickImsNumberFromApi(cleanService, cleanRange, cleanCountry);
  if (imsHit) return imsHit;

  return { error: 'সব নম্বর ব্যবহার শেষ হয়ে গেছে। নতুন নম্বর যুক্ত না করা পর্যন্ত আর নম্বর দেওয়া হবে না।' };
}

async function handleNotificationNumberAction(ctx, service, range, country = '') {
  await registerUser(ctx.from.id);
  const cleanService = String(service || 'Telegram').trim() || 'Telegram';
  const cleanRange = String(range || 'auto').trim() || 'auto';

  try {
    const res = await requestNotificationNumber(cleanService, cleanRange, country);
    if (!res || res.error) {
      return sendCleanBoard(
        ctx,
        `🟧 *NOTIFICATION NUMBER*\n🟦 *${cleanService}* ${cleanRange !== 'auto' ? `(Range: \`${cleanRange}\`) ` : ''}এর নম্বর পাওয়া যায়নি\n${res?.error ? `🟨 *কারণ:* \`${res.error}\`` : ''}`,
        null,
        false
      );
    }

    const sess = {
      item: res,
      stripCC: false,
      autoChecker: true,
      otpDelivered: false,
      otpValue: null,
      chatId: ctx.chat?.id,
      cardMsgId: null
    };
    state.userSession.set(ctx.from.id, sess);
    await saveNumberToHistory(ctx.from.id, res);
    const card = buildNumberCard(sess, null);
    const sent = await sendCleanBoard(ctx, card.text, card.reply_markup, false);
    if (sent?.message_id) {
      sess.cardMsgId = sent.message_id;
      sess.chatId = ctx.chat?.id;
      state.userSession.set(ctx.from.id, sess);
    }
  } catch (err) {
    console.error('[NOTIF-NUMBER ERR]:', err.response?.data || err.message);
    await sendCleanBoard(
      ctx,
      `🟧 *NOTIFICATION NUMBER ERROR*\n🟦 *নোটিফিকেশন নম্বর আনতে সমস্যা হয়েছে*`,
      null,
      false
    );
  }
}

async function requestOtpFromIms(_orderId, phone) {
  if (!isImsReady() || !phone) return null;
  const ep = getImsEndpoints();
  const cleanDigits = String(phone).replace(/[^\d]/g, '');
  const nowUtc = new Date();
  const dateFrom = new Date(nowUtc.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
  const dateTo = nowUtc.toISOString().replace('T', ' ').slice(0, 19);

  const res = await callImsPanel(
    ep.messages,
    {
      date_from: dateFrom,
      date_to: dateTo,
      filter_number: cleanDigits,
      records: 10
    },
    15000
  );

  const raw = res.data;
  const rows = Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw?.messages)
    ? raw.messages
    : Array.isArray(raw)
    ? raw
    : [];

  for (const row of rows) {
    const rowPhone = String(row?.number || row?.to || row?.destination || row?.phone || '').replace(/[^\d]/g, '');
    if (rowPhone && !rowPhone.endsWith(cleanDigits) && !cleanDigits.endsWith(rowPhone)) continue;

    const textBody = String(row?.message || row?.text || row?.sms || row?.body || row?.otp || '');
    const match = textBody.match(/\b\d{4,8}\b/);
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
      `${item.flag} *${serviceName}*\n` +
      `📞 \`+${digits}\`\n` +
      `🔐 \`${formattedOtp}\``;
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
      `🟨 *Prefix:* \`${prefix}\` | *Range:* \`#${rngCode}\`\n` +
      `🔐 *OTP:* \`${formattedOtp}\``;

  const grpButtons = [
    [
      {
        text: `📋 ${formattedOtp}`,
        type: 'copy_text',
        copy_text: { text: formattedOtp },
        style: 'success'
      }
    ]
  ];

  const linkRow = [];
  if (state.mainGroupLink && /^https?:\/\//i.test(state.mainGroupLink)) {
    linkRow.push({ text: '📢 Channel', url: state.mainGroupLink, style: 'primary' });
  }
  if (bot.botInfo?.username) {
    linkRow.push({ text: '🤖 Bot Link', url: `https://t.me/${bot.botInfo.username}`, style: 'success' });
  }
  if (linkRow.length) grpButtons.push(linkRow);

  try {
    await rawSendMessage(
      otpGroupTarget,
      groupText,
      { inline_keyboard: grpButtons }
    );
    return { ok: true, target: otpGroupTarget };
  } catch (e) {
    console.error('[OTP GROUP SEND ERR]:', e.message);
    return { ok: false, reason: e.message };
  }
}

async function sendNewNumberNotificationToUsers(summary) {
  if (!state.newNumberNotify || !Array.isArray(state.users) || !state.users.length) return;

  const text =
    `🟧 *নতুন নম্বর যুক্ত হয়েছে*\n` +
    `🟦 *সার্ভিস:* *${summary.service}*\n` +
    `🟩 *দেশ:* *${summary.countryLabel}*\n` +
    `🟨 *যুক্ত হয়েছে:* *${summary.count} টি নম্বর*`;

  const uniqueUsers = [...new Set(state.users.map((id) => String(id).trim()).filter(Boolean))];
  for (const uid of uniqueUsers) {
    try {
      await rawSendMessage(uid, text, getMainKeyboard(ADMIN_IDS.includes(Number(uid))));
    } catch (e) {
      console.error(`[NOTIFY ERR ${uid}]:`, e.message);
    }
  }
}

function recordHitSnapshot(key, hits, now = Date.now()) {
  const list = hitSnapshotsByKey.get(key) || [];
  list.push({ ts: now, hits: Number(hits || 0) });
  const cutoff = now - 30 * 60 * 1000;
  const trimmed = list.filter((entry) => entry.ts >= cutoff);
  hitSnapshotsByKey.set(key, trimmed);
  return trimmed;
}

function getHitsFromTenMinutesAgo(key, now = Date.now()) {
  const list = hitSnapshotsByKey.get(key) || [];
  if (!list.length) return null;

  const targetTs = now - TEN_MIN_MS;
  let best = null;
  for (const entry of list) {
    if (entry.ts <= targetTs + 30 * 1000) {
      if (!best || Math.abs(entry.ts - targetTs) < Math.abs(best.ts - targetTs)) {
        best = entry;
      }
    }
  }
  return best ? best.hits : list[0].hits;
}

async function collectLast10MinHitUpdates() {
  if (!isImsReady()) return [];
  const ranges = await fetchActiveRanges();
  const now = Date.now();
  const currentMap = new Map();

  for (const r of ranges) {
    if (!r || typeof r !== 'object') continue;
    const srv = String(r.service || r.app || r.app_name || r.name || 'Number').trim() || 'Number';
    const rawCountry = String(r.country || r.countryName || r.country_name || r.iso || '').trim();
    const rng = String(r.range || r.prefix || r.code || '').trim();
    const phone = normalizePhone(r.phoneNumber || r.number || r.phone || '');
    const cInfo = resolveCountryInfo(phone || rng || rawCountry, rawCountry);
    const hits = extractHitsValue(r);

    const effectiveRange = rng || (phone ? phone.replace(/^\+/, '').slice(0, 6) : 'auto');
    const key = `${srv.toLowerCase()}__${cInfo.key}__${effectiveRange.toLowerCase()}`;

    if (!currentMap.has(key)) {
      currentMap.set(key, {
        key,
        service: srv,
        range: effectiveRange,
        countryLabel: cInfo.label,
        countryName: cInfo.name,
        flag: cInfo.flag,
        hitsNow: 0
      });
    }
    currentMap.get(key).hitsNow += hits;
  }

  const updates = [];
  for (const [key, item] of currentMap.entries()) {
    const prev10MinHits = getHitsFromTenMinutesAgo(key, now);
    recordHitSnapshot(key, item.hitsNow, now);

    if (typeof prev10MinHits === 'number') {
      const gainedLast10Min = item.hitsNow - prev10MinHits;
      if (gainedLast10Min > 0) {
        updates.push({
          ...item,
          gainedLast10Min
        });
      }
    }
  }

  return updates;
}

async function sendTwentyMinNotificationToUsers(item) {
  if (!state.newNumberNotify || !Array.isArray(state.users) || !state.users.length) return;

  const text =
    `🔔 *20-MIN HIT UPDATE*\n` +
    `🟦 *Service:* *${item.service}*\n` +
    `🟩 *Country:* *${item.countryLabel}*\n` +
    (item.range && item.range !== 'auto' ? `🔢 *Range:* \`${item.range}\`\n` : '') +
    `🔥 *Last 10 Min Hits:* *+${item.gainedLast10Min}* (Now: *${item.hitsNow}*)`;

  const markup = {
    inline_keyboard: [
      [
        {
          text: `📞 নম্বর নিন (${item.service})`,
          callback_data: `notif_num_${encodeURIComponent(item.service)}__${encodeURIComponent(item.range || 'auto')}__${encodeURIComponent(item.countryName || '')}`,
          style: 'success'
        }
      ]
    ]
  };

  const uniqueUsers = [...new Set(state.users.map((id) => String(id).trim()).filter(Boolean))];
  for (const uid of uniqueUsers) {
    try {
      await rawSendMessage(uid, text, markup);
    } catch (e) {
      console.error(`[20M NOTIFY ERR ${uid}]:`, e.message);
    }
  }
}

setInterval(async () => {
  if (!isImsReady()) return;
  try {
    const ranges = await fetchActiveRanges();
    const now = Date.now();
    const tempMap = new Map();
    for (const r of ranges) {
      if (!r || typeof r !== 'object') continue;
      const srv = String(r.service || r.app || r.app_name || r.name || 'Number').trim() || 'Number';
      const rawCountry = String(r.country || r.countryName || r.country_name || r.iso || '').trim();
      const rng = String(r.range || r.prefix || r.code || '').trim();
      const phone = normalizePhone(r.phoneNumber || r.number || r.phone || '');
      const cInfo = resolveCountryInfo(phone || rng || rawCountry, rawCountry);
      const effectiveRange = rng || (phone ? phone.replace(/^\+/, '').slice(0, 6) : 'auto');
      const key = `${srv.toLowerCase()}__${cInfo.key}__${effectiveRange.toLowerCase()}`;
      tempMap.set(key, (tempMap.get(key) || 0) + extractHitsValue(r));
    }
    for (const [key, h] of tempMap.entries()) {
      recordHitSnapshot(key, h, now);
    }
  } catch (_) {}
}, TEN_MIN_MS);

setInterval(async () => {
  if (!state.newNumberNotify || !isImsReady()) return;
  try {
    const updates = await collectLast10MinHitUpdates();
    for (const item of updates) {
      await sendTwentyMinNotificationToUsers(item);
    }
  } catch (err) {
    console.error('[20M INTERVAL ERR]:', err.message);
  }
}, TWENTY_MIN_MS);

function buildNumberCard(sess, otp = null) {
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
    (otp ? `✅ *OTP:* \`${formatDashedOtp(otp)}\`` : `⏳ *Waiting for OTP....*`);

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
  const activeByService = new Map();

  for (const r of ranges) {
    if (!r || typeof r !== 'object') continue;
    const srv = String(r.service || r.app || r.app_name || r.name || '').trim();
    if (!srv) continue;
    const hits = extractHitsValue(r);
    const cur = activeByService.get(srv) || { rangeCount: 0, totalHits: 0 };
    cur.rangeCount += 1;
    cur.totalHits += hits;
    activeByService.set(srv, cur);
  }

  for (const c of state.customNumbers || []) {
    if (!c || c.used || !c.service) continue;
    const srv = String(c.service).trim();
    const cur = activeByService.get(srv) || { rangeCount: 0, totalHits: 0 };
    cur.rangeCount += 1;
    activeByService.set(srv, cur);
  }

  const serviceList = activeByService.size
    ? [...activeByService.keys()]
    : ['Facebook', 'Instagram', 'WhatsApp', 'Telegram'];

  serviceList.sort((a, b) => {
    const aActive = (activeByService.get(a)?.rangeCount || 0) > 0 && (activeByService.get(a)?.totalHits || 0) > 0 ? 1 : 0;
    const bActive = (activeByService.get(b)?.rangeCount || 0) > 0 && (activeByService.get(b)?.totalHits || 0) > 0 ? 1 : 0;
    if (bActive !== aActive) return bActive - aActive;
    return (activeByService.get(b)?.totalHits || 0) - (activeByService.get(a)?.totalHits || 0);
  });

  const rows = [];
  for (let i = 0; i < serviceList.length; i += 2) {
    const s1 = serviceList[i];
    const st1 = activeByService.get(s1);
    const isHot1 = (st1?.totalHits || 0) > 0;
    const label1 = isHot1 ? `🔥 ${s1}` : `🟢 ${s1}`;
    const row = [
      {
        text: label1,
        callback_data: `pick_srv_${encodeURIComponent(s1)}`,
        style: isHot1 ? 'success' : 'primary'
      }
    ];
    if (serviceList[i + 1]) {
      const s2 = serviceList[i + 1];
      const st2 = activeByService.get(s2);
      const isHot2 = (st2?.totalHits || 0) > 0;
      const label2 = isHot2 ? `🔥 ${s2}` : `🟢 ${s2}`;
      row.push({
        text: label2,
        callback_data: `pick_srv_${encodeURIComponent(s2)}`,
        style: isHot2 ? 'success' : 'primary'
      });
    }
    rows.push(row);
  }

  const hotNames = serviceList.filter((s) => (activeByService.get(s)?.totalHits || 0) > 0);
  const boardText =
    `📲 *Select a Service*\n` +
    (hotNames.length ? `🔥 *Active Now:* ${hotNames.map((n) => `*${n}*`).join(', ')}` : `🟢 *Select a service below*`);

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
    const rawCountry = String(r?.country || r?.countryName || r?.iso || '').trim();
    if (!rawRange && !rawCountry) continue;
    const cInfo = resolveCountryInfo(rawRange, rawCountry);
    if (!seenCountries.has(cInfo.key)) {
      seenCountries.set(cInfo.key, { label: cInfo.label, range: rawRange || rawCountry || 'auto' });
    }
  }

  for (const c of state.customNumbers || []) {
    if (!c || c.used || String(c.service || '').toLowerCase() !== cleanService.toLowerCase()) continue;
    const cInfo = resolveCountryInfo(c.phone, c.countryName || c.range);
    if (!seenCountries.has(cInfo.key)) {
      seenCountries.set(cInfo.key, { label: cInfo.label, range: c.range || 'auto' });
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

  const statusData = await fetchPanelBalanceRaw();
  const rate = state.otpReward;
  const totalNums = state.numberHistory.length;
  const totalOtps = state.otpStats.total;
  const unusedCustom = (state.customNumbers || []).filter((x) => !x.used).length;
  const apiStatusText = statusData?.status === 'connected'
    ? `Connected (${statusData.rangesCount} ranges, ${statusData.numbersCount} nos)`
    : 'Not Connected / Check URL & Token';

  const text =
    (statusNote ? `🟨 *STATUS BOARD*\n🟩 *${statusNote}*\n\n` : '') +
    `🟦 *IMS ADMIN CONTROL BOARD*\n` +
    `🟩 *Users:* *${state.users.length}* | *Numbers:* *${totalNums}* | *OTPs:* *${totalOtps}*\n` +
    `🟪 *IMS Status:* *${apiStatusText}* | *Rate:* *৳${state.rewardEnabled ? rate : 0}*\n` +
    `🟦 *IMS URL:* \`${getImsBaseUrl() || 'Not Set'}\`\n` +
    `🟨 *API Token:* \`${maskImsToken(getImsApiToken())}\`\n` +
    `🟩 *Custom Pool:* *${unusedCustom} টি রেডি নম্বর*\n` +
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

async function openPanelAndNumberManagerBoard(ctx, preferEdit = false) {
  const unusedCustom = (state.customNumbers || []).filter((x) => !x.used).length;
  const text =
    `⚙️ *IMS PANEL & NUMBER MANAGER*\n` +
    `🟦 *IMS Base URL:* \`${getImsBaseUrl() || 'Not Set'}\`\n` +
    `🟨 *IMS API Token:* \`${maskImsToken(getImsApiToken())}\`\n` +
    `🟩 *Ready Added Numbers:* *${unusedCustom} টি*\n\n` +
    `➕ *Add Number* চাপলে ধাপে ধাপে:\n` +
    `১) সার্ভিস → ২) দেশ → ৩) নম্বর বা নম্বর ফাইল দিতে পারবেন।`;

  const markup = {
    inline_keyboard: [
      [
        { text: '🌐 Set IMS URL', callback_data: 'adm_set_baseurl', style: 'primary' },
        { text: '🔑 Set API Token', callback_data: 'adm_set_apikey', style: 'primary' }
      ],
      [
        { text: '➕ Add Number', callback_data: 'adm_add_number', style: 'success' }
      ],
      [
        { text: '⬅️ Back to Admin', callback_data: 'adm_back_board', style: 'danger' }
      ]
    ]
  };

  return sendCleanBoard(ctx, text, markup, preferEdit);
}

setInterval(async () => {
  for (const [uid, sess] of state.userSession.entries()) {
    if (!sess || !sess.item || sess.otpDelivered || sess.autoChecker === false) continue;
    try {
      const otp = await requestOtpFromIms(sess.item.orderId, sess.item.phone);
      if (otp) {
        sess.otpDelivered = true;
        sess.otpValue = otp;
        state.userSession.set(uid, sess);
        await recordTraffic(sess.item.phone);

        if (state.rewardEnabled && Number(state.otpReward) > 0) {
          const curBal = Number(state.balances[String(uid)] || 0);
          const nextBal = Number((curBal + Number(state.otpReward)).toFixed(2));
          state.balances[String(uid)] = nextBal;
          await dbPut(`balances/${uid}`, nextBal);
        }

        if (sess.chatId && sess.cardMsgId) {
          const updatedCard = buildNumberCard(sess, otp);
          try {
            await rawEditMessageText(sess.chatId, sess.cardMsgId, updatedCard.text, updatedCard.reply_markup);
          } catch (_) {}
        }

        await deliverOtpToUserAndGroup(uid, sess.item, otp, { sendToUser: true });
      }
    } catch (err) {
      console.error('[GET-OTP ERR]:', err.response?.data || err.message);
    }
  }
}, OTP_POLL_MS);

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
    const card = buildNumberCard(sess, sess.otpValue || null);
    return sendCleanBoard(ctx, card.text, card.reply_markup, true);
  }
  return openServiceMenu(ctx, true);
});

async function assignAndShowNumber(ctx, service, range, preferEdit = true) {
  const cleanService = String(service || 'Telegram').trim() || 'Telegram';
  const cleanRange = state.rangeEnabled ? String(range || 'auto').trim() || 'auto' : 'auto';

  try {
    const res = await requestGetNumberFromIms(cleanService, cleanRange);
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
      otpDelivered: false,
      otpValue: null,
      chatId: ctx.chat?.id,
      cardMsgId: null
    };
    state.userSession.set(ctx.from.id, sess);
    await saveNumberToHistory(ctx.from.id, res);
    const card = buildNumberCard(sess, null);
    const sent = await sendCleanBoard(ctx, card.text, card.reply_markup, preferEdit);
    if (sent?.message_id) {
      sess.cardMsgId = sent.message_id;
      sess.chatId = ctx.chat?.id;
      state.userSession.set(ctx.from.id, sess);
    }
  } catch (err) {
    console.error('[GET-NUMBER ERR]:', err.response?.data || err.message);
    await sendCleanBoard(
      ctx,
      `🟧 *PANEL ERROR BOARD*\n🟦 *IMS প্যানেল থেকে নম্বর আনতে সমস্যা হয়েছে*`,
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

bot.action(/^notif_num_(.+)__(.+?)__(.*)$/, async (ctx) => {
  const service = decodeURIComponent(ctx.match[1] || 'Telegram');
  const range = decodeURIComponent(ctx.match[2] || 'auto');
  const country = decodeURIComponent(ctx.match[3] || '');
  await ctx.answerCbQuery('নোটিফিকেশন থেকে নম্বর আনা হচ্ছে...');
  await handleNotificationNumberAction(ctx, service, range, country);
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
  const card = buildNumberCard(sess, sess.otpValue || null);
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
  const card = buildNumberCard(sess, sess.otpValue || null);
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

bot.hears(/^⚙️ Panel & Add Num(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  await openPanelAndNumberManagerBoard(ctx, false);
});

bot.action('adm_set_baseurl', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, { step: 'baseurl' });
  await ctx.answerCbQuery();
  await sendCleanBoard(
    ctx,
    `🌐 *SET IMS PANEL URL*\n🟦 *IMS REST Base URL পাঠান (যেমন: \`https://imssms.org/api/v1/rest\`)*`,
    { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'adm_back_mgr', style: 'danger' }]] },
    true
  );
});

bot.action('adm_set_apikey', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, { step: 'key' });
  await ctx.answerCbQuery();
  await sendCleanBoard(
    ctx,
    `🔑 *SET IMS API TOKEN*\n🟦 *IMS প্যানেলের API Token পাঠান*`,
    { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'adm_back_mgr', style: 'danger' }]] },
    true
  );
});

bot.action('adm_add_number', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, { step: 'add_num_service' });
  await ctx.answerCbQuery();
  await sendCleanBoard(
    ctx,
    `➕ *ADD NUMBER — ধাপ ১/৩ (সার্ভিস)*\n` +
      `🟩 *সার্ভিসের নাম লিখুন (যেমন: \`Telegram\`, \`WhatsApp\`, \`Facebook\`)*`,
    { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'adm_back_mgr', style: 'danger' }]] },
    true
  );
});

bot.action('adm_back_mgr', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.delete(ctx.from.id);
  await ctx.answerCbQuery();
  await openPanelAndNumberManagerBoard(ctx, true);
});

bot.action('adm_back_board', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.delete(ctx.from.id);
  await ctx.answerCbQuery();
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
  state.cachedNumbers = null;
  await dbPut('config/apiUrlEnabled', state.apiEnabled);
  await showAdminBoardInReplyMenu(ctx, state.apiEnabled ? '✅ IMS API চালু হয়েছে।' : '⛔ IMS API বন্ধ হয়েছে।');
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
  await showAdminBoardInReplyMenu(ctx, state.newNumberNotify ? '🔔 ২০-মিনিট হিট Alert চালু।' : '🔕 ২০-মিনিট হিট Alert বন্ধ।');
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

bot.hears(/^👤 Owner(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, { step: 'owner' });
  await sendCleanBoard(ctx, '👤 *OWNER BOARD*\n🟦 *নতুন Owner ইউজারনেম পাঠান (@username)*', getAdminPanelAsMainKeyboard());
});

bot.hears(/^📢 Main Group(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, { step: 'main_grp' });
  await sendCleanBoard(ctx, '📢 *MAIN GROUP BOARD*\n🟦 *Main Group লিংক ও Chat ID পাঠান*', getAdminPanelAsMainKeyboard());
});

bot.hears(/^📩 OTP Group(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, { step: 'otp_grp' });
  await sendCleanBoard(
    ctx,
    '📩 *OTP GROUP BOARD*\n🟩 *OTP Group লিংক ও Chat ID পাঠান (প্রাইভেট লিংক হলে Chat ID দিন)*',
    getAdminPanelAsMainKeyboard()
  );
});

bot.hears(/^📡 Range Group(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, { step: 'rng_grp' });
  await sendCleanBoard(ctx, '📡 *RANGE GROUP BOARD*\n🟦 *Range Group লিংক ও Chat ID পাঠান*', getAdminPanelAsMainKeyboard());
});

bot.hears(/^📣 Broadcast(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.adminWizard.set(ctx.from.id, { step: 'bcast' });
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
  const preview = JSON.stringify(data || { error: 'IMS API response unavailable' }, null, 2).slice(0, 1000);
  await sendCleanBoard(ctx, `🧪 *IMS STATUS BOARD*\n🟦 \`${preview}\``, getAdminPanelAsMainKeyboard());
});

bot.hears(/^📡 Range API(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  state.cachedRanges = null;
  const list = await fetchActiveRanges();
  const preview = JSON.stringify(list.slice(0, 5), null, 2).slice(0, 1000);
  await sendCleanBoard(ctx, `📡 *GET /ranges (${list.length}) BOARD*\n🟪 \`${preview}\``, getAdminPanelAsMainKeyboard());
});

bot.hears(/^📊 Num Status(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const st = await getPanelAndPoolNumberUsageStats();

  const imsSection = st.imsError
    ? `🟨 *IMS Panel Numbers:* *${st.imsError}*`
    : `🟦 *IMS Panel Numbers:*\n` +
      `  • মোট নম্বর: *${st.imsTotal}*\n` +
      `  • ব্যবহার হয়েছে: *${st.imsUsed}*\n` +
      `  • ব্যবহার হয়নি: *${st.imsUnused}*`;

  const customSection =
    `🟩 *Custom Pool Numbers:*\n` +
    `  • মোট নম্বর: *${st.customTotal}*\n` +
    `  • ব্যবহার হয়েছে: *${st.customUsed}*\n` +
    `  • ব্যবহার হয়নি: *${st.customUnused}*`;

  const text = `📊 *NUMBER USAGE STATUS*\n\n${imsSection}\n\n${customSection}`;
  await sendCleanBoard(ctx, text, getAdminPanelAsMainKeyboard());
});

bot.hears(/^🔗 Endpoints(?:\s*⋮⋮⋮⋮)?$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const ep = getImsEndpoints();
  const text =
    `🔗 *IMS API ENDPOINTS*\n\n` +
    `• Ranges: ${ep.ranges || 'Not Set'}\n` +
    `• Numbers: ${ep.numbers || 'Not Set'}\n` +
    `• CDRs: ${ep.cdrs || 'Not Set'}\n` +
    `• Messages: ${ep.messages || 'Not Set'}`;
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

async function commitAddedNumbers(ctx, wiz) {
  const srv = String(wiz.service || 'Telegram').trim() || 'Telegram';
  const rawCountry = String(wiz.country || '').trim();
  const phones = Array.isArray(wiz.phones) ? wiz.phones : [];

  const addedEntries = [];
  for (const phone of phones) {
    const cInfo = resolveCountryInfo(rawCountry || phone, phone);
    const resolvedRange = phone.replace(/^\+/, '').slice(0, 6);
    const entry = {
      service: srv,
      phone,
      countryKey: cInfo.key,
      countryName: cInfo.name,
      countryLabel: cInfo.label,
      flag: cInfo.flag,
      range: resolvedRange,
      used: false,
      addedAt: new Date().toISOString()
    };
    addedEntries.push(entry);
  }

  state.customNumbers = [...addedEntries, ...(state.customNumbers || [])].slice(0, 300);
  await dbPut('customNumbers/list', state.customNumbers);

  const firstCountry = addedEntries[0]?.countryLabel || resolveCountryInfo(rawCountry).label;
  await sendNewNumberNotificationToUsers({
    service: srv,
    countryLabel: firstCountry,
    count: addedEntries.length
  });

  return showAdminBoardInReplyMenu(
    ctx,
    `✅ ${addedEntries.length} টি নম্বর যুক্ত হয়েছে (${firstCountry} • ${srv})`
  );
}

bot.on('document', async (ctx) => {
  const uid = ctx.from.id;
  await registerUser(uid);
  if (!ADMIN_IDS.includes(uid) || !state.adminWizard.has(uid)) return;

  const wiz = state.adminWizard.get(uid);
  if (wiz.step !== 'add_num_numbers') return;

  try {
    const fileId = ctx.message.document.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const resp = await axios.get(fileLink.href, { responseType: 'text', timeout: 15000 });
    const phones = parseNumbersFromInput(resp.data || '');

    if (!phones.length) {
      return sendCleanBoard(
        ctx,
        `⚠️ *ফাইলে কোনো সঠিক ফোন নম্বর পাওয়া যায়নি।*\nআবার নম্বর অথবা ফাইল পাঠান।`,
        { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'adm_back_mgr', style: 'danger' }]] },
        false
      );
    }

    state.adminWizard.delete(uid);
    wiz.phones = phones;
    return commitAddedNumbers(ctx, wiz);
  } catch (err) {
    console.error('[DOC ADD NUM ERR]:', err.message);
    return showAdminBoardInReplyMenu(ctx, '⚠️ নম্বর ফাইল পড়তে সমস্যা হয়েছে।');
  }
});

bot.on('text', async (ctx) => {
  const uid = ctx.from.id;
  await registerUser(uid);
  const txt = ctx.message.text.trim();

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
    const wiz = state.adminWizard.get(uid);
    const mode = wiz.step;

    if (mode === 'baseurl') {
      state.adminWizard.delete(uid);
      const cleanedUrl = txt.replace(/\/+$/, '');
      if (!/^https?:\/\/.+/i.test(cleanedUrl)) {
        return showAdminBoardInReplyMenu(ctx, '⚠️ সঠিক http/https Base URL দিন।');
      }
      state.baseUrl = cleanedUrl;
      state.cachedRanges = null;
      state.cachedNumbers = null;
      hitSnapshotsByKey.clear();
      await dbPut('config/baseUrl', cleanedUrl);
      return showAdminBoardInReplyMenu(ctx, `✅ নতুন IMS Base URL সেট হয়েছে: ${cleanedUrl}`);
    }

    if (mode === 'key') {
      state.adminWizard.delete(uid);
      state.apiKey = txt;
      state.cachedRanges = null;
      state.cachedNumbers = null;
      await dbPut('config/apiKey', txt);
      return showAdminBoardInReplyMenu(ctx, '✅ নতুন IMS API Token সেট হয়েছে।');
    }

    if (mode === 'add_num_service') {
      wiz.service = txt;
      wiz.step = 'add_num_country';
      state.adminWizard.set(uid, wiz);
      return sendCleanBoard(
        ctx,
        `➕ *ADD NUMBER — ধাপ ২/৩ (দেশ)*\n` +
          `🟦 *সার্ভিস:* *${txt}*\n` +
          `🟩 *দেশের নাম বা কোড লিখুন (যেমন: \`Togo\`, \`Bangladesh\`, \`US\`)*`,
        { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'adm_back_mgr', style: 'danger' }]] },
        false
      );
    }

    if (mode === 'add_num_country') {
      wiz.country = txt;
      wiz.step = 'add_num_numbers';
      state.adminWizard.set(uid, wiz);
      const cInfo = resolveCountryInfo(txt);
      return sendCleanBoard(
        ctx,
        `➕ *ADD NUMBER — ধাপ ৩/৩ (নম্বর বা নম্বর ফাইল)*\n` +
          `🟦 *সার্ভিস:* *${wiz.service}* | *দেশ:* *${cInfo.label}*\n` +
          `🟩 *একটি নম্বর, একাধিক নম্বর (প্রতি লাইনে একটি), অথবা \`.txt\` নম্বর ফাইল পাঠান*`,
        { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'adm_back_mgr', style: 'danger' }]] },
        false
      );
    }

    if (mode === 'add_num_numbers') {
      const phones = parseNumbersFromInput(txt);
      if (!phones.length) {
        return sendCleanBoard(
          ctx,
          `⚠️ *সঠিক ফোন নম্বর পাওয়া যায়নি।*\nনম্বর অথবা \`.txt\` ফাইল পাঠান।`,
          { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'adm_back_mgr', style: 'danger' }]] },
          false
        );
      }
      state.adminWizard.delete(uid);
      wiz.phones = phones;
      return commitAddedNumbers(ctx, wiz);
    }

    state.adminWizard.delete(uid);

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
    const [
      u, b, st, hist, baseUrlDb, key, customPool,
      en, rngEn, rewEn, notifEn, shMode, jc,
      mLink, mId, oLink, oId, rLink, rId, own, vUsers
    ] = await Promise.all([
      dbGet('users/list'),
      dbGet('balances'),
      dbGet('stats/otps'),
      dbGet('history/numbers'),
      dbGet('config/baseUrl'),
      dbGet('config/apiKey'),
      dbGet('customNumbers/list'),
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
      dbGet('verifiedUsers')
    ]);
    if (Array.isArray(u)) state.users = u;
    if (b && typeof b === 'object') state.balances = b;
    if (st && typeof st === 'object') {
      state.otpStats = { total: Number(st.total || 0), byCountry: st.byCountry || st.byRange || {} };
    }
    if (Array.isArray(hist)) state.numberHistory = hist;
    if (baseUrlDb) state.baseUrl = String(baseUrlDb).trim();
    if (key) state.apiKey = key;
    if (Array.isArray(customPool)) state.customNumbers = customPool;
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
  }

  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'মূল মেনু চালু করুন' },
      { command: 'getnumber', description: 'নতুন নম্বর নিন' }
    ]);
  } catch (_) {}

  await bot.launch();
  console.log('IMS REST Bot running with ranges/numbers/messages support, 20-min hit updates, Num Status, and exhaustion guard...');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
