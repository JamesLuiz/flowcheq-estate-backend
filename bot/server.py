"""
FastAPI server for Telegram bot webhook
Deploy this on Render or any platform that supports Python web servers
"""
from fastapi import FastAPI, Request, Response
from fastapi.responses import HTMLResponse, PlainTextResponse
import uvicorn
import json
import logging
import asyncio
import os
import sys

# Ensure stdout/stderr aren't buffered (important for Render)
os.environ.setdefault('PYTHONUNBUFFERED', '1')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True
)
logger = logging.getLogger("bot.server")

# Add current directory to path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

# Import the handler from api.telegram
try:
    from api import telegram
    logger.info("✅ Successfully imported telegram handler module")
except ImportError as e:
    logger.exception("❌ Failed to import telegram handler:")
    raise

app = FastAPI(
    title="House Me Telegram Bot",
    description="Webhook server for House Me Telegram bot",
    version="1.0.0"
)

logger.info("=" * 60)
logger.info("🏠 House Me Telegram Bot Server Starting")
logger.info("=" * 60)

@app.on_event("startup")
async def startup_event():
    """Log startup information and register bot commands"""
    logger.info("FastAPI application started")
    logger.info(f"Bot loaded: {telegram.bot_loaded}")
    if telegram.bot_error:
        logger.error(f"Bot error: {telegram.bot_error}")
    else:
        # Register bot commands with Telegram
        try:
            from telebot import types as tg_types
            if telegram.bot_module and telegram.bot_module.bot:
                commands = [
                    tg_types.BotCommand("start", "Start the bot and see main menu"),
                    tg_types.BotCommand("help", "Get help and information"),
                    tg_types.BotCommand("terms", "View Terms of Service"),
                    tg_types.BotCommand("agreement", "View User Agreement"),
                    tg_types.BotCommand("contact", "Contact support team"),
                ]
                await telegram.bot_module.bot.set_my_commands(commands)
                logger.info("✅ Bot commands registered successfully")
        except Exception as e:
            logger.warning(f"⚠️ Could not register bot commands: {str(e)}")

@app.get("/")
async def root():
    """Root endpoint - health check"""
    logger.info("GET / - Health check")
    return {
        "status": "ok",
        "service": "House Me Telegram Bot",
        "bot_loaded": telegram.bot_loaded
    }

@app.get("/api/telegram", response_class=HTMLResponse)
async def status():
    """Status page for bot"""
    logger.info("GET /api/telegram - Status page")
    result = telegram.handler({'method': 'GET'})
    
    # Convert Vercel-style response to FastAPI response
    return HTMLResponse(
        content=result.get('body', ''),
        status_code=result.get('statusCode', 200)
    )

@app.post("/api/telegram")
async def webhook(request: Request):
    """Webhook endpoint for Telegram"""
    logger.info("POST /api/telegram - Webhook received")
    
    try:
        # Get request body
        body = await request.body()
        body_str = body.decode('utf-8')
        
        logger.info(f"Request body length: {len(body_str)}")
        
        # Parse JSON
        try:
            update_dict = json.loads(body_str)
            logger.info(f"Parsed update ID: {update_dict.get('update_id')}")
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON: {str(e)}")
            return PlainTextResponse(
                content=f"Invalid JSON: {str(e)}",
                status_code=400
            )
        
        # Create request dict for handler
        req = {
            'method': 'POST',
            'body': update_dict,  # Pass parsed dict, not string
            'headers': dict(request.headers)
        }
        
        # Process through handler
        result = telegram.handler(req)
        
        # Convert Vercel-style response to FastAPI response
        status_code = result.get('statusCode', 200)
        body_content = result.get('body', 'OK')
        
        return PlainTextResponse(
            content=body_content,
            status_code=status_code
        )
    
    except Exception as e:
        logger.exception("Error processing webhook:")
        return PlainTextResponse(
            content=f"Internal error: {str(e)}",
            status_code=500
        )

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "bot_loaded": telegram.bot_loaded,
        "bot_error": telegram.bot_error if not telegram.bot_loaded else None
    }

if __name__ == "__main__":
    # Get port from environment or default to 8000
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    
    logger.info(f"Starting server on {host}:{port}")
    logger.info("=" * 60)
    
    # Run with uvicorn
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        access_log=True
    )
