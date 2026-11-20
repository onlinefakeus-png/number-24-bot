const http = require("http");
const { Telegraf, Markup } = require("telegraf");

const BOT_TOKEN =
  process.env.BOT_TOKEN || "8858718658:AAEseXDeVWZdDAkTsC2cu_fDYrxsZuvelAE";

const ADMIN_IDS = [8771921458];

const groupConfig = {
  mainGroupLink: process.env.MAIN_GROUP_LINK || "https://t.me/your_main_group_link",
  mainGroupChatId: process.env.MAIN_GROUP_CHAT_ID || "",
  otpGroupLink: process.env.OTP_GROUP_LINK || "https://t.me/your_otp_group_link",
  otpGroupChatId: process.env.OTP_GROUP_CHAT_ID || "",
  strictCheck: true,
};

let runtimePanelApiUrl = (process.env.PANEL_API_URL || "").trim();
let runtimePanelApiKey = (process.env.PANEL_API_KEY || "").trim();

const FIREBASE_DB_URL =
  process.env.FIREBASE_DB_URL ||
  "https://your-project-default-rtdb.firebaseio.com/";

const KEEP_ALIVE_URL = (
  process.env.KEEP_ALIVE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "https://number-24-bot-1.onrender.com"
).trim();

const bot = new Telegraf(BOT_TOKEN);

const numbersDatabase = {};
const serviceOrder = [];

const knownUsers = new Set();
const verifiedUsers = new Set();
const userSession = new Map();
const adminState = new Map();
const otpWatchers = new Map();

let firebaseReady = false;
let saveQueue = Promise.resolve();

function hasValidFirebaseUrl() {
  return (
    typeof FIREBASE_DB_URL === "string" &&
    FIREBASE_DB_URL.startsWith("https://") &&
    !FIREBASE_DB_URL.includes("your-project")
  );
}

function getFirebaseBaseUrl() {
  return FIREBASE_DB_URL.replace(/\/+$/, "");
}

async function firebaseGet(path) {
  if (!hasValidFirebaseUrl()) return null;
  const cleanPath = path.replace(/^\/+/, "");
  const res = await fetch(`${getFirebaseBaseUrl()}/${cleanPath}.json`);
  if (!res.ok) {
    throw new Error(`Firebase GET failed (${res.status}) for ${cleanPath}`);
  }
  return res.json();
}

async function firebasePut(path, data) {
  if (!hasValidFirebaseUrl()) return false;
  const cleanPath = path.replace(/^\/+/, "");
  const res = await fetch(`${getFirebaseBaseUrl()}/${cleanPath}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Firebase PUT failed (${res.status}) for ${cleanPath}`);
  }
  return true;
}

function enqueueFirebaseSave(fn) {
  if (!hasValidFirebaseUrl()) return Promise.resolve();
  saveQueue = saveQueue
    .then(fn)
    .catch((err) => console.error("Firebase save error:", err.message));
  return saveQueue;
}

async function saveDatabaseState() {
  return enqueueFirebaseSave(async () => {
    await firebasePut("bot_data/numbersDatabase", numbersDatabase);
    await firebasePut("bot_data/serviceOrder", serviceOrder);
  });
}

async function saveGroupsState() {
  return enqueueFirebaseSave(async () => {
    await firebasePut("bot_data/groupConfig", groupConfig);
  });
}

async function saveApiState() {
  return enqueueFirebaseSave(async () => {
    await firebasePut("bot_data/panelApi", {
      apiUrl: runtimePanelApiUrl,
      apiKey: runtimePanelApiKey,
    });
  });
}

async function saveKnownUsersState() {
  return enqueueFirebaseSave(async () => {
    await firebasePut("bot_data/knownUsers", Array.from(knownUsers));
  });
}

async function loadStateFromFirebase() {
  if (!hasValidFirebaseUrl()) {
    console.log("Firebase DB URL not configured yet; using memory store.");
    return;
  }

  try {
    const [savedDb, savedOrder, savedGroups, savedApi, savedUsers] =
      await Promise.all([
        firebaseGet("bot_data/numbersDatabase").catch(() => null),
        firebaseGet("bot_data/serviceOrder").catch(() => null),
        firebaseGet("bot_data/groupConfig").catch(() => null),
        firebaseGet("bot_data/panelApi").catch(() => null),
        firebaseGet("bot_data/knownUsers").catch(() => null),
      ]);

    if (savedDb && typeof savedDb === "object") {
      for (const key of Object.keys(numbersDatabase)) {
        delete numbersDatabase[key];
      }
      for (const [srvKey, srvVal] of Object.entries(savedDb)) {
        if (srvVal && typeof srvVal === "object") {
          numbersDatabase[srvKey] = {};
          for (const [cntKey, cntVal] of Object.entries(srvVal)) {
            if (cntVal && typeof cntVal === "object") {
              numbersDatabase[srvKey][cntKey] = {
                name: cntVal.name || cntKey,
                flag: cntVal.flag || "🏳️",
                cc: cntVal.cc || "",
                numbers: Array.isArray(cntVal.numbers)
                  ? [...cntVal.numbers]
                  : [],
              };
            }
          }
        }
      }
    }

    if (Array.isArray(savedOrder)) {
      serviceOrder.length = 0;
      for (const k of savedOrder) {
        if (k && !serviceOrder.includes(k)) {
          serviceOrder.push(k);
        }
      }
    }

    for (const k of Object.keys(numbersDatabase)) {
      if (!serviceOrder.includes(k)) {
        serviceOrder.push(k);
      }
    }

    if (savedGroups && typeof savedGroups === "object") {
      if (savedGroups.mainGroupLink) {
        groupConfig.mainGroupLink = savedGroups.mainGroupLink;
      }
      if (typeof savedGroups.mainGroupChatId === "string") {
        groupConfig.mainGroupChatId = savedGroups.mainGroupChatId;
      }
      if (savedGroups.otpGroupLink) {
        groupConfig.otpGroupLink = savedGroups.otpGroupLink;
      }
      if (typeof savedGroups.otpGroupChatId === "string") {
        groupConfig.otpGroupChatId = savedGroups.otpGroupChatId;
      }
      if (typeof savedGroups.strictCheck === "boolean") {
        groupConfig.strictCheck = savedGroups.strictCheck;
      }
    }

    if (savedApi && typeof savedApi === "object") {
      if (!process.env.PANEL_API_URL && typeof savedApi.apiUrl === "string") {
        runtimePanelApiUrl = savedApi.apiUrl.trim();
      }
      if (!process.env.PANEL_API_KEY && typeof savedApi.apiKey === "string") {
        runtimePanelApiKey = savedApi.apiKey.trim();
      }
    }

    if (Array.isArray(savedUsers)) {
      for (const uid of savedUsers) {
        if (uid) knownUsers.add(Number(uid) || uid);
      }
    }

    firebaseReady = true;
    console.log("Loaded persisted bot state from Firebase Realtime Database.");
  } catch (err) {
    console.error("Failed to load state from Firebase:", err.message);
  }
}

