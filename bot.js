const http = require("http");
const https = require("https");
const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || "").replace(/\/+$/, "");
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error("Missing BOT_TOKEN environment variable.");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ইন-মেমোরি ডাটা স্ট্রাকচার
let db = {
  services: {}, // উদাহরণ: { whatsapp: { name: "WhatsApp", countries: { bd: { name: "Bangladesh", numbers: ["+88017..."] } } } }
  userState: {}
};

// Firebase থেকে ডাটা লোড করার ফাংশন
function loadDatabaseFromFirebase() {
  return new Promise((resolve) => {
    if (!FIREBASE_DB_URL) {
      console.log("FIREBASE_DB_URL not set. Using local memory only.");
      return resolve();
    }

    const url = `${FIREBASE_DB_URL}/number24bot.json`;
    https
      .get(url, (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300 && raw && raw !== "null") {
              const parsed = JSON.parse(raw);
              db = {
                services: parsed.services || {},
                userState: parsed.userState || {}
              };
              console.log("Loaded bot data from Firebase Realtime Database.");
            } else {
              console.log("No existing data found in Firebase; starting fresh.");
            }
          } catch (err) {
            console.error("Failed to parse Firebase data:", err.message);
          }
          resolve();
        });
      })
      .on("error", (err) => {
        console.error("Error loading from Firebase:", err.message);
        resolve();
      });
  });
}

// Firebase-এ ডাটা সেভ করার ফাংশন
function saveDatabaseToFirebase() {
  if (!FIREBASE_DB_URL) return;

  const payload = JSON.stringify(db);
  const url = new URL(`${FIREBASE_DB_URL}/number24bot.json`);

  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log("Saved bot data to Firebase Realtime Database.");
      } else {
        console.error("Firebase save failed with status:", res.statusCode, data);
      }
    });
  });

  req.on("error", (err) => {
    console.error("Error saving to Firebase:", err.message);
  });

  req.write(payload);
  req.end();
}

function isAdmin(chatId) {
  return ADMIN_ID && String(chatId) === String(ADMIN_ID);
}

// /start কমান্ড
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "স্বাগতম @number_24_bot-এ! নিচের অপশন বেছে নিন:", {
    reply_markup: {
      keyboard: [[{ text: "📞 GET NUMBER" }]],
      resize_keyboard: true
    }
  });
});

// সার্ভিস ও নম্বর দেখার হ্যান্ডলার
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (text === "/start") return;

  // অ্যাডমিন দিয়ে দ্রুত সার্ভিস/নম্বর যোগ করার উদাহরণ: /addservice whatsapp WhatsApp
  if (text.startsWith("/addservice ") && isAdmin(chatId)) {
    const parts = text.split(" ");
    const key = (parts[1] || "").toLowerCase();
    const label = parts.slice(2).join(" ") || key;
    if (!key) return bot.sendMessage(chatId, "ব্যবহার: /addservice whatsapp WhatsApp");

    db.services[key] = db.services[key] || { name: label, countries: {} };
    saveDatabaseToFirebase();
    return bot.sendMessage(chatId, `সার্ভিস যুক্ত হয়েছে: ${label}`);
  }

  // অ্যাডমিন দিয়ে নম্বর যোগ করার উদাহরণ: /addnum whatsapp bd +8801700000000
  if (text.startsWith("/addnum ") && isAdmin(chatId)) {
    const [, srvKey, ctryKey, num] = text.split(" ");
    if (!srvKey || !ctryKey || !num) {
      return bot.sendMessage(chatId, "ব্যবহার: /addnum whatsapp bd +8801700000000");
    }
    const sKey = srvKey.toLowerCase();
    const cKey = ctryKey.toLowerCase();
    db.services[sKey] = db.services[sKey] || { name: srvKey, countries: {} };
    db.services[sKey].countries[cKey] = db.services[sKey].countries[cKey] || {
      name: ctryKey.toUpperCase(),
      numbers: []
    };
    db.services[sKey].countries[cKey].numbers.push(num);
    saveDatabaseToFirebase();
    return bot.sendMessage(chatId, `নম্বর যুক্ত হয়েছে: ${num} (${db.services[sKey].name} - ${cKey.toUpperCase()})`);
  }

  if (text === "📞 GET NUMBER") {
    const serviceKeys = Object.keys(db.services);
    if (!serviceKeys.length) {
      return bot.sendMessage(chatId, "এই মুহূর্তে কোনো সার্ভিস বা নম্বর যুক্ত করা নেই।");
    }

    const inlineKeyboard = serviceKeys.map((key) => [
      { text: db.services[key].name || key, callback_data: `srv:${key}` }
    ]);

    return bot.sendMessage(chatId, "সার্ভিস সিলেক্ট করুন:", {
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
  }
});

// Inline বাটন হ্যান্ডলার (সার্ভিস -> দেশ -> নম্বর)
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data || "";

  if (data.startsWith("srv:")) {
    const srvKey = data.replace("srv:", "");
    const srv = db.services[srvKey];
    if (!srv) return bot.answerCallbackQuery(query.id, { text: "সার্ভিস পাওয়া যায়নি" });

    const countries = Object.keys(srv.countries || {});
    if (!countries.length) {
      bot.answerCallbackQuery(query.id);
      return bot.sendMessage(chatId, `${srv.name}-এর জন্য কোনো দেশ/নম্বর নেই।`);
    }

    const buttons = countries.map((cKey) => [
      { text: srv.countries[cKey].name || cKey, callback_data: `ctry:${srvKey}:${cKey}` }
    ]);

    bot.answerCallbackQuery(query.id);
    return bot.sendMessage(chatId, `${srv.name} — দেশ সিলেক্ট করুন:`, {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  if (data.startsWith("ctry:")) {
    const [, srvKey, ctryKey] = data.split(":");
    const ctry = db.services[srvKey]?.countries?.[ctryKey];
    if (!ctry || !ctry.numbers?.length) {
      bot.answerCallbackQuery(query.id);
      return bot.sendMessage(chatId, "এই দেশে কোনো নম্বর উপলব্ধ নেই।");
    }

    const num = ctry.numbers[0];
    bot.answerCallbackQuery(query.id);
    return bot.sendMessage(chatId, `নম্বর: \`${num}\``, { parse_mode: "Markdown" });
  }
});

// UptimeRobot ও Render হেলথ চেকের জন্য HTTP সার্ভার
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Bot @number_24_bot is running");
});

loadDatabaseFromFirebase().then(() => {
  server.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
    console.log("Bot @number_24_bot with Admin Panel is running...");
  });
});
