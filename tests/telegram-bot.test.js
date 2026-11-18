"use strict";

process.env.TELEGRAM_ADMIN_IDS = "123";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validRoom, keyboard, welcomeText, faqReply, isAdmin } = require("../bot/radio");

test("accepts Clubhouse room and invite links only", () => {
  assert.equal(validRoom("https://www.clubhouse.com/i/abc123"), "https://www.clubhouse.com/i/abc123");
  assert.equal(validRoom("https://clubhouse.com/room/abc123"), "https://clubhouse.com/room/abc123");
  assert.equal(validRoom("https://evil.example/room/abc123"), null);
  assert.equal(validRoom("http://www.clubhouse.com/room/abc123"), null);
  assert.equal(validRoom("https://www.clubhouse.com/house/abc123"), null);
});

test("private menu contains the four requested choices", () => {
  const rows = keyboard().keyboard.flat().map(button => button.text);
  assert.deepEqual(rows, ["ورود به روم کلاب‌هاوس", "پخش زنده رادیو", "ساعت برنامه‌ها", "درباره آوا و نوا"]);
});

test("group welcome includes names, schedule, radio, and active room link", () => {
  const message = welcomeText([{ first_name: "مریم" }, { first_name: "Bot", is_bot: true }], "https://www.clubhouse.com/i/abc123");
  assert.match(message, /مریم/);
  assert.match(message, /۲۲/);
  assert.match(message, /radio\.ibboabdoli\.com/);
  assert.match(message, /clubhouse\.com\/i\/abc123/);
  assert.equal(welcomeText([{ first_name: "Bot", is_bot: true }]), "");
});

test("FAQ answers schedule, room, radio, and participation questions", () => {
  assert.match(faqReply("ساعت برنامه‌ها کی است؟"), /۲۲/);
  assert.match(faqReply("لینک روم کلاب‌هاوس"), /دکمه/);
  assert.match(faqReply("چطور وارد روم بشم؟"), /درخواست ورود/);
  assert.match(faqReply("پخش زنده رادیو"), /radio\.ibboabdoli\.com/);
  assert.equal(faqReply("سلام"), "");
});

test("admin actions are restricted to private chats", () => {
  assert.equal(isAdmin({ chat: { type: "private" }, from: { id: 123 } }), true);
  assert.equal(isAdmin({ chat: { type: "group" }, from: { id: 123 } }), false);
  assert.equal(isAdmin({ chat: { type: "private" }, from: { id: 456 } }), false);
});