const COUNTRY_LOOKUP = {
  bangladesh: { name: "Bangladesh", flag: "🇧🇩", cc: "+880" },
  bd: { name: "Bangladesh", flag: "🇧🇩", cc: "+880" },
  বাংলাদেশ: { name: "Bangladesh", flag: "🇧🇩", cc: "+880" },

  india: { name: "India", flag: "🇮🇳", cc: "+91" },
  ভারত: { name: "India", flag: "🇮🇳", cc: "+91" },

  pakistan: { name: "Pakistan", flag: "🇵🇰", cc: "+92" },
  পাকিস্তান: { name: "Pakistan", flag: "🇵🇰", cc: "+92" },

  cuba: { name: "Cuba", flag: "🇨🇺", cc: "+53" },
  কিউবা: { name: "Cuba", flag: "🇨🇺", cc: "+53" },

  tanzania: { name: "Tanzania", flag: "🇹🇿", cc: "+255" },
  তানজানিয়া: { name: "Tanzania", flag: "🇹🇿", cc: "+255" },

  united_states: { name: "United States", flag: "🇺🇸", cc: "+1" },
  usa: { name: "United States", flag: "🇺🇸", cc: "+1" },
  us: { name: "United States", flag: "🇺🇸", cc: "+1" },
  america: { name: "United States", flag: "🇺🇸", cc: "+1" },
  যুক্তরাষ্ট্র: { name: "United States", flag: "🇺🇸", cc: "+1" },

  canada: { name: "Canada", flag: "🇨🇦", cc: "+1" },
  কানাডা: { name: "Canada", flag: "🇨🇦", cc: "+1" },

  united_kingdom: { name: "United Kingdom", flag: "🇬🇧", cc: "+44" },
  uk: { name: "United Kingdom", flag: "🇬🇧", cc: "+44" },
  যুক্তরাজ্য: { name: "United Kingdom", flag: "🇬🇧", cc: "+44" },

  egypt: { name: "Egypt", flag: "🇪🇬", cc: "+20" },
  মিশর: { name: "Egypt", flag: "🇪🇬", cc: "+20" },

  georgia: { name: "Georgia", flag: "🇬🇪", cc: "+995" },
  guatemala: { name: "Guatemala", flag: "🇬🇹", cc: "+502" },
  guinea: { name: "Guinea", flag: "🇬🇳", cc: "+224" },
  guinea_bissau: { name: "Guinea Bissau", flag: "🇬🇼", cc: "+245" },
  haiti: { name: "Haiti", flag: "🇭🇹", cc: "+509" },
  iran: { name: "Iran", flag: "🇮🇷", cc: "+98" },
  laos: { name: "Laos", flag: "🇱🇦", cc: "+856" },
  liberia: { name: "Liberia", flag: "🇱🇷", cc: "+231" },
  maldives: { name: "Maldives", flag: "🇲🇻", cc: "+960" },
  mali: { name: "Mali", flag: "🇲🇱", cc: "+223" },
  senegal: { name: "Senegal", flag: "🇸🇳", cc: "+221" },
  sudan: { name: "Sudan", flag: "🇸🇩", cc: "+249" },
  tajikistan: { name: "Tajikistan", flag: "🇹🇯", cc: "+992" },
  togo: { name: "Togo", flag: "🇹🇬", cc: "+228" },
  yemen: { name: "Yemen", flag: "🇾🇪", cc: "+967" },
  zambia: { name: "Zambia", flag: "🇿🇲", cc: "+260" },

  indonesia: { name: "Indonesia", flag: "🇮🇩", cc: "+62" },
  ইন্দোনেশিয়া: { name: "Indonesia", flag: "🇮🇩", cc: "+62" },

  malaysia: { name: "Malaysia", flag: "🇲🇾", cc: "+60" },
  মালয়েশিয়া: { name: "Malaysia", flag: "🇲🇾", cc: "+60" },

  philippines: { name: "Philippines", flag: "🇵🇭", cc: "+63" },
  ফিলিপাইন: { name: "Philippines", flag: "🇵🇭", cc: "+63" },

  vietnam: { name: "Vietnam", flag: "🇻🇳", cc: "+84" },
  ভিয়েতনাম: { name: "Vietnam", flag: "🇻🇳", cc: "+84" },

  thailand: { name: "Thailand", flag: "🇹🇭", cc: "+66" },
  থাইল্যান্ড: { name: "Thailand", flag: "🇹🇭", cc: "+66" },

  brazil: { name: "Brazil", flag: "🇧🇷", cc: "+55" },
  ব্রাজিল: { name: "Brazil", flag: "🇧🇷", cc: "+55" },

  russia: { name: "Russia", flag: "🇷🇺", cc: "+7" },
  রাশিয়া: { name: "Russia", flag: "🇷🇺", cc: "+7" },

  germany: { name: "Germany", flag: "🇩🇪", cc: "+49" },
  জার্মানি: { name: "Germany", flag: "🇩🇪", cc: "+49" },

  france: { name: "France", flag: "🇫🇷", cc: "+33" },
  ফ্রান্স: { name: "France", flag: "🇫🇷", cc: "+33" },

  italy: { name: "Italy", flag: "🇮🇹", cc: "+39" },
  ইতালি: { name: "Italy", flag: "🇮🇹", cc: "+39" },

  spain: { name: "Spain", flag: "🇪🇸", cc: "+34" },
  স্পেন: { name: "Spain", flag: "🇪🇸", cc: "+34" },

  australia: { name: "Australia", flag: "🇦🇺", cc: "+61" },
  অস্ট্রেলিয়া: { name: "Australia", flag: "🇦🇺", cc: "+61" },

  saudi_arabia: { name: "Saudi Arabia", flag: "🇸🇦", cc: "+966" },
  সৌদি_আরব: { name: "Saudi Arabia", flag: "🇸🇦", cc: "+966" },

  uae: { name: "United Arab Emirates", flag: "🇦🇪", cc: "+971" },
  united_arab_emirates: { name: "United Arab Emirates", flag: "🇦🇪", cc: "+971" },
  আমিরাত: { name: "United Arab Emirates", flag: "🇦🇪", cc: "+971" },

  turkey: { name: "Turkey", flag: "🇹🇷", cc: "+90" },
  তুরস্ক: { name: "Turkey", flag: "🇹🇷", cc: "+90" },

  nepal: { name: "Nepal", flag: "🇳🇵", cc: "+977" },
  নেপাল: { name: "Nepal", flag: "🇳🇵", cc: "+977" },

  sri_lanka: { name: "Sri Lanka", flag: "🇱🇰", cc: "+94" },
  শ্রীলঙ্কা: { name: "Sri Lanka", flag: "🇱🇰", cc: "+94" },

  nigeria: { name: "Nigeria", flag: "🇳🇬", cc: "+234" },
  নাইজেরিয়া: { name: "Nigeria", flag: "🇳🇬", cc: "+234" },

  kenya: { name: "Kenya", flag: "🇰🇪", cc: "+254" },
  কেনিয়া: { name: "Kenya", flag: "🇰🇪", cc: "+254" },

  south_africa: { name: "South Africa", flag: "🇿🇦", cc: "+27" },
  দক্ষিণ_আফ্রিকা: { name: "South Africa", flag: "🇿🇦", cc: "+27" },

  morocco: { name: "Morocco", flag: "🇲🇦", cc: "+212" },
  মরক্কো: { name: "Morocco", flag: "🇲🇦", cc: "+212" },

  mexico: { name: "Mexico", flag: "🇲🇽", cc: "+52" },
  মেক্সিকো: { name: "Mexico", flag: "🇲🇽", cc: "+52" },

  colombia: { name: "Colombia", flag: "🇨🇴", cc: "+57" },
  কলম্বিয়া: { name: "Colombia", flag: "🇨🇴", cc: "+57" },

  argentina: { name: "Argentina", flag: "🇦🇷", cc: "+54" },
  আর্জেন্টিনা: { name: "Argentina", flag: "🇦🇷", cc: "+54" },

  peru: { name: "Peru", flag: "🇵🇪", cc: "+51" },
  পেরু: { name: "Peru", flag: "🇵🇪", cc: "+51" },

  poland: { name: "Poland", flag: "🇵🇱", cc: "+48" },
  পোল্যান্ড: { name: "Poland", flag: "🇵🇱", cc: "+48" },

  netherlands: { name: "Netherlands", flag: "🇳🇱", cc: "+31" },
  নেদারল্যান্ডস: { name: "Netherlands", flag: "🇳🇱", cc: "+31" },

  ukraine: { name: "Ukraine", flag: "🇺🇦", cc: "+380" },
  ইউক্রেন: { name: "Ukraine", flag: "🇺🇦", cc: "+380" },
};

function trackUser(ctx) {
  const uid = ctx?.from?.id;
  if (uid && !knownUsers.has(uid)) {
    knownUsers.add(uid);
    saveKnownUsersState();
  }
}

function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

function extractChatTargetFromLink(link) {
  if (!link) return "";
  const match = link.match(/t\.me\/(?!\+)([a-zA-Z0-9_]+)/);
  return match ? `@${match[1]}` : "";
}

async function isMemberOfGroup(userId, explicitChatId, fallbackLink) {
  if (!groupConfig.strictCheck) return true;
  const target = (
    explicitChatId ||
    extractChatTargetFromLink(fallbackLink) ||
    ""
  ).trim();
  if (!target) return true;

  try {
    const member = await bot.telegram.getChatMember(target, userId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch (err) {
    console.error(`Group check failed for ${target}:`, err.message);
    return false;
  }
}

async function checkBothGroupsJoined(userId) {
  if (isAdmin(userId)) return true;
  const mainOk = await isMemberOfGroup(
    userId,
    groupConfig.mainGroupChatId,
    groupConfig.mainGroupLink
  );
  const otpOk = await isMemberOfGroup(
    userId,
    groupConfig.otpGroupChatId,
    groupConfig.otpGroupLink
  );
  return mainOk && otpOk;
}

function joinRequirementKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url("📢 Join Main Group", groupConfig.mainGroupLink)],
    [Markup.button.url("💬 Join OTP Group", groupConfig.otpGroupLink)],
    [Markup.button.callback("✅ Verify", "verify_groups")],
  ]);
}

