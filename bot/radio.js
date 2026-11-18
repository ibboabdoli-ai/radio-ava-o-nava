"use strict";

const ADMIN_IDS = new Set((process.env.TELEGRAM_ADMIN_IDS || "").split(",").map(x => x.trim()).filter(Boolean));
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || "";
const GROUP_ID = process.env.TELEGRAM_GROUP_ID || "";
const SITE = "https://radio.ibboabdoli.com/";
const HOUSE = "https://www.clubhouse.com/house/%D8%A7%D9%88%D8%A7-%D9%88-%D9%86%D9%88%D8%A7-%D9%85%D9%88%D8%B3%DB%8C%D9%82%DB%8C-%D8%B2%D9%86%D8%AF%D9%87-%D8%B4%D8%B9%D8%B1-%D9%88-%D8%A2%D9%88%D8%A7%D8%B2";
const REPO = process.env.RADIO_GITHUB_REPO || "ibboabdoli-ai/radio-ava-o-nava";
const BRANCH = process.env.RADIO_GITHUB_BRANCH || "main";

// Warm serverless instances suppress duplicate Telegram webhook deliveries.
const seenUpdates = new Map();
const MAX_SEEN_UPDATES = 2000;

function validRoom(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" &&
      ["clubhouse.com", "www.clubhouse.com"].includes(u.hostname) &&
      !u.username && !u.password &&
      /^\/(i|room)\/[^/\s]+/.test(u.pathname) ? u.href : null;
  } catch {
    return null;
  }
}

function keyboard() {
  return {
    keyboard: [
      [{ text: "ورود به روم کلاب‌هاوس" }],
      [{ text: "پخش زنده رادیو" }],
      [{ text: "ساعت برنامه‌ها" }],
      [{ text: "درباره آوا و نوا" }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

function roomText(value) {
  return value && validRoom(value) ? value : HOUSE;
}

function welcomeText(members, activeRoom) {
  const names = members
    .filter(member => !member.is_bot)
    .map(member => [member.first_name, member.last_name].filter(Boolean).join(" ").trim())
    .filter(Boolean);
  if (!names.length) return "";
  return "به گروه رادیو آوا و نوا خوش آمدید، " + names.join("، ") + " 🌷\n" +
    "موسیقی زنده، شعر و آواز؛ شنبه تا چهارشنبه ساعت ۲۲ به وقت ایران.\n" +
    "رادیو: " + SITE + "\n" +
    "روم کلاب‌هاوس: " + roomText(activeRoom);
}

function faqReply(text) {
  const value = String(text || "").toLowerCase();
  if (/ساعت|چه موقع|کی شروع|برنامه.*هفت|schedule/.test(value))
    return "برنامه‌ها شنبه تا چهارشنبه، ساعت ۲۲ به وقت ایران برگزار می‌شود.";
  if (/شرکت|وارد.*روم|چطور.*بیام|چگونه.*بیام|مهمان|میکروفون/.test(value))
    return "در ساعت برنامه، دکمهٔ «ورود به روم کلاب‌هاوس» را بزنید و از داخل روم درخواست ورود به صحنه بفرستید.";
  if (/روم|کلاب.?هاوس|clubhouse|لینک.*هاوس/.test(value))
    return "برای ورود به روم کلاب‌هاوس، دکمهٔ «ورود به روم کلاب‌هاوس» را بزنید. اگر روم فعال نباشد، لینک هاوس نمایش داده می‌شود.";
  if (/رادیو|پخش زنده|لایو|stream/.test(value))
    return "برای شنیدن پخش زنده، دکمهٔ «پخش زنده رادیو» را بزنید یا سایت را باز کنید: " + SITE;
  return "";
}

async function telegram(method, data) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Bot is not configured");
  const response = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error("Telegram HTTP " + response.status);
  const result = await response.json();
  if (!result.ok) throw new Error("Telegram API error");
  return result.result;
}

function send(chat_id, text, reply_markup) {
  return telegram("sendMessage", {
    chat_id,
    text,
    reply_markup,
    link_preview_options: { is_disabled: true }
  });
}

function githubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "radio-ava-o-nava-bot",
    "Content-Type": "application/json"
  };
  if (process.env.RADIO_GITHUB_TOKEN) headers.Authorization = "Bearer " + process.env.RADIO_GITHUB_TOKEN;
  return headers;
}

async function program() {
  const url = "https://api.github.com/repos/" + REPO + "/contents/program.json?ref=" + encodeURIComponent(BRANCH);
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) throw new Error("Program data unavailable");
  const file = await response.json();
  return { sha: file.sha, value: JSON.parse(Buffer.from(file.content, "base64").toString("utf8")) };
}

