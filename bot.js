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
const adminState = new Map();
const otpWatchers = new Map();

function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

function makeKey(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function titleCase(str) {
  return str
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function getServiceEmoji(serviceKey) {
  const map = {
    whatsapp: "🟢",
    telegram: "🔵",
    instagram: "🟣",
    facebook: "🔷",
    tiktok: "🎵",
    viber: "💜",
  };
  return map[serviceKey] || "📱";
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
  const ccDigits = (countryData.cc || "").replace("+", "");

  const rows = selected.map((fullNum) => {
    const cleanNum =
      session.removeCC && ccDigits && fullNum.startsWith(ccDigits)
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

  const serviceTitle = titleCase(service);
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

function adminMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📄 Upload Numbers", "adm_menu:numbers")],
    [
      Markup.button.callback("🧩 Manage Services", "adm_menu:services"),
      Markup.button.callback("🌍 Manage Countries", "adm_menu:countries"),
    ],
  ]);
}

function openAdminPanel(ctx, isEdit = false) {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("❌ এই মেনুটি শুধুমাত্র অ্যাডমিনের জন্য।");
  }
  adminState.delete(ctx.from.id);
  const text =
    "⚙️ *Admin Panel*\nনিচ থেকে কী ম্যানেজ করতে চান তা সিলেক্ট করুন:";
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

bot.command("admin", (ctx) => openAdminPanel(ctx, false));
bot.hears("⚙️ ADMIN PANEL", (ctx) => openAdminPanel(ctx, false));

bot.action("adm_home", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  await openAdminPanel(ctx, true);
});

// --- SERVICE MANAGEMENT ---
bot.action("adm_menu:services", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();

  const keys = Object.keys(numbersDatabase);
  const rows = [
    [Markup.button.callback("➕ Add New Service", "adm_srv_add")],
  ];

  keys.forEach((srvKey) => {
    const cntCount = Object.keys(numbersDatabase[srvKey] || {}).length;
    rows.push([
      Markup.button.callback(
        `🗑 Remove ${getServiceEmoji(srvKey)} ${titleCase(srvKey)} (${cntCount} দেশ)`,
        `adm_srv_del:${srvKey}`
      ),
    ]);
  });

  rows.push([Markup.button.callback("⬅️ Back to Admin", "adm_home")]);

  await ctx.editMessageText(
    "🧩 *Service Management*\nনতুন সার্ভিস যুক্ত করুন অথবা যেকোনো সার্ভিস রিমুভ করুন:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(rows),
    }
  );
});

bot.action("adm_srv_add", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  adminState.set(ctx.from.id, { step: "add_service" });

  await ctx.editMessageText(
    "➕ *নতুন সার্ভিস যুক্ত করুন*\nসার্ভিসের নাম লিখে পাঠান (যেমন: `TikTok` বা `Viber` বা `Signal`):",
    { parse_mode: "Markdown" }
  );
});

bot.action(/^adm_srv_del:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const srvKey = ctx.match[1];

  if (!numbersDatabase[srvKey]) {
    return ctx.editMessageText("⚠️ সার্ভিসটি পাওয়া যায়নি।");
  }

  delete numbersDatabase[srvKey];
  await ctx.editMessageText(
    `✅ *${titleCase(srvKey)}* সার্ভিসটি রিমুভ করা হয়েছে।`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back to Services", "adm_menu:services")],
        [Markup.button.callback("🏠 Admin Panel", "adm_home")],
      ]),
    }
  );
});

// --- COUNTRY MANAGEMENT ---
bot.action("adm_menu:countries", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();

  const keys = Object.keys(numbersDatabase);
  if (keys.length === 0) {
    return ctx.editMessageText(
      "⚠️ কোনো সার্ভিস নেই। আগে সার্ভিস যুক্ত করুন।",
      Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back to Admin", "adm_home")],
      ])
    );
  }

  const buttons = keys.map((k) => [
    Markup.button.callback(
      `${getServiceEmoji(k)} ${titleCase(k)}`,
      `adm_cnt_srv:${k}`
    ),
  ]);
  buttons.push([Markup.button.callback("⬅️ Back to Admin", "adm_home")]);

  await ctx.editMessageText(
    "🌍 *Country Management*\nকোন সার্ভিসের দেশ যুক্ত বা রিমুভ করবেন?",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    }
  );
});

bot.action(/^adm_cnt_srv:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const srvKey = ctx.match[1];
  const countries = numbersDatabase[srvKey] || {};

  const rows = [
    [
      Markup.button.callback(
        `➕ Add Country to ${titleCase(srvKey)}`,
        `adm_cnt_add:${srvKey}`
      ),
    ],
  ];

  Object.entries(countries).forEach(([cKey, cData]) => {
    rows.push([
      Markup.button.callback(
        `🗑 Remove ${cData.flag} ${cData.name} (${cData.cc})`,
        `adm_cnt_del:${srvKey}:${cKey}`
      ),
    ]);
  });

  rows.push([Markup.button.callback("⬅️ Back", "adm_menu:countries")]);

  await ctx.editMessageText(
    `🌍 *${titleCase(srvKey)}* এর দেশসমূহ:\nনতুন দেশ যোগ করতে *Add Country* চাপুন বা কোনো দেশের নামের ওপর চাপ দিয়ে রিমুভ করুন।`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(rows),
    }
  );
});

