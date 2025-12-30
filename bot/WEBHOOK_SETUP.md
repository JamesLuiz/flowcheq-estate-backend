# Telegram Webhook Setup Guide

## Correct Webhook URL Format

The Telegram Bot API requires this exact format:

```
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<YOUR_WEBHOOK_URL>
```

**Important**: There should be NO slash between `/bot` and the token!

### ❌ WRONG (what you used):
```
https://api.telegram.org/bot/8591312148:AAEC7hQHGPwrkJE9RXTyu--zf3Dj0FFgaKs/setWebhook?url=...
```

### ✅ CORRECT:
```
https://api.telegram.org/bot8591312148:AAEC7hQHGPwrkJE9RXTyu--zf3Dj0FFgaKs/setWebhook?url=https://house-me-bot.onrender.com/api/telegram
```

## Step-by-Step Setup

### 1. Get Your Render URL

After deploying to Render, your service URL will be:
```
https://house-me-bot.onrender.com
```

Your webhook endpoint is:
```
https://house-me-bot.onrender.com/api/telegram
```

### 2. Set the Webhook

**Option A: Using Browser**

Visit this URL (replace with your actual token and URL):
```
https://api.telegram.org/bot8591312148:AAEC7hQHGPwrkJE9RXTyu--zf3Dj0FFgaKs/setWebhook?url=https://house-me-bot.onrender.com/api/telegram
```

**Option B: Using curl**

```bash
curl -X POST "https://api.telegram.org/bot8591312148:AAEC7hQHGPwrkJE9RXTyu--zf3Dj0FFgaKs/setWebhook?url=https://house-me-bot.onrender.com/api/telegram"
```

**Option C: Using PowerShell (Windows)**

```powershell
Invoke-WebRequest -Uri "https://api.telegram.org/bot8591312148:AAEC7hQHGPwrkJE9RXTyu--zf3Dj0FFgaKs/setWebhook?url=https://house-me-bot.onrender.com/api/telegram" -Method POST
```

### 3. Verify Webhook is Set

Check webhook status:
```bash
curl "https://api.telegram.org/bot8591312148:AAEC7hQHGPwrkJE9RXTyu--zf3Dj0FFgaKs/getWebhookInfo"
```

Or visit in browser:
```
https://api.telegram.org/bot8591312148:AAEC7hQHGPwrkJE9RXTyu--zf3Dj0FFgaKs/getWebhookInfo
```

You should see a response like:
```json
{
  "ok": true,
  "result": {
    "url": "https://house-me-bot.onrender.com/api/telegram",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

### 4. Test Your Bot

1. Open Telegram
2. Search for your bot
3. Send `/start`
4. You should receive a response!

## Troubleshooting

### Error: 404 Not Found

**From Telegram API:**
- ❌ Wrong: `/bot/<TOKEN>` (extra slash)
- ✅ Correct: `/bot<TOKEN>` (no slash)

**From Your Render Service:**
- Check that Render service is deployed and running
- Visit: `https://house-me-bot.onrender.com/api/telegram` in browser
- Should show status page (not 404)

### Error: "Bad Request" or "Webhook was not set"

- Verify your Render URL is accessible
- Check that the webhook endpoint is `/api/telegram`
- Ensure HTTPS is used (Telegram requires HTTPS)
- Check Render logs for errors

### Error: "Webhook can be set up only on HTTPS"

- Render provides HTTPS automatically
- Make sure you're using `https://` not `http://`
- If using custom domain, ensure SSL is configured

### Service Not Responding

1. **Check Render Dashboard:**
   - Go to your service
   - Check if it's "Live"
   - Check logs for errors

2. **Test Status Page:**
   ```
   https://house-me-bot.onrender.com/api/telegram
   ```
   Should show HTML status page

3. **Test Health Check:**
   ```
   https://house-me-bot.onrender.com/health
   ```
   Should return JSON: `{"status": "healthy", ...}`

4. **Check Render Logs:**
   - Look for startup messages
   - Check for import errors
   - Verify environment variables are set

## Quick Reference

**Your Bot Token:**
```
8591312148:AAEC7hQHGPwrkJE9RXTyu--zf3Dj0FFgaKs
```

**Your Render URL:**
```
https://house-me-bot.onrender.com
```

**Webhook Endpoint:**
```
https://house-me-bot.onrender.com/api/telegram
```

**Set Webhook Command:**
```bash
curl -X POST "https://api.telegram.org/bot8591312148:AAEC7hQHGPwrkJE9RXTyu--zf3Dj0FFgaKs/setWebhook?url=https://house-me-bot.onrender.com/api/telegram"
```

**Check Webhook:**
```bash
curl "https://api.telegram.org/bot8591312148:AAEC7hQHGPwrkJE9RXTyu--zf3Dj0FFgaKs/getWebhookInfo"
```

**Delete Webhook (if needed):**
```bash
curl -X POST "https://api.telegram.org/bot8591312148:AAEC7hQHGPwrkJE9RXTyu--zf3Dj0FFgaKs/deleteWebhook"
```

