"""
Telegram bot webhook handler for Render/FastAPI
This file handles webhook requests from Telegram
All bot logic lives in bot.py in the parent directory
"""
import json
import sys
import os
import asyncio
import logging

# Ensure stdout/stderr aren't buffered (important for Render/cloud platforms)
os.environ.setdefault('PYTHONUNBUFFERED', '1')

# Configure logging to stdout with timestamps
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True  # Force reconfiguration
)
logger = logging.getLogger(__name__)

# Print startup message
logger.info("=" * 60)
logger.info("Starting Telegram Bot Webhook Handler")
logger.info("=" * 60)

# Add parent directory to path to import bot module
current_dir = os.path.dirname(os.path.abspath(__file__))
bot_dir = os.path.dirname(current_dir)
sys.path.insert(0, bot_dir)

logger.info(f"Current directory: {current_dir}")
logger.info(f"Bot directory: {bot_dir}")
logger.info(f"Python path: {sys.path}")

# Import bot module - this will initialize the bot
bot_module = None
bot_error = None
try:
    logger.info("Attempting to import bot module...")
    import bot
    from telebot import types
    bot_module = bot
    bot_loaded = True
    bot_error = None
    logger.info("✅ Bot module imported successfully!")
    logger.info(f"BOT_TOKEN configured: {bool(bot.BOT_TOKEN)}")
    logger.info(f"MONGO_URI configured: {bool(bot.MONGO_URI)}")
    logger.info(f"API_BASE_URL configured: {bool(bot.API_BASE_URL)}")
except (ImportError, ValueError) as e:
    logger.exception("❌ Error loading bot module:")
    bot_loaded = False
    bot_error = str(e)
    bot_module = None

logger.info("=" * 60)

async def process_update(update_dict):
    """Process a Telegram webhook update"""
    try:
        update_id = update_dict.get('update_id', 'unknown')
        logger.info(f"Processing update ID: {update_id}")
        
        if not bot_loaded or bot_module is None:
            logger.error("Bot module not loaded, cannot process update")
            return False
        
        # Initialize database if needed
        if bot_module.users_collection is None:
            logger.info("Initializing database connection...")
            await bot_module.init_db()
            logger.info("Database initialized successfully")
        
        # Try to register commands on first update (in case they weren't registered at startup)
        try:
            from telebot import types as tg_types
            commands = [
                tg_types.BotCommand("start", "Start the bot and see main menu"),
                tg_types.BotCommand("help", "Get help and information"),
                tg_types.BotCommand("terms", "View Terms of Service"),
                tg_types.BotCommand("agreement", "View User Agreement"),
                tg_types.BotCommand("contact", "Contact support team"),
            ]
            await bot_module.bot.set_my_commands(commands)
            logger.info("✅ Bot commands registered")
        except Exception as cmd_error:
            logger.warning(f"⚠️ Could not register commands: {str(cmd_error)}")
            # Continue processing even if commands fail
        
        # Create update object and process
        update = types.Update.de_json(update_dict)
        logger.info(f"Update object created, type: {update.update_id}")
        
        # Check what type of update this is
        if update.message:
            logger.info(f"Message update: chat_id={update.message.chat.id}, text={update.message.text}")
        elif update.callback_query:
            logger.info(f"Callback query: data={update.callback_query.data}")
        
        await bot_module.bot.process_new_updates([update])
        logger.info(f"✅ Update {update_id} processed successfully")
        return True
    except Exception as e:
        logger.exception("❌ Error processing update:")
        import traceback
        logger.error(traceback.format_exc())
        return False

def handler(request):
    """
    Handler function for webhook requests
    Works with both Vercel serverless and FastAPI/Flask
    
    request format: {method, path, headers, body}
    Returns: dict with statusCode, headers, body for Vercel
             OR Response object for FastAPI
    """
    try:
        method = request.get('method', 'GET').upper()
        logger.info(f"Received {method} request")
        
        # GET request - status page
        if method == 'GET':
            logger.info("Handling GET request - status page")
            if not bot_loaded or bot_module is None:
                html = f"""<!DOCTYPE html>
<html>
<head>
    <title>House Me Bot Status</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }}
        .container {{ background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        h1 {{ color: #667eea; }}
        .error {{ color: red; background: #ffe6e6; padding: 15px; border-radius: 5px; margin-top: 20px; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🏠 House Me Telegram Bot</h1>
        <div class="error">
            <h2>❌ Configuration Error</h2>
            <p>{bot_error if bot_error else 'Bot module not loaded'}</p>
            <p>Please check your environment variables.</p>
            <p>Required: BOT_TOKEN, MONGO_URI, API_URL</p>
        </div>
    </div>
</body>
</html>"""
            else:
                html = f"""<!DOCTYPE html>
<html>
<head>
    <title>House Me Bot Status</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }}
        .container {{ background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        h1 {{ color: #667eea; }}
        .status {{ margin: 10px 0; padding: 10px; background: #f9f9f9; border-radius: 5px; }}
        .ok {{ color: green; font-weight: bold; }}
        .error {{ color: red; font-weight: bold; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🏠 House Me Telegram Bot</h1>
        <p><strong>Status:</strong> ✅ Running and ready to receive webhooks!</p>
        <div class="status">
            <p>BOT_TOKEN: <span class="{'ok' if bot_module.BOT_TOKEN else 'error'}">{'✅ Configured' if bot_module.BOT_TOKEN else '❌ Not configured'}</span></p>
            <p>MONGO_URI: <span class="{'ok' if bot_module.MONGO_URI else 'error'}">{'✅ Configured' if bot_module.MONGO_URI else '❌ Not configured'}</span></p>
            <p>API_URL: <span class="{'ok' if bot_module.API_BASE_URL else 'error'}">{'✅ Configured' if bot_module.API_BASE_URL else '❌ Not configured'}</span></p>
        </div>
    </div>
</body>
</html>"""
            
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'text/html'},
                'body': html
            }
        
        # POST request - webhook from Telegram
        if method == 'POST':
            logger.info("Handling POST request - Telegram webhook")
            
            if not bot_loaded or bot_module is None:
                logger.error("Bot not initialized, cannot process webhook")
                return {
                    'statusCode': 500,
                    'headers': {'Content-Type': 'text/plain'},
                    'body': f'Bot not initialized. Error: {bot_error if bot_error else "Unknown error"}'
                }
            
            body = request.get('body', '{}')
            logger.info(f"Request body type: {type(body)}, length: {len(str(body))}")
            
            # Parse JSON body
            if isinstance(body, str):
                try:
                    update_dict = json.loads(body)
                    logger.info(f"Parsed JSON successfully, update_id: {update_dict.get('update_id')}")
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON: {str(e)}")
                    return {
                        'statusCode': 400,
                        'headers': {'Content-Type': 'text/plain'},
                        'body': f'Invalid JSON: {str(e)}'
                    }
            else:
                update_dict = body
            
            # Process update asynchronously
            logger.info("Processing update asynchronously...")
            success = asyncio.run(process_update(update_dict))
            
            if success:
                logger.info("✅ Update processed successfully")
            else:
                logger.error("❌ Failed to process update")
            
            return {
                'statusCode': 200 if success else 500,
                'headers': {'Content-Type': 'text/plain'},
                'body': 'OK' if success else 'Error processing update'
            }
        
        # Method not allowed
        logger.warning(f"Method not allowed: {method}")
        return {
            'statusCode': 405,
            'headers': {'Content-Type': 'text/plain'},
            'body': 'Method not allowed'
        }
    
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.exception("Handler error:")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'text/plain'},
            'body': f'Error: {str(e)}\n\n{error_trace}'
        }