bot.action(/^adm_cnt_add:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const srvKey = ctx.match[1];

  adminState.set(ctx.from.id, { step: "add_country", service: srvKey });

  await ctx.editMessageText(
    `➕ *${titleCase(srvKey)}* এ নতুন দেশ যুক্ত করুন\n\n` +
      `এই ফরম্যাটে লিখুন:\n` +
      `\`দেশের নাম, পতাকা, কান্ট্রি কোড\`\n\n` +
      `উদাহরণ:\n` +
      `\`Bangladesh, 🇧🇩, +880\`\n` +
      `বা \`United States, 🇺🇸, +1\``,
    { parse_mode: "Markdown" }
  );
});

bot.action(/^adm_cnt_del:(.+):(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const [, srvKey, cKey] = ctx.match;

  const removed = numbersDatabase[srvKey]?.[cKey];
  if (!removed) {
    return ctx.editMessageText("⚠️ দেশটি পাওয়া যায়নি।");
  }

  delete numbersDatabase[srvKey][cKey];

  await ctx.editMessageText(
    `✅ *${titleCase(srvKey)}* থেকে *${removed.flag} ${removed.name}* রিমুভ করা হয়েছে।`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back to Countries", `adm_cnt_srv:${srvKey}`)],
        [Markup.button.callback("🏠 Admin Panel", "adm_home")],
      ]),
    }
  );
});

// --- UPLOAD NUMBERS ---
bot.action("adm_menu:numbers", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();

  const keys = Object.keys(numbersDatabase);
  if (keys.length === 0) {
    return ctx.editMessageText(
      "⚠️ আগে অন্তত ১টি সার্ভিস যুক্ত করুন।",
      Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back to Admin", "adm_home")],
      ])
    );
  }

  const buttons = keys.map((k) => [
    Markup.button.callback(
      `${getServiceEmoji(k)} ${titleCase(k)}`,
      `adm_srv:${k}`
    ),
  ]);
  buttons.push([Markup.button.callback("⬅️ Back to Admin", "adm_home")]);

  await ctx.editMessageText(
    "📄 *Upload Numbers*\nকোন সার্ভিসের নম্বর ফাইল বা লিস্ট সেট করতে চান?",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    }
  );
});

bot.action(/^adm_srv:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const service = ctx.match[1];
  const countries = numbersDatabase[service] || {};

  const buttons = Object.entries(countries).map(([key, d]) => [
    Markup.button.callback(
      `${d.flag} ${d.name} (${d.cc}) — ${d.numbers.length} টি`,
      `adm_cnt:${service}:${key}`
    ),
  ]);

  if (buttons.length === 0) {
    buttons.push([
      Markup.button.callback(
        `➕ Add Country to ${titleCase(service)}`,
        `adm_cnt_add:${service}`
      ),
    ]);
  }
  buttons.push([Markup.button.callback("⬅️ Back", "adm_menu:numbers")]);

  await ctx.editMessageText(
    `🌍 *${titleCase(service)}* এর কোন দেশে নম্বর সেট করবেন?`,
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
    `📄 *${titleCase(service)} - ${countryKey.toUpperCase()}* এর জন্য নম্বর সেট করার মোড বেছে নিন:\n` +
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
        [Markup.button.callback("⬅️ Back", `adm_srv:${service}`)],
      ]),
    }
  );
});

bot.action(/^adm_mode:(.+):(.+):(replace|append)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Unauthorized");
  await ctx.answerCbQuery();
  const [, service, countryKey, mode] = ctx.match;

  adminState.set(ctx.from.id, {
    step: "upload_numbers",
    service,
    countryKey,
    mode,
  });

  await ctx.editMessageText(
    `📥 এখন *${titleCase(service)} (${countryKey.toUpperCase()})* এর জন্য:\n` +
      `1️⃣ একটি *.txt* ফাইল পাঠান (প্রতি লাইনে ১টি নম্বর), অথবা\n` +
      `2️⃣ সরাসরি মেসেজে নম্বরগুলো পেস্ট করে পাঠান (প্রতি লাইনে ১টি নম্বর)।`,
    { parse_mode: "Markdown" }
  );
});

