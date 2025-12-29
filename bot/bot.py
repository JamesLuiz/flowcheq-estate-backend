from http.server import BaseHTTPRequestHandler
import json
import os
import asyncio
from telebot.handler_backends import State, StatesGroup
import signal
import sys
import requests
import datetime
from datetime import datetime, timedelta 
import pytz
from telebot.async_telebot import AsyncTeleBot
from motor.motor_asyncio import AsyncIOMotorClient
from telebot import types
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Bot initialization with error checking
BOT_TOKEN = os.environ.get('BOT_TOKEN')
if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN not found in environment variables")

bot = AsyncTeleBot(BOT_TOKEN)

# MongoDB setup with connection handling
MONGO_URI = os.getenv('MONGO_URI')
if not MONGO_URI:
    raise ValueError("MONGO_URI not found in environment variables")

async def get_database():
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client.tapshot
        # Test the connection
        await db.command("ping")
        return db
    except Exception as e:
        await bot.send_message(ADMIN_CHAT_ID, f"MongoDB Connection Error: {str(e)}")
        raise

# Initialize DB connection
db = None
users_collection = None

# Global state management
class UpdateState:
    _instance = None
    def __init__(self):
        self.process_id = None
        self.is_running = False
        self.last_update_time = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = UpdateState()
        return cls._instance



async def init_db():
    global db, users_collection
    try:
        db = await get_database()
        users_collection = db.users
        return True
    except Exception as e:
        return False

def generate_start_keyboard():
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton('Open Tapshot', web_app=WebAppInfo(url="https://tapshot-front.vercel.app/")))
    return keyboard

async def handle_user_image(bot, user_id):
    try:
        photos = await bot.get_user_profile_photos(user_id, limit=1)
        if photos and photos.total_count > 0:
            file_id = photos.photos[0][-1].file_id
            file_info = await bot.get_file(file_id)
            file_path = file_info.file_path
            file_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}"
            
            response = requests.get(file_url)
            if response.status_code == 200:
                return file_url
    except Exception as e:
        await bot.send_message(user_id, f"Error handling profile image: {str(e)}")
        print(f"Error fetching profile image for user {user_id}: {str(e)}")
    return None

@bot.message_handler(commands=['start'])
async def start(message): 
    try:
        user_id = str(message.from_user.id)
        
        # Initialize database with status message
        if users_collection is None:
            db_init_success = await init_db()
            if not db_init_success:
                await bot.reply_to(message, "⚠️ Unable to initialize database. Please try again later.")
                return
            await bot.reply_to(message, "🔄 Database initialized successfully")

        # Test database connection
        try:
            await users_collection.find_one({"_id": "tapshot"})
            await bot.reply_to(message, "✅ Database connection verified")
        except Exception as e:
            await bot.reply_to(message, f"❌ Database connection error: {str(e)}")
            return

        user_first_name = str(message.from_user.first_name)
        user_last_name = message.from_user.last_name
        user_username = message.from_user.username
        user_language_code = str(message.from_user.language_code)
        is_premium = message.from_user.is_premium
        text = message.text.split()

        # Check for existing user
        try:
            existing_user = await users_collection.find_one({"_id": user_id})
            if existing_user:
                await bot.reply_to(message, "📝 You're already a member")
            
            if not existing_user:
                await bot.reply_to(message, "👤 Creating new user profile")
                user_image = await handle_user_image(bot, user_id)
                
                user_data = {
                    "_id": user_id,
                    "first_name": user_first_name,
                    "last_name": user_last_name,
                    "username": user_username,
                    "language_code": user_language_code,
                    "is_premium": is_premium,
                    "user_image": user_image,
                    "created_at": datetime.datetime.utcnow(),
                    "updated_at": datetime.datetime.utcnow(),
                    "referrals": {},
                    "referredBy": None,  # Added from useEffect
                    "balance": 0,
                    "base_rate": 0,     # Added from useEffect
                    "claimed_count": 0, # Added from useEffect
                    "completed_tasks": [], # Added from useEffect
                    "level": 1,
                    "mineRate": 0.001,
                    "isMining": False,
                    "miningStartTime": None,
                    "daily": {
                        "claimedTime": None,
                        "claimedAmount": 0,
                        "claimedDay": 0,
                    },
                    "links": None
                }

                # Handle referral
                if len(text) > 1 and text[1].startswith("ref_"):
                    referrer_id = text[1][4:]
                    await bot.reply_to(message, f"🔍 Checking referral: {referrer_id}")
                    
                    referrer = await users_collection.find_one({"_id": referrer_id})
                    
                    if referrer:
                        await bot.reply_to(message, "✅ Referrer found")
                        user_data["referredBy"] = referrer_id
                        bonus_amount = 500 if is_premium else 200
                        
                        referral_data = {
                            "addedValue": bonus_amount,
                            "first_name": user_first_name,
                            "last_name": user_last_name,
                            "userImage": user_image
                        }
                        
                        try:
                            update_result = await users_collection.update_one(
                                {"_id": referrer_id},
                                {
                                    "$inc": {"balance": bonus_amount},
                                    "$set": {f"referrals.{user_id}": referral_data}
                                }
                            )
                            
                            if update_result.modified_count:
                                await bot.reply_to(message, "💰 Referral bonus applied")
                            else:
                                await bot.reply_to(message, "⚠️ Failed to apply referral bonus")
                        except Exception as e:
                            await bot.reply_to(message, f"❌ Error updating referrer: {str(e)}")
                
                # Insert new user
                try:
                    await users_collection.insert_one(user_data)
                    await bot.reply_to(message, "✅ User profile created successfully")
                except Exception as e:
                    await bot.reply_to(message, f"❌ Error creating user profile: {str(e)}")
                    return

        except Exception as e:
            await bot.reply_to(message, f"❌ Database error: {str(e)}")
            return

        welcome_message = (
            f"Hi, {user_first_name} 👋! \n\n"
            f"Welcome to Tapshot, \n"
            f"mine, relax and earn like a boss 😎. \n\n"
            f"Invite friends to earn even better 💵! \n\n" 
            f"Follow us on twitter: https://x.com/_tapshot \n\n"
            f"for more updates, stay connected!"
        )

        keyboard = generate_start_keyboard()
        await bot.reply_to(message, welcome_message, reply_markup=keyboard)

    except Exception as e:
        error_message = f"❌ Critical error: {str(e)}"
        await bot.reply_to(message, error_message)