async function updateRoom(url) {
  if (!process.env.RADIO_GITHUB_TOKEN) throw new Error("Room updates are not configured");
  const current = await program();
  if (current.value.roomUrl === url) return false;
  current.value.roomUrl = url;
  const response = await fetch("https://api.github.com/repos/" + REPO + "/contents/program.json", {
    method: "PUT",
    headers: githubHeaders(),
    body: JSON.stringify({
      message: "Update Clubhouse room from Telegram",
      branch: BRANCH,
      sha: current.sha,
      content: Buffer.from(JSON.stringify(current.value, null, 2) + "\n").toString("base64")
    })
  });
  if (!response.ok) throw new Error("Room update failed");
  return true;
}

function isAdmin(message) {
  return message.chat.type === "private" && ADMIN_IDS.has(String(message.from.id));
}

function rememberUpdate(updateId) {
  if (!Number.isInteger(updateId)) return false;
  if (seenUpdates.has(updateId)) return true;
  seenUpdates.set(updateId, Date.now());
  if (seenUpdates.size > MAX_SEEN_UPDATES) seenUpdates.delete(seenUpdates.keys().next().value);
  return false;
}

async function handle(update) {
  if (!update || rememberUpdate(update.update_id)) return;

  const post = update.channel_post;
  if (post && CHANNEL_ID && String(post.chat.id) === String(CHANNEL_ID)) {
    const match = (post.text || post.caption || "").match(/https:\/\/(?:www\.)?clubhouse\.com\/(?:i|room)\/[^\s]+/);
    const url = match && validRoom(match[0]);
    if (url) await updateRoom(url);
    return;
  }

  const message = update.message;
  if (!message || !message.chat) return;
  const chat = message.chat.id;
  const text = (message.text || "").trim();
  const command = text.replace(/^\/([A-Za-z0-9_]+)@[A-Za-z0-9_]+/, "/$1");
  const privateChat = message.chat.type === "private";

  if (Array.isArray(message.new_chat_members)) {
    let activeRoom = "";
    try { activeRoom = (await program()).value.roomUrl; } catch {}
    const greeting = welcomeText(message.new_chat_members, activeRoom);
    if (greeting) await send(chat, greeting);
    return;
  }

  if (command === "/whoami" && privateChat)
    return send(chat, "شناسهٔ تلگرام شما: " + message.from.id);

  if (command === "/start" || command === "/help" || text === "راهنما") {
    const intro = "به رادیو آوا و نوا خوش آمدید 🌷\nموسیقی زنده، شعر و آواز؛ شنبه تا چهارشنبه، ساعت ۲۲ به وقت ایران.\nیکی از گزینه‌ها را انتخاب کنید.";
    return send(chat, intro, privateChat ? keyboard() : undefined);
  }

  if (text === "ورود به روم کلاب‌هاوس" || text === "روم کلاب‌هاوس" || command === "/roomlink") {
    let activeRoom = "";
    try { activeRoom = (await program()).value.roomUrl; } catch {}
    return send(chat, "لینک روم کلاب‌هاوس:\n" + roomText(activeRoom));
  }

  if (text === "پخش زنده رادیو" || text === "پخش زنده" || command === "/live")
    return send(chat, "پخش زنده رادیو آوا و نوا:\n" + SITE);

  if (text === "ساعت برنامه‌ها" || text === "برنامه هفتگی" || command === "/schedule")
    return send(chat, "شنبه تا چهارشنبه، ساعت ۲۲ به وقت ایران.");

  if (text === "درباره آوا و نوا" || command === "/about")
    return send(chat, "آوا و نوا جمعی دوستانه برای موسیقی زنده، شعر، آواز و دکلمه است.\nشنبه تا چهارشنبه، ساعت ۲۲ به وقت ایران.\nرادیو: " + SITE);

  if (command.startsWith("/song")) {
    if (!privateChat) return send(chat, "برای درخواست آهنگ، در گفت‌وگوی خصوصی ربات پیام بدهید.");
    const destination = process.env.TELEGRAM_REQUEST_CHAT_ID;
    if (!destination) return send(chat, "دریافت درخواست آهنگ هنوز راه‌اندازی نشده است.");
    const song = text.replace(/^\/song\s*/, "").trim().slice(0, 300);
    if (!song) return send(chat, "نام خواننده و آهنگ را بنویسید. نمونه: /song نام خواننده - نام آهنگ");
    await send(destination, "درخواست آهنگ از کاربر " + message.from.id + ":\n" + song);
    return send(chat, "درخواست شما برای مدیر فرستاده شد.");
  }

  if (text === "اعلان‌ها")
    return send(chat, "برای اطلاعیه‌ها عضو کانال رسمی شوید:\nhttps://t.me/+nFR4GhHTc7Y3ZjNk");

  if (isAdmin(message)) {
    if (command.startsWith("/setroom ")) {
      const url = validRoom(command.slice(9).trim());
      if (!url) return send(chat, "لینک معتبر کلاب‌هاوس را بفرستید. لینک باید با clubhouse.com/i/ یا clubhouse.com/room/ شروع شود.");
      try {
        await updateRoom(url);
        return send(chat, "لینک روم ذخیره شد و سایت آن را از program.json می‌خواند.");
      } catch {
        return send(chat, "ذخیره لینک انجام نشد. تنظیم دسترسی GitHub را بررسی کنید.");
      }
    }

    if (command === "/endroom") {
      try {
        await updateRoom("");
        return send(chat, "روم فعال پاک شد؛ دکمهٔ کلاب‌هاوس حالا به لینک هاوس می‌رود.");
      } catch {
        return send(chat, "پاک‌کردن لینک انجام نشد. تنظیم دسترسی GitHub را بررسی کنید.");
      }
    }

    if (command.startsWith("/announce ")) {
      const parts = command.slice(10).trim().split(/\s+/);
      const targetName = parts.shift();
      const announcement = parts.join(" ").trim();
      const target = targetName === "گروه" ? GROUP_ID : targetName === "کانال" ? CHANNEL_ID : "";
      if (!target || !announcement)
        return send(chat, "فرمان: /announce گروه متن پیام\nیا: /announce کانال متن پیام");
      try {
        await send(target, announcement.slice(0, 1500));
        return send(chat, "اطلاعیه ارسال شد.");
      } catch {
        return send(chat, "ارسال نشد؛ شناسه و دسترسی ربات به مقصد را بررسی کنید.");
      }
    }

    if (command === "/status") {
      try {
        const current = await program();
        return send(chat, "وضعیت روم: " + (current.value.roomUrl ? "لینک فعال ثبت شده" : "روم فعال ثبت نشده"));
      } catch {
        return send(chat, "خواندن وضعیت روم انجام نشد.");
      }
    }
  }

  if (!text.startsWith("/")) {
    const faq = faqReply(text);
    if (faq) return send(chat, faq);
  }
}

module.exports = { handle, validRoom, keyboard, welcomeText, faqReply, isAdmin, rememberUpdate };