async function promptJoinGroups(ctx, isEdit = false) {
  const text =
    "🔒 *বট ব্যবহারের আগে দুটি গ্রুপে জয়েন করুন*\n" +
    "━━━━━━━━━━━━━━━━━━\n" +
    "১️⃣ নিচের *Join Main Group* বাটনে চাপ দিয়ে মেইন গ্রুপে যুক্ত হোন\n" +
    "২️⃣ *Join OTP Group* বাটনে চাপ দিয়ে ওটিপি গ্রুপে যুক্ত হোন\n" +
    "৩️⃣ উভয় গ্রুপে যুক্ত হওয়ার পর নিচে *✅ Verify* বাটনে চাপ দিন।";

  const extra = {
    parse_mode: "Markdown",
    ...joinRequirementKeyboard(),
  };

  if (isEdit) {
    try {
      return await ctx.editMessageText(text, extra);
    } catch (e) {
      return await ctx.reply(text, extra);
    }
  }
  return ctx.reply(text, extra);
}

async function ensureVerifiedAccess(ctx) {
  const uid = ctx?.from?.id;
  if (!uid) return false;
  trackUser(ctx);

  if (isAdmin(uid)) return true;
  if (verifiedUsers.has(uid)) return true;

  const joined = await checkBothGroupsJoined(uid);
  if (joined) {
    verifiedUsers.add(uid);
    return true;
  }

  await promptJoinGroups(ctx, false);
  return false;
}

function getPanelApiUrl() {
  return (runtimePanelApiUrl || "").trim();
}

function getPanelApiKey() {
  return (runtimePanelApiKey || "").trim();
}

function isPanelApiConfigured() {
  return Boolean(getPanelApiUrl() && getPanelApiKey());
}

function maskApiKey(key) {
  if (!key) return "Not set";
  if (key.length <= 6) return "******";
  return `${key.slice(0, 3)}***${key.slice(-3)}`;
}

function makeKey(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function titleCase(str) {
  return str
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function resolveCountryDetails(rawInput) {
  const parts = rawInput.split(",").map((p) => p.trim());
  const rawName = parts[0] || "";
  const cKey = makeKey(rawName);
  if (!cKey) return null;

  const matched = COUNTRY_LOOKUP[cKey];
  const canonicalKey = matched ? makeKey(matched.name) : cKey;
  const name = matched ? matched.name : titleCase(rawName);
  const flag =
    parts[1] && parts[1].length > 0 ? parts[1] : matched?.flag || "🏳️";

  let cc = matched?.cc || "";
  if (parts[2]) {
    const cleanCc = parts[2].replace(/[^\d+]/g, "").trim();
    if (cleanCc) {
      cc = cleanCc.startsWith("+") ? cleanCc : `+${cleanCc}`;
    }
  }

  return { cKey: canonicalKey, name, flag, cc };
}

function formatNumberForDisplay(rawNum, cc, removeCC = false) {
  const digits = String(rawNum || "").replace(/[^\d]/g, "").trim();
  if (!digits) return "";
  const ccDigits = String(cc || "").replace(/[^\d]/g, "").trim();

  let fullDigits = digits;
  if (ccDigits && !digits.startsWith(ccDigits)) {
    fullDigits = `${ccDigits}${digits}`;
  }

  if (removeCC && ccDigits && fullDigits.startsWith(ccDigits)) {
    const stripped = fullDigits.slice(ccDigits.length);
    return stripped ? `+${stripped}` : `+${fullDigits}`;
  }

  return `+${fullDigits}`;
}

function normalizeNumberForStorage(rawNum, cc) {
  const digits = String(rawNum || "").replace(/[^\d]/g, "").trim();
  if (!digits) return "";
  const ccDigits = String(cc || "").replace(/[^\d]/g, "").trim();
  if (ccDigits && !digits.startsWith(ccDigits)) {
    return `${ccDigits}${digits}`;
  }
  return digits;
}

function registerServiceInOrder(srvKey) {
  if (!numbersDatabase[srvKey]) {
    numbersDatabase[srvKey] = {};
  }
  if (!serviceOrder.includes(srvKey)) {
    serviceOrder.push(srvKey);
  }
  saveDatabaseState();
}

// শুধুমাত্র নির্দিষ্ট দেশ যোগ/আপডেট করে; অন্য সব দেশের ডাটা ও নম্বর সম্পূর্ণ অক্ষত রাখে
function upsertCountryEntry(srvKey, resolved) {
  registerServiceInOrder(srvKey);
  const serviceMap = numbersDatabase[srvKey];
  const existing = serviceMap[resolved.cKey] || {
    name: resolved.name,
    flag: resolved.flag,
    cc: resolved.cc || "",
    numbers: [],
  };

  serviceMap[resolved.cKey] = {
    name: resolved.name || existing.name,
    flag: resolved.flag || existing.flag,
    cc: resolved.cc || existing.cc || "",
    numbers: Array.isArray(existing.numbers) ? [...existing.numbers] : [],
  };

  saveDatabaseState();
  return serviceMap[resolved.cKey];
}

function removeServiceFromOrder(srvKey) {
  delete numbersDatabase[srvKey];
  const idx = serviceOrder.indexOf(srvKey);
  if (idx !== -1) {
    serviceOrder.splice(idx, 1);
  }
  saveDatabaseState();
}

function getConfiguredServices() {
  const active = [];
  for (const key of serviceOrder) {
    if (numbersDatabase[key] && !active.includes(key)) {
      active.push(key);
    }
  }
  for (const key of Object.keys(numbersDatabase)) {
    if (!active.includes(key)) {
      active.push(key);
    }
  }
  return active;
}

function getServiceEmoji(serviceKey) {
  const map = {
    whatsapp: "🟢",
    telegram: "🔵",
    facebook: "🔷",
    instagram: "🟣",
    imo: "🟠",
    tiktok: "🔴",
    viber: "🟪",
    signal: "🟦",
  };
  return map[serviceKey] || "💠";
}

function parseNumbersFromText(rawText, cc = "") {
  return rawText
    .split(/[\r\n,]+/)
    .map((line) => normalizeNumberForStorage(line, cc))
    .filter((num) => num.length >= 6);
}

function mergeNumbersAppend(existingList, incomingList) {
  const base = Array.isArray(existingList) ? [...existingList] : [];
  for (const num of incomingList) {
    if (!base.includes(num)) {
      base.push(num);
    }
  }
  return base;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notifyUsersAboutNewNumbers(serviceKey, countryData, addedCount) {
  if (!addedCount || addedCount <= 0) return { sent: 0, failed: 0 };

  const srvEmoji = getServiceEmoji(serviceKey);
  const srvName = titleCase(serviceKey);
  const ccInfo = countryData.cc ? ` (${countryData.cc})` : "";
  const noticeText =
    `🔔 *নতুন নাম্বার যুক্ত হয়েছে!*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${srvEmoji} *সার্ভিস:* ${srvName}\n` +
    `🌍 *দেশ:* ${countryData.flag} ${countryData.name}${ccInfo}\n` +
    `🔢 *নতুন নাম্বার:* ${addedCount} টি\n\n` +
    `এখনই *📞 GET NUMBER* থেকে নাম্বার নিতে পারবেন!`;

  let sent = 0;
  let failed = 0;

  for (const uid of knownUsers) {
    try {
      await bot.telegram.sendMessage(uid, noticeText, {
        parse_mode: "Markdown",
      });
      sent += 1;
      await sleep(35);
    } catch (err) {
      failed += 1;
    }
  }

  return { sent, failed };
}

function mainKeyboard(userId) {
  const rows = [
    ["📞 GET NUMBER"],
    ["👛 WALLET", "📡 TRAFFIC"],
    ["✅ WA CHECKER"],
    ["🌐 LANGUAGE", "🆘 SUPPORT"],
    ["📄 NUMBER FILE"],
  ];
  if (isAdmin(userId)) {
    rows.push(["💠 ADMIN PANEL"]);
  }
  return Markup.keyboard(rows).resize();
}

function getThreeNumbers(list, offset = 0) {
  if (!list || list.length === 0) return [];
  const result = [];
  const count = Math.min(3, list.length);
  for (let i = 0; i < count; i++) {
    const idx = ((offset % list.length) + list.length + i) % list.length;
    const candidate = list[idx];
    if (!result.includes(candidate)) {
      result.push(candidate);
    }
  }
  return result;
}

// --- PANEL API CONNECTOR ---
async function fetchNumberFromPanelApi(service, countryData) {
  if (!isPanelApiConfigured()) return null;

  try {
    const base = getPanelApiUrl().replace(/\/+$/, "");
    const apiKey = getPanelApiKey();
    const params = new URLSearchParams({
      api_key: apiKey,
      service,
      country: countryData.name,
      cc: (countryData.cc || "").replace("+", ""),
    });

    const res = await fetch(`${base}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const rawPhone =
      data?.number ||
      data?.phone ||
      data?.data?.number ||
      data?.data?.phone ||
      "";
    const normalized = normalizeNumberForStorage(rawPhone, countryData.cc);
    return normalized.length >= 6 ? normalized : null;
  } catch (err) {
    console.error("Panel API number fetch error:", err);
    return null;
  }
}

async function fetchOtpFromPanelApi(phone, service) {
  if (!isPanelApiConfigured()) return null;

  try {
    const base = getPanelApiUrl().replace(/\/+$/, "");
    const apiKey = getPanelApiKey();
    const params = new URLSearchParams({
      api_key: apiKey,
      action: "getOtp",
      phone,
      service,
    });

    const res = await fetch(`${base}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const otp =
      data?.otp ||
      data?.code ||
      data?.sms_code ||
      data?.data?.otp ||
      data?.data?.code ||
      null;
    return otp ? String(otp).trim() : null;
  } catch (err) {
    console.error("Panel API OTP fetch error:", err);
    return null;
  }
}

async function readOtpFromFirebase(phone) {
  try {
    if (!hasValidFirebaseUrl()) {
      return null;
    }
    const url = `${getFirebaseBaseUrl()}/otps/${phone}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;
    if (typeof data === "string") return data;
    if (data.code && !data.used) return String(data.code);
    return null;
  } catch (err) {
    console.error("Firebase read error:", err);
    return null;
  }
}

async function markOtpUsedInFirebase(phone) {
  try {
    if (!hasValidFirebaseUrl()) {
      return;
    }
    const url = `${getFirebaseBaseUrl()}/otps/${phone}.json`;
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ used: true }),
    });
  } catch (err) {
    console.error("Firebase patch error:", err);
  }
}

function stopOtpWatcher(uid) {
  const existing = otpWatchers.get(uid);
  if (existing && existing.timer) {
    clearInterval(existing.timer);
  }
  otpWatchers.delete(uid);
}

function startOtpWatcher(ctx, service, countryData, phone) {
  const uid = ctx.from.id;
  const chatId = ctx.chat.id;
  stopOtpWatcher(uid);

  let ticks = 0;
  const maxTicks = 60;

  const timer = setInterval(async () => {
    ticks += 1;
    const code =
      (await fetchOtpFromPanelApi(phone, service)) ||
      (await readOtpFromFirebase(phone));

    if (code) {
      stopOtpWatcher(uid);
      await markOtpUsedInFirebase(phone);

      const serviceLabel = service.toUpperCase();
      await bot.telegram.sendMessage(
        chatId,
        `🟢 ${countryData.flag} *${serviceLabel}*  \`+${phone}\`\n✅ *Code Received (চাপ দিয়ে কপি করুন):*`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `🟩 📋 ${code}`,
                  copy_text: { text: code },
                },
              ],
            ],
          },
        }
      );
    } else if (ticks >= maxTicks) {
      stopOtpWatcher(uid);
    }
  }, 3000);

  otpWatchers.set(uid, { phone, timer });
}

