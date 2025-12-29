"""
Vercel serverless function handler for Telegram bot webhook
This file is the entry point for Vercel serverless functions
All bot logic lives in bot.py in the parent directory
"""
import json
import sys
import os
import asyncio

# Add parent directory to path to import bot module
current_dir = os.path.dirname(os.path.abspath(__file__))
bot_dir = os.path.dirname(current_dir)
sys.path.insert(0, bot_dir)

# Import bot module - this will initialize the bot
try:
    import bot
    from telebot import types
    bot_loaded = True
    bot_error = None
except (ImportError, ValueError) as e:
    print(f"Error loading bot module: {e}")
    import traceback
    traceback.print_exc()
    bot_loaded = False
    bot_error = str(e)
    bot = None

async def process_update(update_dict):
    """Process a Telegram webhook update"""
    try:
        if not bot_loaded or bot is None:
            print("Bot module not loaded")
            return False
        
        # Initialize database if needed
        if bot.users_collection is None:
            await bot.init_db()
        
        # Create update object and process
        update = types.Update.de_json(update_dict)
        await bot.bot.process_new_updates([update])
        return True
    except Exception as e:
        print(f"Error processing update: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def handler(request):
    """
    Vercel serverless function handler
    request format: {method, path, headers, body}
    """
    try:
        method = request.get('method', 'GET').upper()
        
        # GET request - status page
        if method == 'GET':
            if not bot_loaded or bot is None:
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
            <p>Please check your environment variables in Vercel dashboard.</p>
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
            <p>BOT_TOKEN: <span class="{'ok' if bot.BOT_TOKEN else 'error'}">{'✅ Configured' if bot.BOT_TOKEN else '❌ Not configured'}</span></p>
            <p>MONGO_URI: <span class="{'ok' if bot.MONGO_URI else 'error'}">{'✅ Configured' if bot.MONGO_URI else '❌ Not configured'}</span></p>
            <p>API_URL: <span class="{'ok' if bot.API_BASE_URL else 'error'}">{'✅ Configured' if bot.API_BASE_URL else '❌ Not configured'}</span></p>
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
            if not bot_loaded or bot is None:
                return {
                    'statusCode': 500,
                    'headers': {'Content-Type': 'text/plain'},
                    'body': f'Bot not initialized. Error: {bot_error if bot_error else "Unknown error"}'
                }
            
            body = request.get('body', '{}')
            
            # Parse JSON body
            if isinstance(body, str):
                try:
                    update_dict = json.loads(body)
                except json.JSONDecodeError as e:
                    return {
                        'statusCode': 400,
                        'headers': {'Content-Type': 'text/plain'},
                        'body': f'Invalid JSON: {str(e)}'
                    }
            else:
                update_dict = body
            
            # Process update asynchronously
            success = asyncio.run(process_update(update_dict))
            
            return {
                'statusCode': 200 if success else 500,
                'headers': {'Content-Type': 'text/plain'},
                'body': 'OK' if success else 'Error processing update'
            }
        
        # Method not allowed
        return {
            'statusCode': 405,
            'headers': {'Content-Type': 'text/plain'},
            'body': 'Method not allowed'
        }
    
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Handler error: {str(e)}")
        print(error_trace)
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'text/plain'},
            'body': f'Error: {str(e)}'
        }

