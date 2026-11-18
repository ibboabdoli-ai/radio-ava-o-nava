# Radio Ava o Nava Telegram bot

A serverless Telegram bot prepared for deployment on Vercel. The radio website remains hosted on GitHub Pages.

## Features
- Listener menu: live radio, Clubhouse room, competition registration, recorded programs, schedule, song requests and channel notifications
- Admin commands in private chat: /setroom <Clubhouse URL>, /endroom, /announce <message>, /status
- Detect new Clubhouse room URLs published in the configured Telegram channel and update public program.json
- Song requests forwarded to a private organizer chat; no public storage of listener messages
- No automatic Clubhouse room-end detection
- WhatsApp Channel posting is not implemented

## Setup
1. Create a Telegram bot using https://t.me/BotFather.
2. Deploy this GitHub repository to a separate Vercel project with serverless functions enabled. Do not alter the existing GitHub Pages site.
3. Set these **server-side secrets** in Vercel (never commit or paste tokens in chat):
   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (random 32+ chars), TELEGRAM_ADMIN_IDS (comma-separated Telegram user IDs), RADIO_GITHUB_TOKEN (fine-grained GitHub Contents read/write for only this repository).
   Optional: TELEGRAM_CHANNEL_ID (numeric ID; bot must be channel admin), TELEGRAM_REQUEST_CHAT_ID (private chat ID), RADIO_GITHUB_REPO, RADIO_GITHUB_BRANCH.
4. Register a Telegram webhook using POST https://api.telegram.org/bot<TOKEN>/setWebhook with JSON body {"url":"https://YOUR-VERCEL-DOMAIN/api/telegram","secret_token":"YOUR-SECRET","allowed_updates":["message","channel_post"]}.
5. Test /start, /live, /competition, /setroom and /endroom with an admin account.

## Important
The current website's setHouseLink() accepts Clubhouse /room/ and /house/ URLs but not /i/ invite URLs. Update that validator before relying on /i/ links in the bot. The bot is not live until configured, deployed and tested.

Use content you own or are licensed to distribute. Never put GitHub or Telegram credentials in a public website.