function buildNumbersView(uid, service, countryKey, customNumbers = null) {
  const countryData = numbersDatabase[service]?.[countryKey];
  if (!countryData) return null;

  const session = userSession.get(uid) || {
    offset: 0,
    removeCC: false,
    batch: 1,
  };
  const pool =
    Array.isArray(customNumbers) && customNumbers.length > 0
      ? customNumbers
      : countryData.numbers;

  if (!pool || pool.length === 0) {
    return null;
  }

  const selected = getThreeNumbers(pool, session.offset);

  const rows = selected.map((rawNum) => {
    const displayNum = formatNumberForDisplay(
      rawNum,
      countryData.cc,
      session.removeCC
    );

    return [
      {
        text: `🟦 ${countryData.flag} 📋 ${displayNum}`,
        copy_text: { text: displayNum },
      },
    ];
  });

  rows.push([
    {
      text: session.removeCC ? "🟩 Add CC" : "🟨 Remove CC",
      callback_data: `toggle_cc:${service}:${countryKey}`,
    },
  ]);
  rows.push([
    {
      text: "🟪 Change Number",
      callback_data: `change_num:${service}:${countryKey}`,
    },
  ]);
  rows.push([
    {
      text: "🟦 Change Country",
      callback_data: `service:${service}`,
    },
  ]);
  rows.push([
    {
      text: "🟩 Otp Group",
      url: groupConfig.otpGroupLink,
    },
  ]);

  const serviceTitle = titleCase(service);
  const ccBadge = countryData.cc ? `${countryData.cc} • ` : "";
  const sourceBadge = isPanelApiConfigured()
    ? "🟢 ⚡ Live API"
    : "🟦 📦 Local Pool";
  const text =
    `💠 ${countryData.flag} *${serviceTitle} Number Assigned* (${ccBadge}${sourceBadge} • #${session.batch || 1})\n` +
    `🟡 *Waiting for OTP....*\n\n` +
    `_(নাম্বারের ওপর চাপ দিলেই কপি হয়ে যাবে)_`;

  return {
    text,
    extra: {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: rows },
    },
  };
}

function adminMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🟩 📄 Upload Numbers", "adm_menu:numbers")],
    [
      Markup.button.callback("🟦 🧩 Manage Services", "adm_menu:services"),
      Markup.button.callback("🟨 🌍 Manage Countries", "adm_menu:countries"),
    ],
    [
      Markup.button.callback("🟩 👥 Group Control", "adm_menu:groups"),
      Markup.button.callback("🟪 🔌 API Setup", "adm_menu:api_setup"),
    ],
  ]);
}

function openAdminPanel(ctx, isEdit = false) {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("🟥 ❌ এই মেনুটি শুধুমাত্র অ্যাডমিনের জন্য।");
  }
  adminState.delete(ctx.from.id);
  const text =
    "💠 *ADMIN CONTROL PANEL*\n" +
    "━━━━━━━━━━━━━━━━━━\n" +
    "নিচ থেকে রঙিন মেনু সিলেক্ট করে কাজ করুন:";
  if (isEdit) {
    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      ...adminMenuKeyboard(),
    });
  }
  return ctx.reply(text, {
    parse_mode: "Markdown",
    ...adminMenuKeyboard(),
  });
}

// --- GROUP CONTROL FROM ADMIN PANEL ---
function showGroupControlMenu(ctx, isEdit = false) {
  const mainIdText = groupConfig.mainGroupChatId
    ? `\`${groupConfig.mainGroupChatId}\``
    : "_Auto from link_";
  const otpIdText = groupConfig.otpGroupChatId
    ? `\`${groupConfig.otpGroupChatId}\``
    : "_Auto from link_";
  const checkStatus = groupConfig.strictCheck
    ? "🟢 ON (গ্রুপ মেম্বারশিপ চেক হবে)"
    : "🟨 OFF (শুধু Verify চাপলেই হবে)";

  const text =
    `🟩 *GROUP CONTROL PANEL*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📢 *Main Group Link:* \`${groupConfig.mainGroupLink}\`\n` +
    `🆔 *Main Group ID/User:* ${mainIdText}\n\n` +
    `💬 *OTP Group Link:* \`${groupConfig.otpGroupLink}\`\n` +
    `🆔 *OTP Group ID/User:* ${otpIdText}\n\n` +
    `🔐 *Join Check:* ${checkStatus}`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("🟦 Set Main Link", "adm_grp_set:main_link"),
      Markup.button.callback("🟦 Set Main ID", "adm_grp_set:main_id"),
    ],
    [
      Markup.button.callback("🟩 Set OTP Link", "adm_grp_set:otp_link"),
      Markup.button.callback("🟩 Set OTP ID", "adm_grp_set:otp_id"),
    ],
    [
      Markup.button.callback(
        groupConfig.strictCheck
          ? "🟨 Turn Join Check OFF"
          : "🟢 Turn Join Check ON",
        "adm_grp_toggle_check"
      ),
    ],
    [Markup.button.callback("⬜ ⬅️ Back to Admin", "adm_home")],
  ]);

  if (isEdit) {
    return ctx.editMessageText(text, { parse_mode: "Markdown", ...keyboard });
  }
  return ctx.reply(text, { parse_mode: "Markdown", ...keyboard });
}

bot.action("adm_menu:groups", async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  adminState.delete(ctx.from.id);
  await showGroupControlMenu(ctx, true);
});

