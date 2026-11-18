"use strict";
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_IDS = new Set((process.env.TELEGRAM_ADMIN_IDS||"").split(",").map(x=>x.trim()).filter(Boolean));
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const SITE = "https://radio.ibboabdoli.com/";
const COMPETITION = SITE+"competition.html";
const HOUSE = "https://www.clubhouse.com/house/%D8%A7%D9%88%D8%A7-%D9%88-%D9%86%D9%88%D8%A7-%D9%85%D9%88%D8%B3%DB%8C%D9%82%DB%8C-%D8%B2%D9%86%D8%AF%D9%87-%D8%B4%D8%B9%D8%B1-%D9%88-%D8%A2%D9%88%D8%A7%D8%B2";
function validRoom(raw) {
 try { const u=new URL(raw); return u.protocol==="https:" && ["clubhouse.com","www.clubhouse.com"].includes(u.hostname) && !u.username && !u.password && /^\/(i|room)\/[^\s]+/.test(u.pathname) ? u.href : null; } catch { return null; }
}
async function api(method,data) {
 const r=await fetch("https://api.telegram.org/bot"+BOT_TOKEN+"/"+method,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});
 if(!r.ok) throw new Error("Telegram HTTP "+r.status);
 const j=await r.json();if(!j.ok)throw new Error("Telegram API error");return j.result;
}
const send=(chat_id,text,reply_markup)=>api("sendMessage",{chat_id,text,reply_markup,link_preview_options:{is_disabled:true}});
function keyboard() {return {keyboard:[[{text:"پخش زنده"},{text:"روم کلاب‌هاوس"}],[{text:"مسابقه"},{text:"آرشیو"}],[{text:"برنامه هفتگی"},{text:"درخواست آهنگ"}],[{text:"اعلان‌ها"},{text:"راهنما"}]],resize_keyboard:true};}
function ghHeaders(){return {Authorization:"Bearer "+process.env.RADIO_GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"radio-ava-bot","Content-Type":"application/json"};}
const repo=process.env.RADIO_GITHUB_REPO||"ibboabdoli-ai/radio-ava-o-nava";
const branch=process.env.RADIO_GITHUB_BRANCH||"main";
async function program() {
 const r=await fetch("https://api.github.com/repos/"+repo+"/contents/program.json?ref="+encodeURIComponent(branch),{headers:ghHeaders()});
 if(!r.ok)throw new Error("GitHub read HTTP "+r.status);
 const j=await r.json();return {sha:j.sha,value:JSON.parse(Buffer.from(j.content,"base64").toString("utf8"))};
}
async function room(url) {
 const current=await program(); if(current.value.roomUrl===url)return false;
 current.value.roomUrl=url;
 const r=await fetch("https://api.github.com/repos/"+repo+"/contents/program.json",{method:"PUT",headers:ghHeaders(),body:JSON.stringify({message:"Update Clubhouse room from Telegram",branch,sha:current.sha,content:Buffer.from(JSON.stringify(current.value,null,2)+"\n").toString("base64")})});
 if(!r.ok)throw new Error("GitHub write HTTP "+r.status);return true;
}
async function handle(update){
 const post=update.channel_post;
 if(post&&CHANNEL_ID&&String(post.chat.id)===String(CHANNEL_ID)){
  const match=(post.text||post.caption||"").match(/https:\/\/(?:www\.)?clubhouse\.com\/(?:i|room)\/[^\s]+/);
  const url=match&&validRoom(match[0]);
  if(url)await room(url);return;
 }
 const m=update.message;if(!m||!m.from||!m.chat)return;
 const chat=m.chat.id,txt=(m.text||"").trim(),privateChat=m.chat.type==="private";
 const admin=privateChat&&ADMIN_IDS.has(String(m.from.id));
 if(txt==="/start"||txt==="راهنما"||txt==="/help")return send(chat,"به رادیو آوا و نوا خوش آمدید. از منو انتخاب کنید.\nشناسه شما: "+m.from.id,keyboard());
 if(txt==="پخش زنده"||txt==="/live")return send(chat,"پخش زنده:\n"+SITE);
 if(txt==="مسابقه"||txt==="/competition")return send(chat,"ثبت‌نام مسابقه:\n"+COMPETITION);
 if(txt==="آرشیو"||txt==="/archive")return send(chat,"برنامه‌های ضبط‌شده:\n"+SITE+"#recordings");
 if(txt==="برنامه هفتگی"||txt==="/schedule")return send(chat,"شنبه تا چهارشنبه، ساعت ۲۲ به وقت ایران.\n"+SITE);
 if(txt==="روم کلاب‌هاوس"||txt==="/roomlink"){
  const p=await program();return send(chat,"لینک کلاب‌هاوس:\n"+(p.value.roomUrl||HOUSE));
 }
 if(txt==="درخواست آهنگ")return send(chat,"در پیام خصوصی بنویسید:\n/song نام خواننده - نام آهنگ");
 if(txt.startsWith("/song ")){
  if(!privateChat)return send(chat,"درخواست را در گفت‌وگوی خصوصی ربات بفرستید.");
  if(!process.env.TELEGRAM_REQUEST_CHAT_ID)return send(chat,"دریافت درخواست آهنگ هنوز فعال نشده است.");
  const song=txt.slice(6).trim().slice(0,300);if(!song)return;
  await send(process.env.TELEGRAM_REQUEST_CHAT_ID,"درخواست آهنگ از "+m.from.id+":\n"+song);
  return send(chat,"درخواست برای مدیر ارسال شد.");
 }
 if(txt==="اعلان‌ها")return send(chat,"برای دریافت اطلاعیه‌ها عضو کانال رسمی رادیو شوید:\nhttps://t.me/+nFR4GhHTc7Y3ZjNk");
 if(!admin)return;
 if(txt.startsWith("/setroom ")){
  const url=validRoom(txt.slice(9).trim());if(!url)return send(chat,"لینک روم معتبر نیست.");
  await room(url);return send(chat,"لینک روم در سایت به‌روزرسانی شد.");
 }
 if(txt==="/endroom"){await room("");return send(chat,"لینک روم پاک شد.");}
 if(txt.startsWith("/announce ")&&CHANNEL_ID){
  await send(CHANNEL_ID,txt.slice(10,1510));return send(chat,"اطلاعیه ارسال شد.");
 }
 if(txt==="/status"){const p=await program();return send(chat,"روم: "+(p.value.roomUrl||"غیرفعال"));}
}
module.exports={handle,validRoom};
