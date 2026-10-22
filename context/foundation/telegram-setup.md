# Telegram reminders — setup

PayLark can send your bill reminders and the monthly summary to Telegram, in addition to (or
instead of) email. The messages have the same content and follow the same schedule and timing
windows as the email reminders, but Telegram has its **own settings** (see below).

Every user connects **their own bot**: there is nothing to configure on the server. You create a
bot, then paste two values into Settings → Notifications → **Telegram Notifications**:

- the **bot token** (who sends — identifies your bot), and
- your **chat id** (where to send — your Telegram account or a group).

Delivery is **outbound only** — the backend never reads Telegram, so nothing you send the bot can
change anything in the app. This takes about five minutes and needs only your phone and a browser.

## 1. Create your bot

1. Open Telegram and search for **@BotFather** (the one with the blue verified check).
2. Send `/newbot`.
3. Give it a **name** (display name, anything: `My PayLark`).
4. Give it a **username** — globally unique, must end in `bot`, e.g. `mariusz_pt_bot`.
5. BotFather replies with a line like `Use this token to access the HTTP API:` followed by the
   token (`8123456789:AAF3k...`). Copy it — this is your **bot token**.

> The token is a credential: anyone who has it can post as your bot. Do not paste it in a chat,
> an issue or a screenshot. If it leaks, send BotFather `/revoke` and paste the new one in
> Settings. PayLark stores it encrypted and never shows it again after saving.

## 2. Say something to your bot

Open `t.me/<your_bot_username>` and send it any message — `hi` will do.

This step is not optional: **a bot cannot start a conversation with you.** Until you message it
first, Telegram will not let it send you anything, however correct your chat id is.

## 3. Find your chat id

**Option A — ask a bot (easiest).** In Telegram search for **@userinfobot** and send `/start`. It
replies with your id, a number like `123456789`. That is your chat id. (`@RawDataBot` does the
same if the first one is unresponsive.)

**Option B — `getUpdates`.** Open this URL in a **private/incognito tab**, with your token in
place of `<TOKEN>` (keep the word `bot` glued in front of it):

```
https://api.telegram.org/bot<TOKEN>/getUpdates
```

Find `"chat":{"id":123456789,` — that number is your chat id. The URL contains your token, so
close the tab afterwards.

**Group chats.** A group's id is negative (e.g. `-1001234567890`) and @userinfobot will not give
it. Add your bot to the group, send a message in the group, then use option B. Only numeric ids
are accepted (no `@channelname`).

## 4. Paste both into PayLark

Settings → Notifications → **Telegram Notifications** → paste the bot token and the chat id →
**Save**. Then press **Send test message**: you should get a message from your bot within a second
or two.

To stop Telegram reminders, press **Remove Telegram** (clears both values). Email reminders are
unaffected and can be switched off independently.

## How delivery behaves

- **Email and Telegram are configured separately.** The Telegram tile has its own on/off switch,
  timing windows (2 days before, 1 day before, on the day, 1 day after), send time and monthly
  summary, plus its own **Send notification now** and **Send monthly summary** buttons. Set them
  differently for each channel, or turn one off entirely.
- Each channel tracks what it has sent on its own, so a reminder can go out by email and by
  Telegram independently; a failed send on one channel never affects the other and is retried on
  that channel's next run.
- Telegram works without SMTP: a user with a bot token and chat id gets reminders even if the
  instance has no `SMTP_HOST`.
- The `@` indicator on a payment row means an **email** was sent; Telegram does not set it.
- Messages contain only the reminder text (bill name, due date, amount) — no credentials or
  internal errors.
- The bot token is encrypted at rest with a key derived from `JWT_SECRET`. If an admin changes
  `JWT_SECRET`, stored tokens can no longer be decrypted: Telegram reminders stop for those users
  (a warning is logged: `Cannot decrypt Telegram bot token`), the Telegram tile shows "The saved
  bot token can no longer be read… Enter the token again", and downloading a backup warns that
  it was made without the token. Re-entering the token in Settings fixes it (the chat id and
  schedule are kept), as does restoring an older backup that contains the token.

## Backups

The JSON backup (Settings → Backup) lets you pick what to include. With the **Telegram** option
ticked it contains your Telegram bot token, chat id and schedule, so a restore brings Telegram
reminders back (also on another instance); leave it unticked and the token never enters the file. The token is stored **in plaintext in
the backup file** — it has to be readable on an instance with a different `JWT_SECRET` — so keep
backup files private, and `/revoke` the token in BotFather if a file leaks. Restoring a backup
without a Telegram section (older backups, or Telegram not set up) leaves your current Telegram
setup untouched. The automatic pre-restore snapshot never contains the token.

The **Email notification setup** option carries the email schedule and the browser-notification
switch (no SMTP data — SMTP is server config). A restore applies only the sections found in the
file (restoring from the automatic snapshot reverts them). Backups made before this existed
simply leave your current settings untouched.

New accounts start with all notifications off; enable email/Telegram in Settings → Notifications.

## Troubleshooting

**"Test failed" / nothing arrives.**
Check the backend log (`docker compose logs backend`) for `Failed to send ... Telegram`. Most
common causes, in order:
1. You never messaged your bot (step 2).
2. Wrong chat id — you pasted a different number, or the id of a bot instead of your own.
3. You messaged a *different* bot than the one whose token you saved (easy to do if you created
   several while hunting for a free username).
4. The token was revoked or mistyped — re-paste it.

**Send test is greyed out.**
Both the token and the chat id must be saved first (a saved token shows as dots in the field).

**Saving is rejected.**
The token must look like `8123456789:AAF3k...` (digits, a colon, then at least 20 letters, digits,
`_` or `-`). The chat id must be a whole number, optionally with a leading minus (groups). No
`@username`, no spaces.

**`getUpdates` returns `{"ok":true,"result":[]}`.**
You skipped step 2, messaged a different bot, or your message is more than 24 hours old
(Telegram discards undelivered updates after a day). Send a fresh message and reload immediately.
Or use option A.

**`getUpdates` returns `error_code: 401`.**
The token is wrong or revoked. Check you copied all of it, including the digits before the colon,
and that `bot` is glued to the front in the URL.

**`getUpdates` returns `error_code: 409`.**
A webhook is registered on the bot, which disables `getUpdates`. Open
`https://api.telegram.org/bot<TOKEN>/deleteWebhook` once, then retry (or use option A).