bot.action(/^adm_grp_set:(main_link|main_id|otp_link|otp_id)$/, async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const field = ctx.match[1];
  adminState.set(ctx.from.id, { step: "set_group_field", field });

  const prompts = {
    main_link:
      "🟦 *SET MAIN GROUP LINK*\nমেইন গ্রুপের লিংক পাঠান (যেমন: `https://t.me/your_group` বা `https://t.me/+invitehash`):",
    main_id:
      "🟦 *SET MAIN GROUP ID / USERNAME*\nমেইন গ্রুপের Chat ID (যেমন `-1001234567890`) বা `@username` পাঠান:",
    otp_link:
      "🟩 *SET OTP GROUP LINK*\nওটিপি গ্রুপের লিংক পাঠান (যেমন: `https://t.me/your_otp_group` বা `https://t.me/+invitehash`):",
    otp_id:
      "🟩 *SET OTP GROUP ID / USERNAME*\nওটিপি গ্রুপের Chat ID (যেমন `-1009876543210`) বা `@username` পাঠান:",
  };

  await ctx.editMessageText(prompts[field], { parse_mode: "Markdown" });
});

bot.action("adm_grp_toggle_check", async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  groupConfig.strictCheck = !groupConfig.strictCheck;
  verifiedUsers.clear();
  await saveGroupsState();
  await ctx.answerCbQuery(
    groupConfig.strictCheck ? "Join Check ON" : "Join Check OFF"
  );
  await showGroupControlMenu(ctx, true);
});

// --- START & GROUP VERIFICATION ---
bot.start(async (ctx) => {
  trackUser(ctx);
  const uid = ctx.from.id;

  if (!isAdmin(uid)) {
    const joined = await checkBothGroupsJoined(uid);
    if (!joined) {
      return promptJoinGroups(ctx, false);
    }
    verifiedUsers.add(uid);
  }

  return ctx.reply("🟢 স্বাগতম! নিচের *GET NUMBER* বাটনে চাপ দিয়ে শুরু করুন:", {
    parse_mode: "Markdown",
    ...mainKeyboard(uid),
  });
});

bot.action("verify_groups", async (ctx) => {
  trackUser(ctx);
  const uid = ctx.from.id;
  const joined = await checkBothGroupsJoined(uid);

  if (!joined) {
    await ctx.answerCbQuery("আগে দুটি গ্রুপেই জয়েন করুন!", { show_alert: true });
    return promptJoinGroups(ctx, true);
  }

  verifiedUsers.add(uid);
  await ctx.answerCbQuery("ভেরিফিকেশন সফল হয়েছে!");

  try {
    await ctx.editMessageText(
      "🟢 ✅ *ভেরিফিকেশন সফল হয়েছে!*\nএখন আপনি বটের সব ফিচার ব্যবহার করতে পারবেন।",
      { parse_mode: "Markdown" }
    );
  } catch (e) {}

  return ctx.reply("🟢 স্বাগতম! নিচের *GET NUMBER* বাটনে চাপ দিয়ে শুরু করুন:", {
    parse_mode: "Markdown",
    ...mainKeyboard(uid),
  });
});

bot.command("admin", (ctx) => openAdminPanel(ctx, false));
bot.hears(["💠 ADMIN PANEL", "⚙️ ADMIN PANEL"], (ctx) =>
  openAdminPanel(ctx, false)
);

bot.action("adm_home", async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  await openAdminPanel(ctx, true);
});

// --- API SETUP IN BOT ---
function showApiSetupMenu(ctx, isEdit = false) {
  const urlText = getPanelApiUrl()
    ? `\`${getPanelApiUrl()}\``
    : "_Set হয়নি_";
  const keyText = getPanelApiKey()
    ? `\`${maskApiKey(getPanelApiKey())}\``
    : "_Set হয়নি_";
  const statusBadge = isPanelApiConfigured()
    ? "🟢 *Status:* Connected"
    : "🟨 *Status:* Not Configured";

  const text =
    `🟪 *API SETUP PANEL*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${statusBadge}\n` +
    `🌐 *API URL:* ${urlText}\n` +
    `🔑 *API Key:* ${keyText}\n\n` +
    `সরাসরি বটের ভেতর থেকেই API URL বা API Key সেট করুন:`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("🟦 🌐 Set API URL", "adm_api_set_url"),
      Markup.button.callback("🟨 🔑 Set API Key", "adm_api_set_key"),
    ],
    [Markup.button.callback("🟥 🗑 Clear API", "adm_api_clear")],
    [Markup.button.callback("⬜ ⬅️ Back to Admin", "adm_home")],
  ]);

  if (isEdit) {
    return ctx.editMessageText(text, { parse_mode: "Markdown", ...keyboard });
  }
  return ctx.reply(text, { parse_mode: "Markdown", ...keyboard });
}

bot.action("adm_menu:api_setup", async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  adminState.delete(ctx.from.id);
  await showApiSetupMenu(ctx, true);
});

bot.action("adm_api_set_url", async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  adminState.set(ctx.from.id, { step: "set_api_url" });

  await ctx.editMessageText(
    "🟦 *SET API URL*\nআপনার প্যানেলের API লিংক লিখে পাঠান (যেমন: `https://example.com/api/v1`):",
    { parse_mode: "Markdown" }
  );
});

bot.action("adm_api_set_key", async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  adminState.set(ctx.from.id, { step: "set_api_key" });

  await ctx.editMessageText(
    "🟨 *SET API KEY*\nআপনার প্যানেলের API Key লিখে পাঠান:",
    { parse_mode: "Markdown" }
  );
});

bot.action("adm_api_clear", async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery("API cleared");
  runtimePanelApiUrl = "";
  runtimePanelApiKey = "";
  adminState.delete(ctx.from.id);
  await saveApiState();
  await showApiSetupMenu(ctx, true);
});

// --- SERVICE MANAGEMENT ---
bot.action("adm_menu:services", async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();

  const keys = getConfiguredServices();
  const rows = [
    [Markup.button.callback("🟩 ➕ Add New Service", "adm_srv_add")],
  ];

  keys.forEach((srvKey) => {
    const cntCount = Object.keys(numbersDatabase[srvKey] || {}).length;
    rows.push([
      Markup.button.callback(
        `🟥 🗑 ${getServiceEmoji(srvKey)} ${titleCase(srvKey)} (${cntCount} দেশ)`,
        `adm_srv_del:${srvKey}`
      ),
    ]);
  });

  rows.push([Markup.button.callback("⬜ ⬅️ Back to Admin", "adm_home")]);

  await ctx.editMessageText(
    "🟦 *SERVICE MANAGEMENT*\n" +
      "━━━━━━━━━━━━━━━━━━\n" +
      "আপনি যে ক্রমে সার্ভিস যোগ করবেন, ইউজার ঠিক সেই ক্রমেই দেখবে:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(rows),
    }
  );
});

bot.action("adm_srv_add", async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  adminState.set(ctx.from.id, { step: "add_service" });

  await ctx.editMessageText(
    "🟩 *ADD NEW SERVICE*\nসার্ভিসের নাম লিখে পাঠান (যেমন: `WhatsApp`, `Telegram`, `Facebook`, `Instagram`, `Imo` বা অন্য কোনো নাম):",
    { parse_mode: "Markdown" }
  );
});

bot.action(/^adm_srv_del:(.+)$/, async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const srvKey = ctx.match[1];

  if (!numbersDatabase[srvKey]) {
    return ctx.editMessageText("🟨 ⚠️ সার্ভিসটি পাওয়া যায়নি।");
  }

  removeServiceFromOrder(srvKey);
  await ctx.editMessageText(
    `🟢 ✅ *${titleCase(srvKey)}* সার্ভিসটি রিমুভ করা হয়েছে।`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🟦 ⬅️ Back to Services", "adm_menu:services")],
        [Markup.button.callback("💠 🏠 Admin Panel", "adm_home")],
      ]),
    }
  );
});

// --- COUNTRY MANAGEMENT ---
bot.action("adm_menu:countries", async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();

  const keys = getConfiguredServices();
  const buttons = keys.map((k) => [
    Markup.button.callback(
      `🟦 ${getServiceEmoji(k)} ${titleCase(k)}`,
      `adm_cnt_srv:${k}`
    ),
  ]);
  buttons.push([Markup.button.callback("🟩 ➕ Add New Service", "adm_srv_add")]);
  buttons.push([Markup.button.callback("⬜ ⬅️ Back to Admin", "adm_home")]);

  await ctx.editMessageText(
    "🟨 *COUNTRY MANAGEMENT*\n" +
      "━━━━━━━━━━━━━━━━━━\n" +
      "কোন সার্ভিসের দেশ যুক্ত বা রিমুভ করবেন?",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    }
  );
});

