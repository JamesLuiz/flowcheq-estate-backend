# Telegram Bot Setup Guide for Vercel

This guide will help you set up and deploy the House Me Telegram bot on Vercel.

## Prerequisites

1. **Telegram Bot Token**: Get one from [@BotFather](https://t.me/botfather) on Telegram
   - Start a chat with @BotFather
   - Send `/newbot` and follow the instructions
   - Save your bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

2. **MongoDB URI**: Your MongoDB connection string
   - Format: `mongodb+srv://username:password@cluster.mongodb.net/database`

3. **API URL**: Your backend API URL (for fetching properties)
   - Example: `https://your-api.vercel.app` or `http://localhost:3000` for local

4. **Vercel Account**: Sign up at [vercel.com](https://vercel.com) if you haven't

## Step 1: Set Up Environment Variables

You need to set these environment variables in Vercel:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

```
BOT_TOKEN=your_telegram_bot_token_here
MONGO_URI=your_mongodb_connection_string
API_URL=https://your-backend-api-url.vercel.app
```

**Important**: Make sure to add these for all environments (Production, Preview, Development).

## Step 2: Install Python Runtime Dependencies

Create a `requirements.txt` file in the root (or ensure `backend/bot/requirements.txt` exists):

```txt
pyTelegramBotAPI==4.12.0
python-dotenv==1.0.0
requests==2.31.0
aiohttp>=3.7.4
motor==3.1.1
pymongo==4.3.3
pytz==2023.3
```

Vercel will automatically install these when deploying.

## Step 3: Deploy to Vercel

### Option A: Deploy via Vercel CLI

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

Follow the prompts. For the first deployment, Vercel will ask:
- Set up and deploy? **Yes**
- Which scope? Select your account
- Link to existing project? **No** (or Yes if you already have one)
- Project name? Enter a name (e.g., `house-me-bot`)
- Directory? Press Enter (current directory)
- Override settings? **No**

### Option B: Deploy via GitHub

1. Push your code to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your GitHub repository
4. Configure:
   - Framework Preset: **Other**
   - Root Directory: `.` (root)
   - Build Command: Leave empty or `echo "No build needed"`
   - Output Directory: Leave empty
5. Add environment variables (Step 1)
6. Click **Deploy**

## Step 4: Set Up Telegram Webhook

After deployment, you need to tell Telegram where to send webhook updates.

1. Get your Vercel deployment URL. It will be something like:
   ```
   https://your-project.vercel.app/api/telegram
   ```

2. Set the webhook using curl or a browser:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-project.vercel.app/api/telegram"
```

Or visit in browser:
```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-project.vercel.app/api/telegram
```

Replace:
- `<YOUR_BOT_TOKEN>` with your actual bot token
- `https://your-project.vercel.app` with your actual Vercel URL

3. Verify webhook is set:
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

You should see your webhook URL in the response.

## Step 5: Test the Bot

1. Open Telegram and search for your bot (the username you set with @BotFather)
2. Click **Start** or send `/start`
3. You should receive the welcome message with the main menu

## Troubleshooting

### Bot not responding

1. **Check webhook status**:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
   ```
   - If `url` is empty, the webhook isn't set. Set it again (Step 4).
   - If `last_error_date` shows a recent timestamp, check the error message.

2. **Check Vercel logs**:
   - Go to your Vercel project dashboard
   - Click **Deployments** → Latest deployment → **Functions** tab
   - Check logs for errors

3. **Check environment variables**:
   - Ensure all required variables are set in Vercel
   - Check they're set for the correct environment (Production)

### Database connection errors

- Verify `MONGO_URI` is correct
- Check MongoDB network access (allow Vercel IPs if using IP whitelist)
- Ensure database name in URI matches your database name

### API connection errors

- Verify `API_URL` points to your backend API
- Ensure the API is accessible (not blocked by CORS if needed)
- Check the API URL format (should include `https://` protocol)

### Module import errors

- Ensure `requirements.txt` includes all necessary packages
- Check that Python runtime version is compatible (Python 3.9+)
- Verify file paths are correct

## Local Development (Optional)

To test the bot locally before deploying:

1. Install dependencies:
```bash
cd backend/bot
pip install -r requirements.txt
```

2. Create `.env` file in `backend/bot/`:
```
BOT_TOKEN=your_bot_token
MONGO_URI=your_mongodb_uri
API_URL=http://localhost:3000
```

3. Use ngrok to expose local server:
```bash
ngrok http 5000
```

4. Set webhook to ngrok URL:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-ngrok-url.ngrok.io/api/telegram"
```

## Bot Commands Available

Once set up, users can use:
- `/start` - Main menu and welcome message
- `/help` - Help information
- `/terms` - Terms of Service
- `/agreement` - User Agreement
- `/contact` - Contact support

## Support

For issues or questions:
- WhatsApp: +234 814 660 9734
- Email: abujashoemall@gmail.com