async def force_reset_update_state():
    """
    Forces a reset of the update state and cleans up any hanging processes
    """
    state = UpdateState.get_instance()
    state.is_running = False
    state.process_id = None
    state.last_update_time = None
    
    # Reset the global flag from the previous code
    global update_in_progress
    update_in_progress = False
    
    return "Update state has been forcefully reset"

@bot.message_handler(commands=['force-reset'])
async def force_reset_command(message):
    """
    Command handler to force reset the update state
    """
    try:
        result = await force_reset_update_state()
        await bot.reply_to(message, "🔄 Update state has been forcefully reset. You can now run /update-all-profiles again.")
    except Exception as e:
        await bot.reply_to(message, f"❌ Error during force reset: {str(e)}")

@bot.message_handler(commands=['check-status'])
async def check_status_command(message):
    """
    Command handler to check the current status of updates
    """
    state = UpdateState.get_instance()
    status = "🟢 No update is currently running" if not state.is_running else "🔴 An update is currently running"
    await bot.reply_to(message, status)

# Global flag to control update process
update_in_progress = False

async def terminate_update():
    """
    Terminates any running profile update process
    """
    global update_in_progress
    update_in_progress = False
    return "Update process termination signal sent"
async def update_all_user_profiles():
    """
    Updates profile images for all users in the database with improved performance
    and termination control.
    """
    global update_in_progress
    
    # Initialize counters outside try block
    updated_count = 0
    failed_count = 0
    total_users = 0
    
    if update_in_progress:
        return {
            "success": False,
            "message": "An update is already in progress. Use /terminate-update to stop it.",
            "updated": updated_count,
            "failed": failed_count,
            "total": total_users
        }
    
    update_in_progress = True
    
    if users_collection is None:
        db_init_success = await init_db()
        if not db_init_success:
            update_in_progress = False
            return {
                "success": False,
                "message": "Failed to initialize database connection",
                "updated": updated_count,
                "failed": failed_count,
                "total": total_users
            }

    try:
        # Get total count
        total_users = await users_collection.count_documents({})
        
        # Send initial message only once
        status_message = f"🔄 Starting bulk profile update for {total_users} users..."
        print(status_message)
        
        cursor = users_collection.find({})
        
        async for user in cursor:
            if not update_in_progress:
                return {
                    "success": False,
                    "message": "Update process was terminated",
                    "updated": updated_count,
                    "failed": failed_count,
                    "total": total_users
                }
                
            try:
                user_id = user['_id']
                new_image_url = await handle_user_image(bot, user_id)
                
                if new_image_url and new_image_url != user.get('user_image'):
                    update_result = await users_collection.update_one(
                        {"_id": user_id},
                        {
                            "$set": {
                                "user_image": new_image_url,
                                "updated_at": datetime.datetime.utcnow()
                            }
                        }
                    )
                    
                    if update_result.modified_count > 0:
                        updated_count += 1
                        print(f"✅ Updated profile for user {user_id}")
                    else:
                        print(f"⚠️ No changes needed for user {user_id}")
                else:
                    print(f"⚠️ No new image for user {user_id}")
                
                # Shorter delay
                await asyncio.sleep(0.1)
                
            except Exception as e:
                failed_count += 1
                print(f"❌ Error updating user {user_id}: {str(e)}")
                continue
        
        update_in_progress = False
        return {
            "success": True,
            "message": "Profile update operation completed",
            "updated": updated_count,
            "failed": failed_count,
            "total": total_users
        }
        
    except Exception as e:
        update_in_progress = False
        return {
            "success": False,
            "message": f"Error during bulk update: {str(e)}",
            "updated": updated_count,
            "failed": failed_count,
            "total": total_users
        }