bot.action(/^adm_cnt_srv:(.+)$/, async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const srvKey = ctx.match[1];
  registerServiceInOrder(srvKey);
  const countries = numbersDatabase[srvKey] || {};

  const rows = [
    [
      Markup.button.callback(
        `🟩 ➕ Add Country to ${titleCase(srvKey)}`,
        `adm_cnt_add:${srvKey}`
      ),
    ],
  ];

  Object.entries(countries).forEach(([cKey, cData]) => {
    const ccLabel = cData.cc ? ` (${cData.cc})` : "";
    rows.push([
      Markup.button.callback(
        `🟥 🗑 ${cData.flag} ${cData.name}${ccLabel} — ${cData.numbers.length} টি`,
        `adm_cnt_del:${srvKey}:${cKey}`
      ),
    ]);
  });

  rows.push([Markup.button.callback("⬜ ⬅️ Back", "adm_menu:countries")]);

  await ctx.editMessageText(
    `🟨 *${titleCase(srvKey)} COUNTRIES*\n` +
      "━━━━━━━━━━━━━━━━━━\n" +
      "সবুজ বাটনে চাপ দিয়ে দেশ যোগ করুন বা লাল বাটনে চাপ দিয়ে রিমুভ করুন।",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(rows),
    }
  );
});

bot.action(/^adm_cnt_add:(.+)$/, async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const srvKey = ctx.match[1];
  registerServiceInOrder(srvKey);

  adminState.set(ctx.from.id, { step: "add_country", service: srvKey });

  await ctx.editMessageText(
    `🟩 *ADD COUNTRY (${titleCase(srvKey)})*\n\n` +
      `দেশের নাম লিখুন (পতাকা ও কান্ট্রি কোড অটো সেট হয়ে যাবে):\n` +
      `উদাহরণ: \`Bangladesh\`, \`Cuba\`, \`Tanzania\`, \`India\`, \`Egypt\`\n\n` +
      `_(নতুন কোনো দেশ হলে \`Name, 🏳️, +code\` এভাবেও দিতে পারেন)_`,
    { parse_mode: "Markdown" }
  );
});

bot.action(/^adm_cnt_del:(.+):(.+)$/, async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const [, srvKey, cKey] = ctx.match;

  const removed = numbersDatabase[srvKey]?.[cKey];
  if (!removed) {
    return ctx.editMessageText("🟨 ⚠️ দেশটি পাওয়া যায়নি।");
  }

  delete numbersDatabase[srvKey][cKey];
  await saveDatabaseState();

  await ctx.editMessageText(
    `🟢 ✅ *${titleCase(srvKey)}* থেকে *${removed.flag} ${removed.name}* রিমুভ করা হয়েছে।`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🟨 ⬅️ Back to Countries", `adm_cnt_srv:${srvKey}`)],
        [Markup.button.callback("💠 🏠 Admin Panel", "adm_home")],
      ]),
    }
  );
});

// --- UPLOAD NUMBERS ---
bot.action("adm_menu:numbers", async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();

  const keys = getConfiguredServices();
  const buttons = keys.map((k) => [
    Markup.button.callback(
      `🟩 ${getServiceEmoji(k)} ${titleCase(k)}`,
      `adm_srv:${k}`
    ),
  ]);
  buttons.push([Markup.button.callback("🟦 ➕ Add New Service", "adm_srv_add")]);
  buttons.push([Markup.button.callback("⬜ ⬅️ Back to Admin", "adm_home")]);

  await ctx.editMessageText(
    "🟩 *UPLOAD NUMBERS — ধাপ ১: সার্ভিস সিলেক্ট করুন*\n" +
      "━━━━━━━━━━━━━━━━━━\n" +
      "আপনি যে সার্ভিস যোগ করেছেন সেটি সিলেক্ট করুন (অথবা নতুন সার্ভিস যোগ করুন):",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    }
  );
});

bot.action(/^adm_srv:(.+)$/, async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const service = ctx.match[1];
  registerServiceInOrder(service);
  const countries = numbersDatabase[service] || {};

  const buttons = Object.entries(countries).map(([key, d]) => {
    const ccLabel = d.cc ? ` (${d.cc})` : "";
    return [
      Markup.button.callback(
        `🟦 ${d.flag} ${d.name}${ccLabel} — ${d.numbers.length} টি`,
        `adm_cnt:${service}:${key}`
      ),
    ];
  });

  buttons.push([
    Markup.button.callback(
      `🟩 ➕ Add Country to ${titleCase(service)}`,
      `adm_cnt_add:${service}`
    ),
  ]);
  buttons.push([Markup.button.callback("⬜ ⬅️ Back", "adm_menu:numbers")]);

  await ctx.editMessageText(
    `🟦 *${titleCase(service)} — ধাপ ২: দেশ সিলেক্ট বা যুক্ত করুন*\n` +
      "━━━━━━━━━━━━━━━━━━\n" +
      "যে দেশে নম্বর অ্যাড করবেন সেই দেশে চাপ দিন অথবা নতুন দেশ যোগ করুন:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    }
  );
});

bot.action(/^adm_cnt:(.+):(.+)$/, async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const [, service, countryKey] = ctx.match;
  const countryData = numbersDatabase[service]?.[countryKey];
  if (!countryData) return;

  adminState.set(ctx.from.id, {
    step: "upload_numbers",
    service,
    countryKey,
    mode: "append",
  });

  const ccInfo = countryData.cc ? ` (${countryData.cc})` : "";
  await ctx.editMessageText(
    `🟩 *নাম্বার অ্যাড করুন*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${getServiceEmoji(service)} *সার্ভিস:* ${titleCase(service)}\n` +
      `🌍 *দেশ:* ${countryData.flag} ${countryData.name}${ccInfo}\n` +
      `📊 *বর্তমান নম্বর:* ${countryData.numbers.length} টি\n` +
      `📌 *মোড:* Add Numbers (আগের নম্বরের সাথে যুক্ত হবে)\n\n` +
      `এখন সরাসরি মেসেজে নম্বরগুলো পেস্ট করে পাঠান (প্রতি লাইনে ১টি নম্বর) অথবা একটি *.txt* ফাইল পাঠান।`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🟨 ♻️ Switch to Replace List",
            `adm_mode:${service}:${countryKey}:replace`
          ),
        ],
        [Markup.button.callback("⬜ ⬅️ Back", `adm_srv:${service}`)],
      ]),
    }
  );
});

bot.action(/^adm_mode:(.+):(.+):(replace|append)$/, async (ctx) => {
  trackUser(ctx);
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const [, service, countryKey, mode] = ctx.match;
  const countryData = numbersDatabase[service]?.[countryKey];
  if (!countryData) return;

  adminState.set(ctx.from.id, {
    step: "upload_numbers",
    service,
    countryKey,
    mode,
  });

  const modeLabel =
    mode === "replace"
      ? "Replace List (আগের নম্বর বদলে নতুন নম্বর বসবে)"
      : "Add Numbers (আগের নম্বরের সাথে নতুন নম্বর যুক্ত হবে)";

  const ccInfo = countryData.cc ? ` (${countryData.cc})` : "";
  await ctx.editMessageText(
    `🟩 *নাম্বার সেট করুন*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${getServiceEmoji(service)} *সার্ভিস:* ${titleCase(service)}\n` +
      `🌍 *দেশ:* ${countryData.flag} ${countryData.name}${ccInfo}\n` +
      `📊 *বর্তমান নম্বর:* ${countryData.numbers.length} টি\n` +
      `📌 *মোড:* ${modeLabel}\n\n` +
      `এখন নম্বরগুলো মেসেজে পেস্ট করে পাঠান অথবা *.txt* ফাইল পাঠান।`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            mode === "replace"
              ? "🟩 ➕ Switch to Add Numbers"
              : "🟨 ♻️ Switch to Replace List",
            `adm_mode:${service}:${countryKey}:${mode === "replace" ? "append" : "replace"}`
          ),
        ],
        [Markup.button.callback("⬜ ⬅️ Back", `adm_srv:${service}`)],
      ]),
    }
  );
});

