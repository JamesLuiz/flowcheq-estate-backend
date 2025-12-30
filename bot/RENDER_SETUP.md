# Deploy Telegram Bot to Render

This guide will help you deploy the House Me Telegram bot to Render.

## Prerequisites

1. **Render Account**: Sign up at [render.com](https://render.com)
2. **Telegram Bot Token**: Get from [@BotFather](https://t.me/botfather)
3. **MongoDB URI**: Your MongoDB connection string
4. **API URL**: Your backend API URL

## Step 1: Prepare Your Code

Make sure all files are in `backend/bot/`:
- `bot.py` - Main bot code
- `server.py` - FastAPI server
- `api/telegram.py` - Webhook handler
- `requirements.txt` - Dependencies
- `.python-version` - Python version (3.9)

## Step 2: Create Render Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Select the repository and branch

## Step 3: Configure Service

**Basic Settings:**
- **Name**: `house-me-telegram-bot` (or your preferred name)
- **Environment**: `Python 3`
- **Region**: Choose closest to your users
- **Branch**: `main` (or your branch)

**Build & Deploy:**
- **Build Command**: `cd backend/bot && pip install -r requirements.txt`
- **Start Command**: `cd backend/bot && python server.py`
- **Root Directory**: Leave empty (or set to `backend/bot` if deploying only bot folder)

**OR use the simpler approach:**
- **Build Command**: `pip install -r backend/bot/requirements.txt`
- **Start Command**: `cd backend/bot && python server.py`

## Step 4: Set Environment Variables

In Render dashboard, go to **Environment** tab and add:

```
BOT_TOKEN=your_telegram_bot_token_here
MONGO_URI=your_mongodb_connection_string
API_URL=https://your-backend-api.vercel.app
PYTHONUNBUFFERED=1
PORT=10000
```

**Note**: Render will set `PORT` automatically, but we read it from env in server.py

## Step 5: Deploy

1. Click **"Create Web Service"**
2. Render will start building and deploying
3. Watch the logs - you should see:
   - ✅ Bot module imported successfully
   - ✅ BOT_TOKEN found and loaded
   - ✅ FastAPI application started
   - Server starting on port

## Step 6: Set Telegram Webhook

After deployment, get your Render URL (e.g., `https://house-me-bot.onrender.com`)

Set the webhook:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://house-me-bot.onrender.com/api/telegram"
```

Verify webhook:
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

## Step 7: Test Your Bot

1. Open Telegram
2. Search for your bot
3. Send `/start`
4. You should see the welcome message!

## Monitoring & Logs

- **View Logs**: Render Dashboard → Your Service → **Logs** tab
- **Check Status**: Visit `https://your-service.onrender.com/api/telegram` (status page)
- **Health Check**: Visit `https://your-service.onrender.com/health`

## Troubleshooting

### Bot Not Responding

1. **Check Render Logs**:
   - Look for errors during startup
   - Check if bot module loaded successfully
   - Verify environment variables are set

2. **Check Webhook**:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
   ```
   - Should show your Render URL
   - Check for error messages

3. **Test Status Page**:
   Visit: `https://your-service.onrender.com/api/telegram`
   - Should show configuration status

### Common Errors

**"BOT_TOKEN not found"**:
- Environment variable not set in Render
- Check Environment tab in Render dashboard

**"MONGO_URI not found"**:
- MongoDB URI not set
- Verify connection string format

**"Module not found"**:
- Check build logs
- Ensure `requirements.txt` has all dependencies
- Verify `pip install` completed successfully

**Service keeps restarting**:
- Check logs for startup errors
- Verify PORT environment variable is being read
- Check if database connection is timing out

### Render Free Tier Notes

- **Spins down after 15 minutes** of inactivity
- First request after spin-down takes longer (cold start)
- **Auto-deploys** on git push (if enabled)
- **100 GB bandwidth** per month

## File Structure

```
backend/bot/
├── bot.py              # Main bot logic
├── server.py           # FastAPI server (entry point)
├── api/
│   ├── __init__.py
│   └── telegram.py     # Webhook handler
├── requirements.txt    # Python dependencies
├── .python-version     # Python 3.9
└── render.yaml         # Optional Render config
```

## Environment Variables Summary

| Variable | Description | Example |
|----------|-------------|---------|
| `BOT_TOKEN` | Telegram bot token from @BotFather | `123456789:ABC...` |
| `MONGO_URI` | MongoDB connection string | `mongodb+srv://...` |
| `API_URL` | Backend API URL | `https://api.example.com` |
| `PYTHONUNBUFFERED` | Disable Python output buffering | `1` |
| `PORT` | Server port (auto-set by Render) | `10000` |

## Support

- WhatsApp: +234 814 660 9734
- Email: abujashoemall@gmail.com