@bot.message_handler(commands=['update-all-profiles'])
async def update_all_profiles_command(message):
    """
    Command handler to update all user profile pictures
    """
    try:
        # Check if update is already running
        if update_in_progress:
            await bot.reply_to(message, "⚠️ An update is already in progress. Use /terminate-update to stop it.")
            return
            
        initial_message = await bot.reply_to(message, "🔄 Starting bulk profile update...")
        result = await update_all_user_profiles()
        
        if result["success"]:
            status_message = (
                f"✅ Bulk update completed!\n\n"
                f"📊 Statistics:\n"
                f"Total users: {result['total']}\n"
                f"Successfully updated: {result['updated']}\n"
                f"Failed updates: {result['failed']}"
            )
        else:
            status_message = f"❌ Bulk update failed: {result['message']}"
            
        await bot.edit_message_text(
            chat_id=initial_message.chat.id,
            message_id=initial_message.message_id,
            text=status_message
        )
        
    except Exception as e:
        await bot.reply_to(message, f"❌ Error during bulk update: {str(e)}")

@bot.message_handler(commands=['terminate-update'])
async def terminate_update_command(message):
    """
    Command handler to terminate an ongoing update process
    """
    global update_in_progress
    if update_in_progress:
        result = await terminate_update()
        await bot.reply_to(message, "🛑 Update process termination signal sent. The process will stop after the current operation.")
    else:
        await bot.reply_to(message, "ℹ️ No update process is currently running.")
async def update_user_profile_image(user_id):
    """
    Update an existing user's profile image in MongoDB
    
    :param user_id: Telegram user ID
    :return: Updated profile image URL or None
    """
    try:
        # Convert user_id to string to ensure consistency
        user_id = str(user_id)
        
        # Fetch the profile image URL
        profile_image_url = await handle_user_image(bot, user_id)
        
        if profile_image_url:
            # Update the user's document in MongoDB
            update_result = await users_collection.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "user_image": profile_image_url,
                        "updated_at": datetime.datetime.utcnow()
                    }
                }
            )
            
            # Check if the update was successful
            if update_result.modified_count > 0:
                print(f"Successfully updated profile image for user {user_id}")
                return profile_image_url
            else:
                print(f"No user found or image already up to date for user {user_id}")
                return None
        else:
            print(f"No profile photo found for user {user_id}")
            return None
    
    except Exception as e:
        print(f"Error updating profile image for user {user_id}: {str(e)}")
        return None

# Optional: Add a command handler to manually trigger profile pic update
@bot.message_handler(commands=['update-profile'])
async def update_profile_pic_command(message):
    """
    Command handler to manually update user's profile picture
    """
    user_id = str(message.from_user.id)
    try:
        new_image = await update_user_profile_image(user_id)
        
        if new_image:
            await bot.reply_to(message, "✅ Profile picture updated successfully!")
        else:
            await bot.reply_to(message, "❌ Could not update profile picture.")
    except Exception as e:
        await bot.reply_to(message, f"❌ Error updating profile picture: {str(e)}")