bot.on("document", async (ctx) => {
  trackUser(ctx);
  const uid = ctx.from.id;
  if (!isAdmin(uid)) {
    const ok = await ensureVerifiedAccess(ctx);
    if (!ok) return;
    return;
  }
  const st = adminState.get(uid);
  if (!st || st.step !== "upload_numbers") return;

  try {
    const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
    const response = await fetch(fileLink.href);
    const content = await response.text();
    const target = numbersDatabase[st.service]?.[st.countryKey];
    if (!target) return ctx.reply("🟨 ⚠️ টার্গেট দেশ পাওয়া যায়নি।");

    const parsed = parseNumbersFromText(content, target.cc);

    if (parsed.length === 0) {
      return ctx.reply("🟨 ⚠️ ফাইলে কোনো বৈধ নম্বর পাওয়া যায়নি।");
    }

    const beforeCount = target.numbers.length;
    target.numbers =
      st.mode === "replace"
        ? mergeNumbersAppend([], parsed)
        : mergeNumbersAppend(target.numbers, parsed);
    const actualAdded =
      st.mode === "replace"
        ? target.numbers.length
        : Math.max(0, target.numbers.length - beforeCount);

    adminState.delete(uid);
    await saveDatabaseState();
    const notifyStats = await notifyUsersAboutNewNumbers(
      st.service,
      target,
      actualAdded || parsed.length
    );

    const ccInfo = target.cc ? ` (${target.cc})` : "";
    await ctx.reply(
      `🟢 ✅ সফলভাবে *${actualAdded || parsed.length}* টি নম্বর *${titleCase(st.service)} (${target.flag} ${target.name}${ccInfo})* এ যুক্ত হয়েছে!\n` +
        `📊 মোট নম্বর: *${target.numbers.length}* টি\n` +
        `🔔 নোটিফিকেশন পাঠানো হয়েছে: *${notifyStats.sent}* জন ইউজারকে।`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("File upload error:", err);
    await ctx.reply("🟥 ❌ ফাইল প্রসেস করতে সমস্যা হয়েছে।");
  }
});

// --- USER FLOW (Verified Users Only) ---
async function showServicesMenu(ctx, isEdit = false) {
  const ok = await ensureVerifiedAccess(ctx);
  if (!ok) return;

  const serviceKeys = getConfiguredServices();
  if (serviceKeys.length === 0) {
    const emptyText = "🟥 ❌ বর্তমানে কোনো সার্ভিস সেট করা হয়নি।";
    return isEdit ? ctx.editMessageText(emptyText) : ctx.reply(emptyText);
  }

  const text = "💠 *আপনি কিসের কাজ করবেন?* নিচ থেকে সিলেক্ট করুন:";
  const buttons = [];
  for (let i = 0; i < serviceKeys.length; i += 2) {
    const row = [];
    const k1 = serviceKeys[i];
    row.push(
      Markup.button.callback(
        `${getServiceEmoji(k1)} ${titleCase(k1)}`,
        `service:${k1}`
      )
    );
    if (serviceKeys[i + 1]) {
      const k2 = serviceKeys[i + 1];
      row.push(
        Markup.button.callback(
          `${getServiceEmoji(k2)} ${titleCase(k2)}`,
          `service:${k2}`
        )
      );
    }
    buttons.push(row);
  }

  const keyboard = Markup.inlineKeyboard(buttons);
  if (isEdit) {
    return ctx.editMessageText(text, { parse_mode: "Markdown", ...keyboard });
  }
  return ctx.reply(text, { parse_mode: "Markdown", ...keyboard });
}

bot.hears("📞 GET NUMBER", (ctx) => showServicesMenu(ctx, false));

bot.action(/^service:(.+)$/, async (ctx) => {
  const ok = await ensureVerifiedAccess(ctx);
  if (!ok) return ctx.answerCbQuery("আগে দুটি গ্রুপে জয়েন করুন");

  await ctx.answerCbQuery();
  const service = ctx.match[1];
  const countries = numbersDatabase[service] || {};

  const selectedCountries = Object.entries(countries).filter(
    ([, data]) => Array.isArray(data.numbers) && data.numbers.length > 0
  );

  if (selectedCountries.length === 0) {
    return ctx.editMessageText(
      "🟥 ❌ এই সার্ভিসের জন্য বর্তমানে কোনো নাম্বার সেট করা নেই।",
      Markup.inlineKeyboard([
        [Markup.button.callback("⬜ ⬅️ Back to Services", "back_services")],
      ])
    );
  }

  const countryGrid = [];
  for (let i = 0; i < selectedCountries.length; i += 2) {
    const row = [];
    const [k1, d1] = selectedCountries[i];
    row.push(
      Markup.button.callback(
        `${d1.flag} ${d1.name}`,
        `country:${service}:${k1}`
      )
    );

    if (selectedCountries[i + 1]) {
      const [k2, d2] = selectedCountries[i + 1];
      row.push(
        Markup.button.callback(
          `${d2.flag} ${d2.name}`,
          `country:${service}:${k2}`
        )
      );
    }
    countryGrid.push(row);
  }

  countryGrid.push([
    Markup.button.callback("⬜ ⬅️ Back to Services", "back_services"),
  ]);

  const serviceTitle = titleCase(service).toUpperCase();
  await ctx.editMessageText(
    `🌍 *${serviceTitle} — SELECT COUNTRY*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `নিচ থেকে আপনার কাঙ্ক্ষিত দেশ সিলেক্ট করুন:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(countryGrid),
    }
  );
});

bot.action("back_services", async (ctx) => {
  const ok = await ensureVerifiedAccess(ctx);
  if (!ok) return ctx.answerCbQuery("আগে দুটি গ্রুপে জয়েন করুন");

  await ctx.answerCbQuery();
  await showServicesMenu(ctx, true);
});

bot.action(/^country:(.+):(.+)$/, async (ctx) => {
  const ok = await ensureVerifiedAccess(ctx);
  if (!ok) return ctx.answerCbQuery("আগে দুটি গ্রুপে জয়েন করুন");

  await ctx.answerCbQuery();
  const [, service, countryKey] = ctx.match;
  const uid = ctx.from.id;
  const countryData = numbersDatabase[service]?.[countryKey];
  if (!countryData || !countryData.numbers || countryData.numbers.length === 0) {
    return ctx.editMessageText(
      "🟥 ❌ এই দেশে বর্তমানে কোনো নাম্বার নেই।",
      Markup.inlineKeyboard([
        [Markup.button.callback("⬜ ⬅️ Back to Services", "back_services")],
      ])
    );
  }

  userSession.set(uid, { offset: 0, removeCC: false, batch: 1 });
  const apiPhone = await fetchNumberFromPanelApi(service, countryData);
  const customList = apiPhone ? [apiPhone] : null;

  const view = buildNumbersView(uid, service, countryKey, customList);
  if (view) {
    await ctx.editMessageText(view.text, view.extra);
    const activePhone = normalizeNumberForStorage(
      apiPhone || countryData.numbers[0],
      countryData.cc
    );
    if (activePhone) {
      startOtpWatcher(ctx, service, countryData, activePhone);
    }
  }
});

bot.action(/^change_num:(.+):(.+)$/, async (ctx) => {
  const ok = await ensureVerifiedAccess(ctx);
  if (!ok) return ctx.answerCbQuery("আগে দুটি গ্রুপে জয়েন করুন");

  const [, service, countryKey] = ctx.match;
  const uid = ctx.from.id;
  const countryData = numbersDatabase[service]?.[countryKey];
  if (!countryData || !countryData.numbers || countryData.numbers.length === 0) {
    return ctx.answerCbQuery("নাম্বার নেই");
  }

  const current = userSession.get(uid) || {
    offset: 0,
    removeCC: false,
    batch: 1,
  };
  current.offset += 3;
  current.batch += 1;
  userSession.set(uid, current);

  await ctx.answerCbQuery("নতুন নাম্বার লোড হচ্ছে...");

  const apiPhone = await fetchNumberFromPanelApi(service, countryData);
  const customList = apiPhone ? [apiPhone] : null;

  const view = buildNumbersView(uid, service, countryKey, customList);
  if (view) {
    try {
      await ctx.editMessageText(view.text, view.extra);
    } catch (e) {
      await ctx.reply(view.text, view.extra);
    }
    const rawActive =
      apiPhone ||
      (countryData.numbers.length > 0
        ? countryData.numbers[current.offset % countryData.numbers.length]
        : null);
    const activePhone = rawActive
      ? normalizeNumberForStorage(rawActive, countryData.cc)
      : null;
    if (activePhone) {
      startOtpWatcher(ctx, service, countryData, activePhone);
    }
  }
});

bot.action(/^toggle_cc:(.+):(.+)$/, async (ctx) => {
  const ok = await ensureVerifiedAccess(ctx);
  if (!ok) return ctx.answerCbQuery("আগে দুটি গ্রুপে জয়েন করুন");

  await ctx.answerCbQuery();
  const [, service, countryKey] = ctx.match;
  const uid = ctx.from.id;

  const current = userSession.get(uid) || {
    offset: 0,
    removeCC: false,
    batch: 1,
  };
  current.removeCC = !current.removeCC;
  userSession.set(uid, current);

  const view = buildNumbersView(uid, service, countryKey);
  if (view) {
    await ctx.editMessageText(view.text, view.extra);
  }
});

