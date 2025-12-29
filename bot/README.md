# House Me Telegram Bot

Professional Telegram bot for House Me real estate platform, serving Abuja residents.

## Features

- 🔍 Property search (by location, price, type, keywords)
- ⭐ Favorites/bookmarks system
- 📍 Popular Abuja areas quick access
- 💬 Direct agent contact
- 📋 User Agreement & Terms of Service
- 🏠 Link to main web application

## Project Structure

```
backend/bot/
├── bot.py              # Main bot logic and handlers
├── api/
│   └── telegram.py     # Vercel serverless function handler
├── vercel.json         # Vercel configuration for bot deployment
├── requirements.txt    # Python dependencies
├── __init__.py        # Module initialization
├── BOT_SETUP.md       # Detailed setup instructions
└── README.md          # This file
```

## Quick Setup

### 1. Install Dependencies

```bash
cd backend/bot
pip install -r requirements.txt
```

### 2. Set Environment Variables

Create a `.env` file (for local development) or set in Vercel:

```env
BOT_TOKEN=your_telegram_bot_token
MONGO_URI=your_mongodb_connection_string
API_URL=https://your-backend-api.vercel.app
```

### 3. Deploy to Vercel

**Option A: Deploy bot folder separately**

```bash
cd backend/bot
vercel
```

**Option B: Deploy from root with bot configuration**

Make sure your root `vercel.json` includes the bot function:

```json
{
  "functions": {
    "backend/bot/api/telegram.py": {
      "runtime": "python3.9"
    }
  },
  "rewrites": [
    {
      "source": "/api/telegram",
      "destination": "/backend/bot/api/telegram.py"
    }
  ]
}
```

### 4. Set Telegram Webhook

After deployment, set the webhook:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-project.vercel.app/api/telegram"
```

## Development

### Local Testing

1. Install dependencies: `pip install -r requirements.txt`
2. Set environment variables in `.env` file
3. Use ngrok to expose local server:
   ```bash
   ngrok http 5000
   ```
4. Set webhook to ngrok URL

### File Structure

- **bot.py**: Contains all bot handlers, callbacks, and business logic
- **api/telegram.py**: Vercel serverless function entry point
- **vercel.json**: Vercel deployment configuration
- **requirements.txt**: Python package dependencies

## Bot Commands

- `/start` - Main menu and welcome message
- `/help` - Help and information
- `/terms` - Terms of Service
- `/agreement` - User Agreement
- `/contact` - Contact support

## Support

- WhatsApp: +234 814 660 9734
- Email: abujashoemall@gmail.com

## License

Part of the House Me real estate platform.