bot.on("document", async (ctx) => {
  const uid = ctx.from.id;
  if (!isAdmin(uid)) return;
  const st = adminState.get(uid);
  if (!st || st.step !== "upload_numbers") return;

  try {
    const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
    const response = await fetch(fileLink.href);
    const content = await response.text();
    const parsed = parseNumbersFromText(content);

    if (parsed.length === 0) {
      return ctx.reply("⚠️ ফাইলে কোনো বৈধ নম্বর পাওয়া যায়নি।");
    }

    const target = numbersDatabase[st.service]?.[st.countryKey];
    if (!target) return ctx.reply("⚠️ টার্গেট দেশ পাওয়া যায়নি।");

    target.numbers =
      st.mode === "replace" ? parsed : [...target.numbers, ...parsed];

    adminState.delete(uid);
    await ctx.reply(
      `✅ সফলভাবে *${parsed.length}* টি নম্বর *${titleCase(st.service)} (${target.name})* এ সেট করা হয়েছে! মোট নম্বর: *${target.numbers.length}* টি।`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("File upload error:", err);
    await ctx.reply("❌ ফাইল প্রসেস করতে সমস্যা হয়েছে।");
  }
});

// --- USER FLOW ---
bot.start((ctx) => {
  ctx.reply("স্বাগতম! নিচের *GET NUMBER* বাটনে চাপ দিয়ে শুরু করুন:", {
    parse_mode: "Markdown",
    ...mainKeyboard(ctx.from.id),
  });
});

function showServicesMenu(ctx, isEdit = false) {
  const serviceKeys = Object.keys(numbersDatabase);
  if (serviceKeys.length === 0) {
    const emptyText = "❌ বর্তমানে কোনো সার্ভিস চালু নেই।";
    return isEdit
      ? ctx.editMessageText(emptyText)
      : ctx.reply(emptyText);
  }

  const text = "📌 *আপনি কিসের কাজ করবেন?* নিচ থেকে সিলেক্ট করুন:";
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
  await ctx.answerCbQuery();
  const service = ctx.match[1];
  const countries = numbersDatabase[service];

  if (!countries || Object.keys(countries).length === 0) {
    return ctx.editMessageText(
      "❌ এই সার্ভিসের জন্য বর্তমানে কোনো দেশের নাম্বার সেট করা নেই।",
      Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back to Services", "back_services")],
      ])
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

  const serviceTitle = titleCase(service);
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
  const st = adminState.get(uid);
  if (!st) return;

  if (st.step === "add_service") {
    const srvKey = makeKey(ctx.message.text);
    if (!srvKey) {
      return ctx.reply("⚠️ সঠিক সার্ভিসের নাম লিখুন (যেমন: `TikTok`)।", {
        parse_mode: "Markdown",
      });
    }
    if (!numbersDatabase[srvKey]) {
      numbersDatabase[srvKey] = {};
    }
    adminState.delete(uid);
    return ctx.reply(
      `✅ সার্ভিস *${titleCase(srvKey)}* যুক্ত হয়েছে! এখন *Manage Countries* থেকে এতে দেশ যোগ করতে পারবেন।`,
      { parse_mode: "Markdown", ...adminMenuKeyboard() }
    );
  }

  if (st.step === "add_country") {
    const parts = ctx.message.text.split(",").map((p) => p.trim());
    const nameRaw = parts[0] || "";
    const flag = parts[1] || "🏳️";
    const rawCc = parts[2] || "+1";
    const cc = rawCc.startsWith("+") ? rawCc : `+${rawCc}`;
    const cKey = makeKey(nameRaw);

    if (!cKey) {
      return ctx.reply(
        "⚠️ সঠিক ফরম্যাটে লিখুন:\n`Bangladesh, 🇧🇩, +880`",
        { parse_mode: "Markdown" }
      );
    }

    if (!numbersDatabase[st.service]) {
      numbersDatabase[st.service] = {};
    }

    numbersDatabase[st.service][cKey] = {
      name: titleCase(nameRaw),
      flag,
      cc,
      numbers: numbersDatabase[st.service][cKey]?.numbers || [],
    };

    const srvName = titleCase(st.service);
    adminState.delete(uid);
    return ctx.reply(
      `✅ *${srvName}* এ *${flag} ${titleCase(nameRaw)} (${cc})* যুক্ত হয়েছে!`,
      { parse_mode: "Markdown", ...adminMenuKeyboard() }
    );
  }

  if (st.step === "upload_numbers") {
    const parsed = parseNumbersFromText(ctx.message.text);
    if (parsed.length === 0) {
      return ctx.reply("⚠️ বৈধ নম্বর পাওয়া যায়নি। প্রতি লাইনে ১টি নম্বর দিন।");
    }

    const target = numbersDatabase[st.service]?.[st.countryKey];
    if (!target) return ctx.reply("⚠️ টার্গেট দেশ পাওয়া যায়নি।");

    target.numbers =
      st.mode === "replace" ? parsed : [...target.numbers, ...parsed];

    adminState.delete(uid);
    return ctx.reply(
      `✅ *${parsed.length}* টি নম্বর *${titleCase(st.service)} (${target.name})* এ যুক্ত হয়েছে! মোট নম্বর: *${target.numbers.length}* টি।`,
      { parse_mode: "Markdown" }
    );
  }
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
