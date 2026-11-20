const http = require("http");
const { Telegraf, Markup } = require("telegraf");

const BOT_TOKEN =
  process.env.BOT_TOKEN || "8858718658:AAEseXDeVWZdDAkTsC2cu_fDYrxsZuvelAE";

const ADMIN_IDS = [8771921458];

const FIREBASE_DB_URL =
  process.env.FIREBASE_DB_URL ||
  "https://your-project-default-rtdb.firebaseio.com/";

const bot = new Telegraf(BOT_TOKEN);

const numbersDatabase = {
  whatsapp: {
    cuba: {
      name: "Cuba",
      flag: "🇨🇺",
      cc: "+53",
      numbers: ["5363156365", "5363156485", "5363156512"],
    },
    tanzania: {
      name: "Tanzania",
      flag: "🇹🇿",
      cc: "+255",
      numbers: ["255650999626", "255650999627", "255650999628"],
    },
  },
  telegram: {
    cuba: {
      name: "Cuba",
      flag: "🇨🇺",
      cc: "+53",
      numbers: ["5363157101", "5363157102", "5363157103"],
    },
  },
  instagram: {
    cuba: {
      name: "Cuba",
      flag: "🇨🇺",
      cc: "+53",
      numbers: ["5363157201", "5363157202", "5363157203"],
    },
  },
  facebook: {
    cuba: {
      name: "Cuba",
      flag: "🇨🇺",
      cc: "+53",
      numbers: ["5363157301", "5363157302", "5363157303"],
    },
  },
};

const userSession = new Map();
const adminUploadState = new Map();
const otpWatchers = new Map();

function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

function parseNumbersFromText(rawText) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/[^\d]/g, "").trim())
    .filter((num) => num.length >= 6);
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
    rows.push(["⚙️ ADMIN PANEL"]);
  }
  return Markup.keyboard(rows).resize();
}

function getThreeNumbers(list, offset = 0) {
  if (!list || list.length === 0) return [];
  const result = [];
  for (let i = 0; i < Math.min(3, list.length); i++) {
    result.push(list[(offset + i) % list.length]);
  }
  return result;
}

async function readOtpFromFirebase(phone) {
  try {
    if (
      !FIREBASE_DB_URL.startsWith("https://") ||
      FIREBASE_DB_URL.includes("your-project")
    ) {
      return null;
    }
    const url = `${FIREBASE_DB_URL.replace(/\/+$/, "")}/otps/${phone}.json`;
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
    if (
      !FIREBASE_DB_URL.startsWith("https://") ||
      FIREBASE_DB_URL.includes("your-project")
    ) {
      return;
    }
    const url = `${FIREBASE_DB_URL.replace(/\/+$/, "")}/otps/${phone}.json`;
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
    const code = await readOtpFromFirebase(phone);

    if (code) {
      stopOtpWatcher(uid);
      await markOtpUsedInFirebase(phone);

      const serviceLabel = service.toUpperCase();
      await bot.telegram.sendMessage(
        chatId,
        `${countryData.flag} *${serviceLabel}*  \`${phone}\`\n✅ *Code Received (চাপ দিয়ে কপি করুন):*`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `💬 📋 ${code}`,
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

function buildNumbersView(uid, service, countryKey) {
  const countryData = numbersDatabase[service]?.[countryKey];
  if (!countryData) return null;

  const session = userSession.get(uid) || { offset: 0, removeCC: false };
  const selected = getThreeNumbers(countryData.numbers, session.offset);
  const ccDigits = countryData.cc.replace("+", "");

  const rows = selected.map((fullNum) => {
    const cleanNum =
      session.removeCC && fullNum.startsWith(ccDigits)
        ? fullNum.slice(ccDigits.length)
        : `+${fullNum}`;

    return [
      {
        text: `${countryData.flag} 📋 ${cleanNum}`,
        copy_text: { text: cleanNum },
      },
    ];
  });

  rows.push([
    {
      text: session.removeCC ? "✅ Add CC" : "❌ Remove CC",
      callback_data: `toggle_cc:${service}:${countryKey}`,
    },
  ]);
  rows.push([
    {
      text: "🔄 Change Number",
      callback_data: `change_num:${service}:${countryKey}`,
    },
  ]);
  rows.push([
    {
      text: "🌐 Change Country",
      callback_data: `service:${service}`,
    },
  ]);
  rows.push([
    {
      text: "📂 Otp Group",
      url: "https://t.me/your_otp_group_link",
    },
  ]);

  const serviceTitle = service.charAt(0).toUpperCase() + service.slice(1);
  const text =
    `${countryData.flag} *${serviceTitle} Number Assigned:*\n` +
    `⏳ *Waiting for OTP....*\n\n` +
    `_(নাম্বারের ওপর চাপ দিলেই কপি হয়ে যাবে)_`;

  return {
    text,
    extra: {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: rows },
    },
  };
}

function openAdminPanel(ctx) {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("❌ এই মেনুটি শুধুমাত্র অ্যাডমিনের জন্য।");
  }
  return ctx.reply(
    "⚙️ *Admin Panel*\nকোন সার্ভিসের নম্বর ফাইল বা লিস্ট সেট করতে চান?",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("🟢 WhatsApp", "adm_srv:whatsapp"),
          Markup.button.callback("🔵 Telegram", "adm_srv:telegram"),
        ],
        [
          Markup.button.callback("🟣 Instagram", "adm_srv:instagram"),
          Markup.button.callback("🔷 Facebook", "adm_srv:facebook"),
        ],
      ]),
    }
  );
}

