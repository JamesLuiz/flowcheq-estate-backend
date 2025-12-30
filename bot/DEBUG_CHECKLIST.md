# Bot Debugging Checklist

If your bot isn't responding, check these in order:

## 1. Check Render Logs

Go to Render Dashboard → Your Service → **Logs** tab

**Look for:**
- ✅ "Starting Telegram Bot Webhook Handler"
- ✅ "Bot module imported successfully"
- ✅ "FastAPI application started"
- ✅ "Bot commands registered successfully"
- ✅ "POST /api/telegram - Webhook received" (when you send /start)
- ✅ "Processing update ID: X"
- ✅ "Message update: chat_id=X, text=/start"
- ✅ "Update X processed successfully"

**If you see errors:**
- Check what the error message says
- Common errors: Database connection, missing environment variables, import errors

## 2. Check Webhook is Set

Visit in browser (replace TOKEN):
```
https://api.telegram.org/bot8591312148:AAEC7hQHGPwrkJE9RXTyu--zf3Dj0FFgaKs/getWebhookInfo
```

Should return:
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

**If webhook is NOT set:**
```bash
curl -X POST "https://api.telegram.org/bot8591312148:AAEC7hQHGPwrkJE9RXTyu--zf3Dj0FFgaKs/setWebhook?url=https://house-me-bot.onrender.com/api/telegram"
```

## 3. Test Your Render Service

**Health Check:**
```
https://house-me-bot.onrender.com/health
```
Should return: `{"status": "healthy", ...}`

**Status Page:**
```
https://house-me-bot.onrender.com/api/telegram
```
Should show HTML status page with configuration

**If you get 404:**
- Service might not be deployed
- Check Render dashboard if service is running
- Check the URL path is correct

## 4. Check Environment Variables

In Render Dashboard → Environment tab, verify:
- ✅ `BOT_TOKEN` is set
- ✅ `MONGO_URI` is set
- ✅ `API_URL` is set (optional, but recommended)
- ✅ `PYTHONUNBUFFERED=1` is set (for immediate log output)

## 5. Test Bot Locally (Optional)

To debug locally:

1. Install dependencies:
```bash
cd backend/bot
pip install -r requirements.txt
```

2. Create `.env` file:
```
BOT_TOKEN=your_token
MONGO_URI=your_mongo_uri
API_URL=http://localhost:3000
```

3. Run server:
```bash
python server.py
```

4. Use ngrok:
```bash
ngrok http 8000
```

5. Set webhook to ngrok URL:
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-ngrok.ngrok.io/api/telegram"
```

6. Test with your bot - you'll see logs in terminal

## 6. Common Issues

### Bot Not Responding at All

**Check:**
- [ ] Webhook is set correctly
- [ ] Render service is running (not sleeping)
- [ ] Environment variables are set
- [ ] No errors in Render logs
- [ ] Bot token is correct

### Commands Don't Appear in Menu

**Cause:** Commands not registered with Telegram

**Fix:** Commands are registered automatically when:
- Server starts (startup event)
- First update is received

**Check logs for:** "✅ Bot commands registered successfully"

**Manual registration (if needed):**
```python
# Can be run in Python console
import asyncio
from telebot import types
commands = [
    types.BotCommand("start", "Start the bot"),
    types.BotCommand("help", "Get help"),
    types.BotCommand("terms", "Terms of Service"),
    types.BotCommand("agreement", "User Agreement"),
    types.BotCommand("contact", "Contact support"),
]
await bot.set_my_commands(commands)
```

### Bot Responds but with Errors

**Check Render logs for:**
- Database connection errors
- API connection errors
- Missing data errors

**Common fixes:**
- Verify MongoDB URI is correct
- Check MongoDB network access (IP whitelist)
- Verify API_URL is correct and accessible

### Webhook Returns 404

**Check:**
- Service URL is correct
- Service is deployed and running
- Route is `/api/telegram` (case sensitive)
- No extra slashes in URL

## 7. Enable More Detailed Logging

If you need more logs, the code already has extensive logging. Check Render logs to see:
- Every webhook request
- Every update processed
- Every message sent
- All errors with stack traces

## 8. Test Webhook Manually

You can test if webhook is working by sending a test update:

```bash
curl -X POST https://house-me-bot.onrender.com/api/telegram \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 123456789,
    "message": {
      "message_id": 1,
      "from": {
        "id": 123456789,
        "is_bot": false,
        "first_name": "Test",
        "username": "testuser"
      },
      "chat": {
        "id": 123456789,
        "type": "private"
      },
      "date": 1234567890,
      "text": "/start"
    }
  }'
```

Check Render logs to see if it processed.

## Still Not Working?

1. Check Render logs carefully - there should be error messages
2. Verify all environment variables are set correctly
3. Test the webhook URL in browser (should show status page)
4. Check if Render service is actually running (not sleeping)
5. Try deleting and re-setting the webhook