bot.hears("👛 WALLET", async (ctx) => {
  if (!(await ensureVerifiedAccess(ctx))) return;
  return ctx.reply("🟦 👛 আপনার অ্যাকাউন্ট ফ্রি মোডে চালু আছে।");
});
bot.hears("📡 TRAFFIC", async (ctx) => {
  if (!(await ensureVerifiedAccess(ctx))) return;
  return ctx.reply("🟢 📡 সার্ভার স্ট্যাটাস: অনলাইন এবং সচল।");
});
bot.hears("✅ WA CHECKER", async (ctx) => {
  if (!(await ensureVerifiedAccess(ctx))) return;
  return ctx.reply("🟢 ✅ নাম্বার চেকার সক্রিয় রয়েছে।");
});
bot.hears("🌐 LANGUAGE", async (ctx) => {
  if (!(await ensureVerifiedAccess(ctx))) return;
  return ctx.reply("🟦 🌐 ভাষা: বাংলা / English");
});
bot.hears("🆘 SUPPORT", async (ctx) => {
  if (!(await ensureVerifiedAccess(ctx))) return;
  return ctx.reply("🟨 🆘 যেকোনো প্রয়োজনে অ্যাডমিনকে মেসেজ দিন।");
});
bot.hears("📄 NUMBER FILE", async (ctx) => {
  if (!(await ensureVerifiedAccess(ctx))) return;
  return ctx.reply("🟦 📄 সব নাম্বার মেনু থেকেই কপি করতে পারবেন।");
});

bot.on("text", async (ctx) => {
  trackUser(ctx);
  const uid = ctx.from.id;

  if (!isAdmin(uid)) {
    const ok = await ensureVerifiedAccess(ctx);
    if (!ok) return;
    return;
  }

  const st = adminState.get(uid);
  if (!st) return;

  if (st.step === "set_group_field") {
    const val = ctx.message.text.trim();
    if (!val) {
      return ctx.reply("🟨 ⚠️ সঠিক মান লিখুন।");
    }

    if (st.field === "main_link") {
      if (!/^https:\/\/t\.me\/.+/i.test(val)) {
        return ctx.reply(
          "🟨 ⚠️ সঠিক Telegram লিংক দিন (যেমন: `https://t.me/...`)।",
          { parse_mode: "Markdown" }
        );
      }
      groupConfig.mainGroupLink = val;
    } else if (st.field === "main_id") {
      groupConfig.mainGroupChatId = val;
    } else if (st.field === "otp_link") {
      if (!/^https:\/\/t\.me\/.+/i.test(val)) {
        return ctx.reply(
          "🟨 ⚠️ সঠিক Telegram লিংক দিন (যেমন: `https://t.me/...`)।",
          { parse_mode: "Markdown" }
        );
      }
      groupConfig.otpGroupLink = val;
    } else if (st.field === "otp_id") {
      groupConfig.otpGroupChatId = val;
    }

    verifiedUsers.clear();
    adminState.delete(uid);
    await saveGroupsState();
    return showGroupControlMenu(ctx, false);
  }

  if (st.step === "set_api_url") {
    const inputUrl = ctx.message.text.trim();
    if (!/^https?:\/\/.+/i.test(inputUrl)) {
      return ctx.reply(
        "🟨 ⚠️ সঠিক API URL দিন (যা `https://` দিয়ে শুরু হয়)।",
        { parse_mode: "Markdown" }
      );
    }
    runtimePanelApiUrl = inputUrl;
    adminState.delete(uid);
    await saveApiState();
    return showApiSetupMenu(ctx, false);
  }

  if (st.step === "set_api_key") {
    const inputKey = ctx.message.text.trim();
    if (!inputKey) {
      return ctx.reply("🟨 ⚠️ সঠিক API Key লিখুন।");
    }
    runtimePanelApiKey = inputKey;
    adminState.delete(uid);
    await saveApiState();
    return showApiSetupMenu(ctx, false);
  }

  if (st.step === "add_service") {
    const srvKey = makeKey(ctx.message.text);
    if (!srvKey) {
      return ctx.reply(
        "🟨 ⚠️ সঠিক সার্ভিসের নাম লিখুন (যেমন: `WhatsApp` বা `Telegram`)।",
        { parse_mode: "Markdown" }
      );
    }
    registerServiceInOrder(srvKey);
    adminState.delete(uid);
    return ctx.reply(
      `🟢 ✅ সার্ভিস *${titleCase(srvKey)}* যুক্ত হয়েছে! এখন দেশ যোগ করতে পারবেন:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              `🟩 ➕ ${titleCase(srvKey)} এ দেশ যোগ করুন`,
              `adm_cnt_add:${srvKey}`
            ),
          ],
          [Markup.button.callback("💠 🏠 Admin Panel", "adm_home")],
        ]),
      }
    );
  }

  if (st.step === "add_country") {
    const resolved = resolveCountryDetails(ctx.message.text);
    if (!resolved) {
      return ctx.reply(
        "🟨 ⚠️ সঠিক দেশের নাম লিখুন (যেমন: `Bangladesh` বা `Cuba` বা `Tanzania`)।",
        { parse_mode: "Markdown" }
      );
    }

    const savedCountry = upsertCountryEntry(st.service, resolved);
    const srvName = titleCase(st.service);
    const ccInfo = savedCountry.cc ? ` (${savedCountry.cc})` : "";
    adminState.delete(uid);
    return ctx.reply(
      `🟢 ✅ *${srvName}* এ *${savedCountry.flag} ${savedCountry.name}${ccInfo}* যুক্ত হয়েছে! এখন নম্বর অ্যাড করুন:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              `🟩 📄 ${savedCountry.name} এ নম্বর অ্যাড করুন`,
              `adm_cnt:${st.service}:${resolved.cKey}`
            ),
          ],
          [Markup.button.callback("💠 🏠 Admin Panel", "adm_home")],
        ]),
      }
    );
  }

  if (st.step === "upload_numbers") {
    const target = numbersDatabase[st.service]?.[st.countryKey];
    if (!target) return ctx.reply("🟨 ⚠️ টার্গেট দেশ পাওয়া যায়নি।");

    const parsed = parseNumbersFromText(ctx.message.text, target.cc);
    if (parsed.length === 0) {
      return ctx.reply("🟨 ⚠️ বৈধ নম্বর পাওয়া যায়নি। প্রতি লাইনে ১টি নম্বর দিন।");
    }

    const beforeCount = target.numbers.length;
    target.numbers =
      st.mode === "replace"
        ? mergeNumbersAppend([], parsed)
        : mergeNumbersAppend(target.numbers, parsed);
    const actualAdded =
      st.mode === "replace"
        ? target.numbers.length
        : Math.max(0, target.numbers.length - beforeCount);

    adminState.delete(uid);
    await saveDatabaseState();
    const notifyStats = await notifyUsersAboutNewNumbers(
      st.service,
      target,
      actualAdded || parsed.length
    );

    const ccInfo = target.cc ? ` (${target.cc})` : "";
    return ctx.reply(
      `🟢 ✅ *${actualAdded || parsed.length}* টি নম্বর *${titleCase(st.service)} (${target.flag} ${target.name}${ccInfo})* এ যুক্ত হয়েছে!\n` +
        `📊 মোট নম্বর: *${target.numbers.length}* টি\n` +
        `🔔 নোটিফিকেশন পাঠানো হয়েছে: *${notifyStats.sent}* জন ইউজারকে।`,
      { parse_mode: "Markdown" }
    );
  }
});

bot.catch((err, ctx) => {
  console.error(`Telegraf error for ${ctx?.updateType || "update"}:`, err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot @number_24_bot is running");
  })
  .listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
  });

function startKeepAlivePing() {
  if (!KEEP_ALIVE_URL || !KEEP_ALIVE_URL.startsWith("http")) return;
  setInterval(async () => {
    try {
      await fetch(KEEP_ALIVE_URL);
    } catch (err) {
      // ignore transient keep-alive errors
    }
  }, 4 * 60 * 1000);
}

async function launchBotSafely() {
  await loadStateFromFirebase();
  try {
    await bot.launch({ dropPendingUpdates: false });
    console.log("Bot @number_24_bot with Admin Panel is running...");
    if (firebaseReady) {
      console.log("Firebase persistence is active.");
    }
  } catch (err) {
    console.error("Bot launch failed, retrying in 5s:", err.message);
    setTimeout(launchBotSafely, 5000);
  }
}

launchBotSafely();
startKeepAlivePing();