bot.command("admin", openAdminPanel);
bot.hears("⚙️ ADMIN PANEL", openAdminPanel);

bot.action(/^adm_srv:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const service = ctx.match[1];
  const countries = numbersDatabase[service] || {};

  const buttons = Object.entries(countries).map(([key, d]) => [
    Markup.button.callback(
      `${d.flag} ${d.name} (${d.numbers.length} টি)`,
      `adm_cnt:${service}:${key}`
    ),
  ]);

  await ctx.editMessageText(
    `🌍 *${service.toUpperCase()}* এর কোন দেশে নম্বর সেট করবেন?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    }
  );
});

bot.action(/^adm_cnt:(.+):(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const [, service, countryKey] = ctx.match;

  await ctx.editMessageText(
    `📄 *${service.toUpperCase()} - ${countryKey.toUpperCase()}* এর জন্য নম্বর সেট করার মোড বেছে নিন:\n` +
      `• *Replace List*: আগের নম্বর মুছে নতুন ফাইল/লিস্ট বসাবে\n` +
      `• *Add Numbers*: আগের নম্বরের সাথে নতুন নম্বর যোগ করবে`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "♻️ Replace List",
            `adm_mode:${service}:${countryKey}:replace`
          ),
          Markup.button.callback(
            "➕ Add Numbers",
            `adm_mode:${service}:${countryKey}:append`
          ),
        ],
      ]),
    }
  );
});

bot.action(/^adm_mode:(.+):(.+):(replace|append)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const [, service, countryKey, mode] = ctx.match;

  adminUploadState.set(ctx.from.id, { service, countryKey, mode });

  await ctx.editMessageText(
    `📥 এখন *${service.toUpperCase()} (${countryKey.toUpperCase()})* এর জন্য:\n` +
      `1️⃣ একটি *.txt* ফাইল পাঠান (প্রতি লাইনে ১টি নম্বর), অথবা\n` +
      `2️⃣ সরাসরি মেসেজে নম্বরগুলো পেস্ট করে পাঠান (প্রতি লাইনে ১টি নম্বর)।`,
    { parse_mode: "Markdown" }
  );
});

bot.on("document", async (ctx) => {
  const uid = ctx.from.id;
  if (!isAdmin(uid)) return;
  const uploadCfg = adminUploadState.get(uid);
  if (!uploadCfg) return;

  try {
    const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
    const response = await fetch(fileLink.href);
    const content = await response.text();
    const parsed = parseNumbersFromText(content);

    if (parsed.length === 0) {
      return ctx.reply("⚠️ ফাইলে কোনো বৈধ নম্বর পাওয়া যায়নি।");
    }

    const target = numbersDatabase[uploadCfg.service]?.[uploadCfg.countryKey];
    if (!target) return ctx.reply("⚠️ টার্গেট দেশ পাওয়া যায়নি।");

    target.numbers =
      uploadCfg.mode === "replace"
        ? parsed
        : [...target.numbers, ...parsed];

    adminUploadState.delete(uid);
    await ctx.reply(
      `✅ সফলভাবে *${parsed.length}* টি নম্বর *${uploadCfg.service.toUpperCase()} (${target.name})* এ সেট করা হয়েছে! মোট নম্বর: *${target.numbers.length}* টি।`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("File upload error:", err);
    await ctx.reply("❌ ফাইল প্রসেস করতে সমস্যা হয়েছে।");
  }
});

bot.start((ctx) => {
  ctx.reply("স্বাগতম! নিচের *GET NUMBER* বাটনে চাপ দিয়ে শুরু করুন:", {
    parse_mode: "Markdown",
    ...mainKeyboard(ctx.from.id),
  });
});

function showServicesMenu(ctx, isEdit = false) {
  const text = "📌 *আপনি কিসের কাজ করবেন?* নিচ থেকে সিলেক্ট করুন:";
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("🟢 WhatsApp", "service:whatsapp"),
      Markup.button.callback("🔵 Telegram", "service:telegram"),
    ],
    [
      Markup.button.callback("🟣 Instagram", "service:instagram"),
      Markup.button.callback("🔷 Facebook", "service:facebook"),
    ],
  ]);

  if (isEdit) {
    return ctx.editMessageText(text, { parse_mode: "Markdown", ...keyboard });
  }
  return ctx.reply(text, { parse_mode: "Markdown", ...keyboard });
}

bot.hears("📞 GET NUMBER", (ctx) => showServicesMenu(ctx, false));

bot.action(/^service:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const service = ctx.match[1];
  const countries = numbersDatabase[service];

  if (!countries || Object.keys(countries).length === 0) {
    return ctx.editMessageText(
      "❌ এই সার্ভিসের জন্য বর্তমানে কোনো দেশের নাম্বার সেট করা নেই।"
    );
  }

  const countryButtons = Object.entries(countries).map(([key, data]) => [
    Markup.button.callback(
      `${data.flag} ${data.name} (${data.cc})`,
      `country:${service}:${key}`
    ),
  ]);
  countryButtons.push([
    Markup.button.callback("⬅️ Back to Services", "back_services"),
  ]);

  const serviceTitle = service.charAt(0).toUpperCase() + service.slice(1);
  await ctx.editMessageText(`🌍 *${serviceTitle}* এর জন্য দেশ নির্বাচন করুন:`, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(countryButtons),
  });
});

bot.action("back_services", async (ctx) => {
  await ctx.answerCbQuery();
  await showServicesMenu(ctx, true);
});

bot.action(/^country:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const [, service, countryKey] = ctx.match;
  const uid = ctx.from.id;

  userSession.set(uid, { offset: 0, removeCC: false });
  const view = buildNumbersView(uid, service, countryKey);
  if (view) {
    await ctx.editMessageText(view.text, view.extra);
    const firstNum = numbersDatabase[service][countryKey].numbers[0];
    if (firstNum) {
      startOtpWatcher(ctx, service, numbersDatabase[service][countryKey], firstNum);
    }
  }
});

bot.action(/^change_num:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCbQuery("নতুন ৩টি নাম্বার লোড হচ্ছে...");
  const [, service, countryKey] = ctx.match;
  const uid = ctx.from.id;

  const current = userSession.get(uid) || { offset: 0, removeCC: false };
  current.offset += 3;
  userSession.set(uid, current);

  const view = buildNumbersView(uid, service, countryKey);
  if (view) {
    await ctx.editMessageText(view.text, view.extra);
    const list = numbersDatabase[service][countryKey].numbers;
    if (list.length > 0) {
      const nextNum = list[current.offset % list.length];
      startOtpWatcher(ctx, service, numbersDatabase[service][countryKey], nextNum);
    }
  }
});

bot.action(/^toggle_cc:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const [, service, countryKey] = ctx.match;
  const uid = ctx.from.id;

  const current = userSession.get(uid) || { offset: 0, removeCC: false };
  current.removeCC = !current.removeCC;
  userSession.set(uid, current);

  const view = buildNumbersView(uid, service, countryKey);
  if (view) {
    await ctx.editMessageText(view.text, view.extra);
  }
});

bot.hears("👛 WALLET", (ctx) =>
  ctx.reply("👛 আপনার অ্যাকাউন্ট ফ্রি মোডে চালু আছে।")
);
bot.hears("📡 TRAFFIC", (ctx) =>
  ctx.reply("📡 সার্ভার স্ট্যাটাস: অনলাইন এবং সচল।")
);
bot.hears("✅ WA CHECKER", (ctx) =>
  ctx.reply("✅ নাম্বার চেকার সক্রিয় রয়েছে।")
);
bot.hears("🌐 LANGUAGE", (ctx) => ctx.reply("🌐 ভাষা: বাংলা / English"));
bot.hears("🆘 SUPPORT", (ctx) =>
  ctx.reply("🆘 যেকোনো প্রয়োজনে অ্যাডমিনকে মেসেজ দিন।")
);
bot.hears("📄 NUMBER FILE", (ctx) =>
  ctx.reply("📄 সব নাম্বার মেনু থেকেই কপি করতে পারবেন।")
);

bot.on("text", async (ctx) => {
  const uid = ctx.from.id;
  if (!isAdmin(uid)) return;
  const uploadCfg = adminUploadState.get(uid);
  if (!uploadCfg) return;

  const parsed = parseNumbersFromText(ctx.message.text);
  if (parsed.length === 0) {
    return ctx.reply("⚠️ বৈধ নম্বর পাওয়া যায়নি। প্রতি লাইনে ১টি নম্বর দিন।");
  }

  const target = numbersDatabase[uploadCfg.service]?.[uploadCfg.countryKey];
  if (!target) return ctx.reply("⚠️ টার্গেট দেশ পাওয়া যায়নি।");

  target.numbers =
    uploadCfg.mode === "replace" ? parsed : [...target.numbers, ...parsed];

  adminUploadState.delete(uid);
  await ctx.reply(
    `✅ *${parsed.length}* টি নম্বর *${uploadCfg.service.toUpperCase()} (${target.name})* এ যুক্ত হয়েছে! মোট নম্বর: *${target.numbers.length}* টি।`,
    { parse_mode: "Markdown" }
  );
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

bot.launch();
console.log("Bot @number_24_bot with Admin Panel is running...");