scheduler_running = False

async def schedule_profile_updates():
    """
    Runs the profile update function every 10 hours
    """
    global scheduler_running
    
    if scheduler_running:
        return "Scheduler is already running"
    
    scheduler_running = True
    
    while scheduler_running:
        try:
            # Run the update
            print(f"Starting scheduled update at {datetime.now(pytz.UTC)}")
            result = await update_all_user_profiles()
            
            if result["success"]:
                print(f"Scheduled update completed. Updated: {result['updated']}, Failed: {result['failed']}, Total: {result['total']}")
            else:
                print(f"Scheduled update failed: {result['message']}")
                
        except Exception as e:
            print(f"Error in scheduled update: {str(e)}")
            
        # Wait for 10 hours
        await asyncio.sleep(10 * 60 * 60)  # 10 hours in seconds

async def start_scheduler():
    """
    Starts the scheduler if it's not already running
    """
    if not scheduler_running:
        asyncio.create_task(schedule_profile_updates())
        return "Scheduler started successfully"
    return "Scheduler is already running"

async def stop_scheduler():
    """
    Stops the scheduler
    """
    global scheduler_running
    scheduler_running = False
    return "Scheduler stopped successfully"

# Add command handlers for controlling the scheduler
@bot.message_handler(commands=['start-scheduler'])
async def start_scheduler_command(message):
    """
    Command to start the automatic update scheduler
    """
    try:
        result = await start_scheduler()
        await bot.reply_to(message, f"✅ {result}")
    except Exception as e:
        await bot.reply_to(message, f"❌ Error starting scheduler: {str(e)}")

@bot.message_handler(commands=['stop-scheduler'])
async def stop_scheduler_command(message):
    """
    Command to stop the automatic update scheduler
    """
    try:
        result = await stop_scheduler()
        await bot.reply_to(message, f"✅ {result}")
    except Exception as e:
        await bot.reply_to(message, f"❌ Error stopping scheduler: {str(e)}")

@bot.message_handler(commands=['scheduler-status'])
async def scheduler_status_command(message):
    """
    Command to check if the scheduler is running
    """
    status = "🟢 Running" if scheduler_running else "🔴 Stopped"
    next_update = datetime.now(pytz.UTC) + timedelta(hours=10) if scheduler_running else "N/A"
    
    status_message = (
        f"Scheduler Status: {status}\n"
        f"Next scheduled update: {next_update if scheduler_running else 'N/A'}"
    )
    await bot.reply_to(message, status_message)

class handler(BaseHTTPRequestHandler):
    async def init_handler(self):
        global db, users_collection
        if users_collection is None:
            db_init_success = await init_db()
            return db_init_success
        return True

    def do_POST(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            update_dict = json.loads(post_data.decode('utf-8'))

            asyncio.run(self.process_update(update_dict))

            self.send_response(200)
            self.end_headers()
            self.wfile.write("Update processed successfully".encode())
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"Error processing update: {str(e)}".encode())

    async def process_update(self, update_dict):
        db_init_success = await self.init_handler()
        if not db_init_success:
            raise Exception("Failed to initialize database")
            
        update = types.Update.de_json(update_dict)
        await bot.process_new_updates([update])

    def do_GET(self):
        try:
            # Run the update
            result = asyncio.run(update_all_user_profiles())
            
            # Send response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(str(e).encode())
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval';")
        self.end_headers()
        
        status_message = []
        
        # Check environment variables
        if not BOT_TOKEN:
            status_message.append("❌ BOT_TOKEN not found")
        else:
            status_message.append("✅ BOT_TOKEN configured")
            
        if not MONGO_URI:
            status_message.append("❌ MONGO_URI not found")
        else:
            status_message.append("✅ MONGO_URI configured")
            
        # Check MongoDB client initialization
        if db is None:
            status_message.append("❌ Database not initialized")
        else:
            status_message.append("✅ Database initialized")
            
        status_html = f"""
        <html>
            <body>
                <h1>Bot Status Update user_image</h1>
                <ul>
                    {''.join(f'<li>{msg}</li>' for msg in status_message)}
                </ul>
            </body>
        </html>
        """
        
        self.wfile.write(status_html.encode())