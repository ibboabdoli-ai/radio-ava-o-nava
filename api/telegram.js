"use strict";
const crypto=require("node:crypto");
const {handle}=require("../bot/radio");
module.exports=async(req,res)=>{
 if(req.method!=="POST")return res.status(405).json({ok:false});
 const secret=process.env.TELEGRAM_WEBHOOK_SECRET||"";
 const got=req.headers["x-telegram-bot-api-secret-token"]||"";
 const a=Buffer.from(secret),b=Buffer.from(String(got));
 if(!secret||!process.env.TELEGRAM_BOT_TOKEN||a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).json({ok:false});
 try{await handle(typeof req.body==="string"?JSON.parse(req.body):req.body);return res.status(200).json({ok:true});}
 catch(e){console.error("Bot update failed",e.message);return res.status(500).json({ok:false});}
};
