from http.server import BaseHTTPRequestHandler
import json
import os
import asyncio
from telebot.handler_backends import State, StatesGroup
import signal
import sys
import requests
import aiohttp
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
    raise ValueError("BOT_TOKEN not found in environment variables. Please set it in Vercel environment variables.")

bot = AsyncTeleBot(BOT_TOKEN)

# MongoDB setup with connection handling
MONGO_URI = os.getenv('MONGO_URI')
if not MONGO_URI:
    raise ValueError("MONGO_URI not found in environment variables. Please set it in Vercel environment variables.")

async def get_database():
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client.houseme
        # Test the connection
        await db.command("ping")
        return db
    except Exception as e:
        print(f"MongoDB Connection Error: {str(e)}")
        raise

# Initialize DB connection
db = None
users_collection = None

# API Configuration
API_BASE_URL = os.getenv('API_URL', os.getenv('VITE_API_URL', 'http://localhost:3000'))

# Popular areas in Abuja for quick search
POPULAR_ABUJA_AREAS = [
    "Maitama", "Asokoro", "Wuse", "Garki", "Gwarinpa", "Jabi", "Utako", 
    "Kubwa", "Nyanya", "Lugbe", "Karu", "Gwarinpa", "Katampe", "Jahi",
    "Gudu", "Durumi", "Lokogoma", "Apo", "Wuye", "Garki II"
]

# Property types
PROPERTY_TYPES = ["duplex", "self-con", "bungalow", "apartment", "mansion", "flat", "house"]

# User state management for interactive features
user_states = {}  # Stores user interaction states



async def init_db():
    global db, users_collection
    try:
        db = await get_database()
        users_collection = db.users
        # Create indexes for better performance
        await users_collection.create_index("_id")
        await users_collection.create_index("favorites")
        await users_collection.create_index("alerts")
        return True
    except Exception as e:
        print(f"Database initialization error: {str(e)}")
        return False

async def fetch_properties(filters=None):
    """Fetch properties from API"""
    try:
        url = f"{API_BASE_URL}/houses"
        params = {}
        if filters:
            if 'minPrice' in filters and filters['minPrice']:
                params['minPrice'] = filters['minPrice']
            if 'maxPrice' in filters and filters['maxPrice']:
                params['maxPrice'] = filters['maxPrice']
            if 'location' in filters and filters['location']:
                params['location'] = filters['location']
            if 'type' in filters and filters['type']:
                params['type'] = filters['type']
            if 'search' in filters and filters['search']:
                params['search'] = filters['search']
            if 'limit' in filters:
                params['limit'] = filters['limit']
            if 'skip' in filters:
                params['skip'] = filters['skip']
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get('data', [])
                return []
    except Exception as e:
        print(f"Error fetching properties: {str(e)}")
        return []

async def fetch_property(property_id):
    """Fetch single property by ID"""
    try:
        url = f"{API_BASE_URL}/houses/{property_id}"
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get('data') or data
                return None
    except Exception as e:
        print(f"Error fetching property: {str(e)}")
        return None

def format_price(price):
    """Format price in Nigerian Naira"""
    return f"₦{price:,.0f}"

def format_property_short(property):
    """Format property for list display"""
    title = property.get('title', 'Untitled')
    price = format_price(property.get('price', 0))
    location = property.get('location', 'Unknown')
    type_name = property.get('type', '').capitalize()
    bedrooms = property.get('bedrooms', 'N/A')
    property_id = property.get('id') or property.get('_id')
    
    return f"🏠 **{title}**\n💰 {price}\n📍 {location}\n🏘️ {type_name} • 🛏️ {bedrooms} Bedrooms\n🔗 ID: {property_id[:8]}..."

def generate_start_keyboard():
    """Generate main menu keyboard with real estate options"""
    keyboard = InlineKeyboardMarkup(row_width=2)
    keyboard.add(InlineKeyboardButton('🏠 Open House Me App', web_app=WebAppInfo(url="https://house-me.vercel.app/")))
    keyboard.add(
        InlineKeyboardButton('🔍 Search Properties', callback_data='search_properties'),
        InlineKeyboardButton('⭐ My Favorites', callback_data='my_favorites')
    )
    keyboard.add(
        InlineKeyboardButton('📍 Popular Areas', callback_data='popular_areas'),
        InlineKeyboardButton('🔔 Property Alerts', callback_data='property_alerts')
    )
    keyboard.add(InlineKeyboardButton('💬 Contact Support', url='https://wa.me/2348146609734'))
    keyboard.add(
        InlineKeyboardButton('📋 Agreement', callback_data='user_agreement'),
        InlineKeyboardButton('📜 Terms', callback_data='terms_of_service'),
        InlineKeyboardButton('ℹ️ Help', callback_data='help')
    )
    return keyboard

def generate_back_keyboard():
    """Generate back to main menu keyboard"""
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton('🔙 Back to Main Menu', callback_data='back_to_menu'))
    return keyboard

def generate_search_keyboard():
    """Generate search options keyboard"""
    keyboard = InlineKeyboardMarkup(row_width=2)
    keyboard.add(InlineKeyboardButton('📍 Search by Location', callback_data='search_location'))
    keyboard.add(InlineKeyboardButton('💰 Search by Price', callback_data='search_price'))
    keyboard.add(InlineKeyboardButton('🏘️ Search by Type', callback_data='search_type'))
    keyboard.add(InlineKeyboardButton('📝 Text Search', callback_data='search_text'))
    keyboard.add(InlineKeyboardButton('🔙 Back', callback_data='back_to_menu'))
    return keyboard

def generate_popular_areas_keyboard():
    """Generate keyboard with popular Abuja areas"""
    keyboard = InlineKeyboardMarkup(row_width=2)
    # Show first 12 popular areas
    for area in POPULAR_ABUJA_AREAS[:12]:
        keyboard.add(InlineKeyboardButton(f'📍 {area}', callback_data=f'area_{area}'))
    keyboard.add(InlineKeyboardButton('🔙 Back', callback_data='back_to_menu'))
    return keyboard

def generate_property_types_keyboard():
    """Generate keyboard with property types"""
    keyboard = InlineKeyboardMarkup(row_width=2)
    for prop_type in PROPERTY_TYPES:
        keyboard.add(InlineKeyboardButton(f'🏘️ {prop_type.capitalize()}', callback_data=f'type_{prop_type}'))
    keyboard.add(InlineKeyboardButton('🔙 Back', callback_data='search_properties'))
    return keyboard

def generate_property_keyboard(property_id, is_favorite=False):
    """Generate keyboard for property details"""
    keyboard = InlineKeyboardMarkup(row_width=2)
    if is_favorite:
        keyboard.add(InlineKeyboardButton('❌ Remove from Favorites', callback_data=f'fav_remove_{property_id}'))
    else:
        keyboard.add(InlineKeyboardButton('⭐ Add to Favorites', callback_data=f'fav_add_{property_id}'))
    keyboard.add(InlineKeyboardButton('💬 Contact Agent', callback_data=f'contact_{property_id}'))
    keyboard.add(InlineKeyboardButton('🔙 Back to Search', callback_data='back_to_search'))
    return keyboard

def generate_properties_list_keyboard(properties, page=0, per_page=5):
    """Generate keyboard for property list with pagination"""
    keyboard = InlineKeyboardMarkup(row_width=1)
    start_idx = page * per_page
    end_idx = min(start_idx + per_page, len(properties))
    
    for prop in properties[start_idx:end_idx]:
        prop_id = prop.get('id') or prop.get('_id')
        title = prop.get('title', 'Untitled')[:30]
        keyboard.add(InlineKeyboardButton(f"🏠 {title}...", callback_data=f'prop_{prop_id}'))
    
    # Pagination buttons
    nav_buttons = []
    if page > 0:
        nav_buttons.append(InlineKeyboardButton('◀️ Previous', callback_data=f'page_{page-1}'))
    if end_idx < len(properties):
        nav_buttons.append(InlineKeyboardButton('Next ▶️', callback_data=f'page_{page+1}'))
    if nav_buttons:
        keyboard.add(*nav_buttons)
    
    keyboard.add(InlineKeyboardButton('🔙 Back', callback_data='back_to_search'))
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
    """Handle /start command with professional welcome message"""
    try:
        user_id = str(message.from_user.id)
        user_first_name = message.from_user.first_name or "Valued User"
        user_last_name = message.from_user.last_name or ""
        user_full_name = f"{user_first_name} {user_last_name}".strip()
        
        # Initialize database
        if users_collection is None:
            db_init_success = await init_db()
            if not db_init_success:
                await bot.reply_to(message, "⚠️ Unable to initialize database. Please try again later.")
                return

        # Check for existing user and create if new
        try:
            existing_user = await users_collection.find_one({"_id": user_id})
            
            if not existing_user:
                user_image = await handle_user_image(bot, user_id)
                
                user_data = {
                    "_id": user_id,
                    "first_name": user_first_name,
                    "last_name": user_last_name,
                    "username": message.from_user.username,
                    "language_code": str(message.from_user.language_code or "en"),
                    "is_premium": message.from_user.is_premium or False,
                    "user_image": user_image,
                    "created_at": datetime.datetime.utcnow(),
                    "updated_at": datetime.datetime.utcnow(),
                }
                
                await users_collection.insert_one(user_data)
        except Exception as e:
            print(f"Database error: {str(e)}")
            # Continue with welcome message even if DB fails

        # Professional welcome message for House Me
        welcome_message = (
            f"Hello {user_first_name}! 👋\n\n"
            f"🏠 Welcome to **House Me** - Your Trusted Real Estate Partner in Abuja!\n\n"
            f"Discover your perfect home or property investment in Nigeria's capital city. "
            f"Whether you're looking to buy, rent, or list properties, House Me connects you "
            f"with verified agents and quality listings across Abuja.\n\n"
            f"✨ **What we offer:**\n"
            f"• Browse verified property listings\n"
            f"• Connect with trusted real estate agents\n"
            f"• List your properties (Agents & Landlords)\n"
            f"• Interactive map views\n"
            f"• Property comparison tools\n\n"
            f"📍 Serving Abuja residents with professionalism and integrity.\n\n"
            f"💬 Need help? Contact our support team via WhatsApp:\n"
            f"📱 +234 814 660 9734\n\n"
            f"Tap the button below to get started!"
        )

        keyboard = generate_start_keyboard()
        await bot.reply_to(message, welcome_message, reply_markup=keyboard, parse_mode='Markdown')

    except Exception as e:
        error_message = f"❌ An error occurred. Please try again or contact support."
        await bot.reply_to(message, error_message)
        print(f"Error in start handler: {str(e)}")

@bot.callback_query_handler(func=lambda call: True)
async def handle_callbacks(call):
    """Handle all callback queries from inline keyboards"""
    try:
        if call.data == 'user_agreement':
            agreement_text = (
                "📋 **USER AGREEMENT**\n\n"
                "**Last Updated:** " + datetime.datetime.now().strftime("%B %d, %Y") + "\n\n"
                "By using House Me's services, you agree to the following terms:\n\n"
                "**1. Account Registration**\n"
                "• You must provide accurate and complete information\n"
                "• You are responsible for maintaining the security of your account\n"
                "• One account per user\n\n"
                "**2. Property Listings**\n"
                "• All property information must be accurate and truthful\n"
                "• You may not list properties you don't own or have authorization to list\n"
                "• House Me reserves the right to verify and remove listings\n\n"
                "**3. User Conduct**\n"
                "• Respectful communication with agents and other users is required\n"
                "• No harassment, spam, or fraudulent activities\n"
                "• Compliance with Nigerian real estate laws and regulations\n\n"
                "**4. Privacy**\n"
                "• Your personal information will be handled according to our Privacy Policy\n"
                "• Contact information may be shared with verified agents\n\n"
                "**5. Limitation of Liability**\n"
                "• House Me serves as a platform connecting buyers, renters, and agents\n"
                "• We do not guarantee property conditions or transaction outcomes\n"
                "• Users are responsible for due diligence\n\n"
                "**6. Service Availability**\n"
                "• House Me reserves the right to modify or discontinue services\n"
                "• We aim to maintain service availability but cannot guarantee 100% uptime\n\n"
                "For questions about this agreement, contact us via WhatsApp:\n"
                "📱 +234 814 660 9734"
            )
            keyboard = generate_back_keyboard()
            await bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text=agreement_text,
                reply_markup=keyboard,
                parse_mode='Markdown'
            )
        
        elif call.data == 'terms_of_service':
            terms_text = (
                "📜 **TERMS OF SERVICE**\n\n"
                "**Last Updated:** " + datetime.datetime.now().strftime("%B %d, %Y") + "\n\n"
                "**1. Acceptance of Terms**\n"
                "By accessing and using House Me, you accept and agree to be bound by these Terms of Service.\n\n"
                "**2. Platform Description**\n"
                "House Me is a real estate platform connecting property seekers with verified agents and landlords in Abuja, Nigeria.\n\n"
                "**3. User Eligibility**\n"
                "• You must be at least 18 years old\n"
                "• You must have the legal capacity to enter into contracts\n"
                "• You must comply with all applicable Nigerian laws\n\n"
                "**4. Property Information**\n"
                "• Property listings are provided by agents and landlords\n"
                "• House Me verifies agents but not individual property details\n"
                "• Users should conduct their own inspections and due diligence\n"
                "• Prices and availability are subject to change\n\n"
                "**5. Agent Verification**\n"
                "• House Me verifies agent credentials to the best of our ability\n"
                "• Verified status indicates basic verification, not endorsement\n"
                "• Users should still exercise caution in all transactions\n\n"
                "**6. Prohibited Activities**\n"
                "• Fraudulent listings or misrepresentation\n"
                "• Harassment or abuse of other users\n"
                "• Automated data scraping or unauthorized access\n"
                "• Any illegal activities\n\n"
                "**7. Intellectual Property**\n"
                "• All content on House Me is protected by copyright\n"
                "• Property images belong to their respective owners\n"
                "• You may not reproduce content without permission\n\n"
                "**8. Disclaimer**\n"
                "• House Me is a platform only; we are not a party to transactions\n"
                "• We do not guarantee property conditions, prices, or availability\n"
                "• Users enter into agreements at their own risk\n\n"
                "**9. Termination**\n"
                "House Me reserves the right to suspend or terminate accounts that violate these terms.\n\n"
                "**10. Changes to Terms**\n"
                "We may update these terms; continued use constitutes acceptance.\n\n"
                "**11. Contact Information**\n"
                "For questions about these terms:\n"
                "📱 WhatsApp: +234 814 660 9734\n"
                "📧 Email: abujashoemall@gmail.com\n\n"
                "**Jurisdiction:** These terms are governed by Nigerian law."
            )
            keyboard = generate_back_keyboard()
            await bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text=terms_text,
                reply_markup=keyboard,
                parse_mode='Markdown'
            )
        
        elif call.data == 'help':
            help_text = (
                "ℹ️ **HOUSE ME - HELP & SUPPORT**\n\n"
                "**Getting Started:**\n"
                "1. Tap '🏠 Open House Me App' to access our web platform\n"
                "2. Browse properties by location, price, type, and features\n"
                "3. Create an account to list properties or save favorites\n\n"
                "**For Property Seekers:**\n"
                "• Browse verified listings across Abuja\n"
                "• Use filters to find your perfect property\n"
                "• View properties on interactive maps\n"
                "• Contact agents directly via WhatsApp\n"
                "• Compare properties side-by-side\n\n"
                "**For Agents & Landlords:**\n"
                "• Create an account and get verified\n"
                "• List your properties with photos and details\n"
                "• Manage your listings from your dashboard\n"
                "• Connect with potential buyers and renters\n\n"
                "**Available Commands:**\n"
                "/start - Main menu and welcome\n"
                "/help - Show this help message\n"
                "/terms - View Terms of Service\n"
                "/agreement - View User Agreement\n"
                "/contact - Contact support\n\n"
                "**Need More Help?**\n"
                "Our support team is ready to assist you:\n"
                "📱 WhatsApp: +234 814 660 9734\n"
                "📧 Email: abujashoemall@gmail.com\n\n"
                "We're here to help you find your perfect property in Abuja! 🏠"
            )
            keyboard = generate_back_keyboard()
            await bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text=help_text,
                reply_markup=keyboard,
                parse_mode='Markdown'
            )
        
        elif call.data == 'search_properties':
            search_text = (
                "🔍 **PROPERTY SEARCH**\n\n"
                "Choose how you'd like to search for properties:\n\n"
                "• **By Location** - Search properties in specific areas\n"
                "• **By Price** - Find properties within your budget\n"
                "• **By Type** - Filter by property type (Duplex, Apartment, etc.)\n"
                "• **Text Search** - Search by keywords\n\n"
                "Select an option below:"
            )
            keyboard = generate_search_keyboard()
            await bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text=search_text,
                reply_markup=keyboard,
                parse_mode='Markdown'
            )
        
        elif call.data == 'popular_areas':
            areas_text = (
                "📍 **POPULAR AREAS IN ABUJA**\n\n"
                "Tap on any area below to see available properties:\n\n"
                "These are the most searched areas in Abuja. "
                "Select one to browse properties in that location."
            )
            keyboard = generate_popular_areas_keyboard()
            await bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text=areas_text,
                reply_markup=keyboard,
                parse_mode='Markdown'
            )
        
        elif call.data.startswith('area_'):
            area = call.data.replace('area_', '')
            user_states[call.from_user.id] = {'search_type': 'location', 'location': area, 'page': 0}
            await bot.answer_callback_query(call.id, f"Searching properties in {area}...")
            
            properties = await fetch_properties({'location': area, 'limit': 20})
            if properties:
                text = f"🏠 **Properties in {area}**\n\nFound {len(properties)} properties:\n\n"
                text += "Select a property to view details:"
                keyboard = generate_properties_list_keyboard(properties, 0)
                await bot.edit_message_text(
                    chat_id=call.message.chat.id,
                    message_id=call.message.message_id,
                    text=text,
                    reply_markup=keyboard,
                    parse_mode='Markdown'
                )
            else:
                await bot.edit_message_text(
                    chat_id=call.message.chat.id,
                    message_id=call.message.message_id,
                    text=f"❌ No properties found in {area}. Try another area or contact us for assistance.",
                    reply_markup=generate_back_keyboard(),
                    parse_mode='Markdown'
                )
        
        elif call.data.startswith('type_'):
            prop_type = call.data.replace('type_', '')
            user_states[call.from_user.id] = {'search_type': 'type', 'type': prop_type, 'page': 0}
            await bot.answer_callback_query(call.id, f"Searching {prop_type} properties...")
            
            properties = await fetch_properties({'type': prop_type, 'limit': 20})
            if properties:
                text = f"🏘️ **{prop_type.capitalize()} Properties**\n\nFound {len(properties)} properties:\n\n"
                text += "Select a property to view details:"
                keyboard = generate_properties_list_keyboard(properties, 0)
                await bot.edit_message_text(
                    chat_id=call.message.chat.id,
                    message_id=call.message.message_id,
                    text=text,
                    reply_markup=keyboard,
                    parse_mode='Markdown'
                )
            else:
                await bot.edit_message_text(
                    chat_id=call.message.chat.id,
                    message_id=call.message.message_id,
                    text=f"❌ No {prop_type} properties found. Try another type or contact us.",
                    reply_markup=generate_back_keyboard(),
                    parse_mode='Markdown'
                )
        
        elif call.data.startswith('prop_'):
            property_id = call.data.replace('prop_', '')
            property_data = await fetch_property(property_id)
            
            if property_data:
                # Check if in favorites
                user_id = str(call.from_user.id)
                user = await users_collection.find_one({"_id": user_id})
                favorites = user.get('favorites', []) if user else []
                is_favorite = property_id in favorites
                
                # Format property details
                text = f"🏠 **{property_data.get('title', 'Property Details')}**\n\n"
                text += f"💰 **Price:** {format_price(property_data.get('price', 0))}\n"
                text += f"📍 **Location:** {property_data.get('location', 'N/A')}\n"
                text += f"🏘️ **Type:** {property_data.get('type', 'N/A').capitalize()}\n"
                if property_data.get('bedrooms'):
                    text += f"🛏️ **Bedrooms:** {property_data.get('bedrooms')}\n"
                if property_data.get('bathrooms'):
                    text += f"🚿 **Bathrooms:** {property_data.get('bathrooms')}\n"
                if property_data.get('area'):
                    text += f"📐 **Area:** {property_data.get('area')} sqm\n"
                text += f"\n📝 **Description:**\n{property_data.get('description', 'No description available.')[:500]}\n"
                if property_data.get('agent'):
                    agent = property_data.get('agent', {})
                    text += f"\n👤 **Agent:** {agent.get('name', 'N/A')}"
                    if agent.get('verified'):
                        text += " ✅ Verified"
                text += f"\n\n🔗 View on website: https://house-me.vercel.app/house/{property_id}"
                
                keyboard = generate_property_keyboard(property_id, is_favorite)
                await bot.edit_message_text(
                    chat_id=call.message.chat.id,
                    message_id=call.message.message_id,
                    text=text,
                    reply_markup=keyboard,
                    parse_mode='Markdown'
                )
            else:
                await bot.answer_callback_query(call.id, "Property not found", show_alert=True)
        
        elif call.data.startswith('fav_add_'):
            property_id = call.data.replace('fav_add_', '')
            user_id = str(call.from_user.id)
            
            try:
                user = await users_collection.find_one({"_id": user_id})
                favorites = user.get('favorites', []) if user else []
                
                if property_id not in favorites:
                    favorites.append(property_id)
                    await users_collection.update_one(
                        {"_id": user_id},
                        {"$set": {"favorites": favorites, "updated_at": datetime.datetime.utcnow()}},
                        upsert=True
                    )
                    await bot.answer_callback_query(call.id, "✅ Added to favorites!")
                else:
                    await bot.answer_callback_query(call.id, "Already in favorites")
                
                # Refresh property view
                property_data = await fetch_property(property_id)
                if property_data:
                    keyboard = generate_property_keyboard(property_id, True)
                    await bot.edit_message_reply_markup(
                        chat_id=call.message.chat.id,
                        message_id=call.message.message_id,
                        reply_markup=keyboard
                    )
            except Exception as e:
                await bot.answer_callback_query(call.id, "Error adding to favorites", show_alert=True)
                print(f"Error adding favorite: {str(e)}")
        
        elif call.data.startswith('fav_remove_'):
            property_id = call.data.replace('fav_remove_', '')
            user_id = str(call.from_user.id)
            
            try:
                favorites = (await users_collection.find_one({"_id": user_id})).get('favorites', [])
                if property_id in favorites:
                    favorites.remove(property_id)
                    await users_collection.update_one(
                        {"_id": user_id},
                        {"$set": {"favorites": favorites, "updated_at": datetime.datetime.utcnow()}}
                    )
                    await bot.answer_callback_query(call.id, "❌ Removed from favorites")
                
                # Refresh property view
                property_data = await fetch_property(property_id)
                if property_data:
                    keyboard = generate_property_keyboard(property_id, False)
                    await bot.edit_message_reply_markup(
                        chat_id=call.message.chat.id,
                        message_id=call.message.message_id,
                        reply_markup=keyboard
                    )
            except Exception as e:
                await bot.answer_callback_query(call.id, "Error removing favorite", show_alert=True)
                print(f"Error removing favorite: {str(e)}")
        
        elif call.data == 'my_favorites':
            user_id = str(call.from_user.id)
            user = await users_collection.find_one({"_id": user_id})
            favorites = user.get('favorites', []) if user else []
            
            if not favorites:
                await bot.edit_message_text(
                    chat_id=call.message.chat.id,
                    message_id=call.message.message_id,
                    text="⭐ **My Favorites**\n\nYou haven't saved any favorites yet.\n\nBrowse properties and tap ⭐ to save your favorites!",
                    reply_markup=generate_back_keyboard(),
                    parse_mode='Markdown'
                )
            else:
                # Fetch favorite properties
                properties = []
                for prop_id in favorites[:20]:  # Limit to 20
                    prop = await fetch_property(prop_id)
                    if prop:
                        properties.append(prop)
                
                if properties:
                    text = f"⭐ **My Favorites**\n\nYou have {len(favorites)} saved properties:\n\n"
                    text += "Select a property to view details:"
                    keyboard = generate_properties_list_keyboard(properties, 0)
                    await bot.edit_message_text(
                        chat_id=call.message.chat.id,
                        message_id=call.message.message_id,
                        text=text,
                        reply_markup=keyboard,
                        parse_mode='Markdown'
                    )
                else:
                    await bot.edit_message_text(
                        chat_id=call.message.chat.id,
                        message_id=call.message.message_id,
                        text="⭐ **My Favorites**\n\nYour saved properties are no longer available.",
                        reply_markup=generate_back_keyboard(),
                        parse_mode='Markdown'
                    )
        
        elif call.data == 'property_alerts':
            alerts_text = (
                "🔔 **PROPERTY ALERTS**\n\n"
                "Set up alerts to be notified when new properties match your criteria.\n\n"
                "**Coming Soon!**\n\n"
                "This feature will allow you to:\n"
                "• Set price range alerts\n"
                "• Get notified about properties in specific areas\n"
                "• Receive alerts for your preferred property types\n\n"
                "For now, you can browse properties using the search feature or contact our support team for assistance."
            )
            keyboard = generate_back_keyboard()
            await bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text=alerts_text,
                reply_markup=keyboard,
                parse_mode='Markdown'
            )
        
        elif call.data == 'search_location':
            await bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text="📍 **Search by Location**\n\nPlease type the area name (e.g., Maitama, Asokoro, Gwarinpa):",
                reply_markup=generate_back_keyboard(),
                parse_mode='Markdown'
            )
            user_states[call.from_user.id] = {'waiting_for': 'location'}
        
        elif call.data == 'search_type':
            types_text = (
                "🏘️ **Search by Property Type**\n\n"
                "Select a property type to browse:"
            )
            keyboard = generate_property_types_keyboard()
            await bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text=types_text,
                reply_markup=keyboard,
                parse_mode='Markdown'
            )
        
        elif call.data == 'search_price':
            await bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text="💰 **Search by Price**\n\nPlease send your price range in this format:\n\n`min-max`\n\nExample: `5000000-20000000`\n\nOr send just maximum price:\n`20000000`",
                reply_markup=generate_back_keyboard(),
                parse_mode='Markdown'
            )
            user_states[call.from_user.id] = {'waiting_for': 'price'}
        
        elif call.data == 'search_text':
            await bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text="📝 **Text Search**\n\nType keywords to search (e.g., 'luxury apartment', 'maitama duplex'):",
                reply_markup=generate_back_keyboard(),
                parse_mode='Markdown'
            )
            user_states[call.from_user.id] = {'waiting_for': 'text_search'}
        
        elif call.data == 'back_to_search':
            search_text = (
                "🔍 **PROPERTY SEARCH**\n\n"
                "Choose how you'd like to search for properties:\n\n"
                "• **By Location** - Search properties in specific areas\n"
                "• **By Price** - Find properties within your budget\n"
                "• **By Type** - Filter by property type (Duplex, Apartment, etc.)\n"
                "• **Text Search** - Search by keywords\n\n"
                "Select an option below:"
            )
            keyboard = generate_search_keyboard()
            await bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text=search_text,
                reply_markup=keyboard,
                parse_mode='Markdown'
            )
        
        elif call.data.startswith('page_'):
            page = int(call.data.replace('page_', ''))
            user_state = user_states.get(call.from_user.id, {})
            filters = {k: v for k, v in user_state.items() if k not in ['page', 'waiting_for']}
            filters['limit'] = 20
            filters['skip'] = page * 5
            
            properties = await fetch_properties(filters)
            if properties:
                text = f"🏠 **Properties**\n\nFound {len(properties)} properties (Page {page + 1}):\n\n"
                text += "Select a property to view details:"
                keyboard = generate_properties_list_keyboard(properties, page)
                await bot.edit_message_text(
                    chat_id=call.message.chat.id,
                    message_id=call.message.message_id,
                    text=text,
                    reply_markup=keyboard,
                    parse_mode='Markdown'
                )
        
        elif call.data.startswith('contact_'):
            property_id = call.data.replace('contact_', '')
            property_data = await fetch_property(property_id)
            if property_data and property_data.get('agent'):
                agent = property_data.get('agent', {})
                contact_text = (
                    f"💬 **Contact Agent**\n\n"
                    f"👤 **Agent:** {agent.get('name', 'N/A')}\n"
                )
                if agent.get('phone'):
                    contact_text += f"📱 **Phone:** {agent.get('phone')}\n"
                if agent.get('email'):
                    contact_text += f"📧 **Email:** {agent.get('email')}\n"
                contact_text += f"\n🔗 **View Property:**\nhttps://house-me.vercel.app/house/{property_id}\n\n"
                contact_text += "💬 **Need Help?**\nContact our support: +234 814 660 9734"
                
                keyboard = InlineKeyboardMarkup()
                if agent.get('phone'):
                    keyboard.add(InlineKeyboardButton('📱 Call Agent', url=f"tel:{agent.get('phone')}"))
                    keyboard.add(InlineKeyboardButton('💬 WhatsApp', url=f"https://wa.me/{agent.get('phone').replace('+', '').replace(' ', '')}"))
                keyboard.add(InlineKeyboardButton('🔙 Back to Property', callback_data=f'prop_{property_id}'))
                
                await bot.edit_message_text(
                    chat_id=call.message.chat.id,
                    message_id=call.message.message_id,
                    text=contact_text,
                    reply_markup=keyboard,
                    parse_mode='Markdown'
                )
        
        elif call.data == 'back_to_menu':
            user_first_name = call.from_user.first_name or "Valued User"
            welcome_message = (
                f"Hello {user_first_name}! 👋\n\n"
                f"🏠 Welcome to **House Me** - Your Trusted Real Estate Partner in Abuja!\n\n"
                f"Discover your perfect home or property investment in Nigeria's capital city. "
                f"Whether you're looking to buy, rent, or list properties, House Me connects you "
                f"with verified agents and quality listings across Abuja.\n\n"
                f"✨ **What we offer:**\n"
                f"• Browse verified property listings\n"
                f"• Connect with trusted real estate agents\n"
                f"• List your properties (Agents & Landlords)\n"
                f"• Interactive map views\n"
                f"• Property comparison tools\n\n"
                f"📍 Serving Abuja residents with professionalism and integrity.\n\n"
                f"💬 Need help? Contact our support team via WhatsApp:\n"
                f"📱 +234 814 660 9734\n\n"
                f"Tap the button below to get started!"
            )
            keyboard = generate_start_keyboard()
            await bot.edit_message_text(
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                text=welcome_message,
                reply_markup=keyboard,
                parse_mode='Markdown'
            )
        
        await bot.answer_callback_query(call.id)
    
    except Exception as e:
        print(f"Error handling callback: {str(e)}")
        await bot.answer_callback_query(call.id, "An error occurred. Please try again.")

@bot.message_handler(commands=['help'])
async def help_command(message):
    """Handle /help command"""
    help_text = (
        "ℹ️ **HOUSE ME - HELP & SUPPORT**\n\n"
        "**Getting Started:**\n"
        "1. Tap '🏠 Open House Me App' to access our web platform\n"
        "2. Browse properties by location, price, type, and features\n"
        "3. Create an account to list properties or save favorites\n\n"
        "**For Property Seekers:**\n"
        "• Browse verified listings across Abuja\n"
        "• Use filters to find your perfect property\n"
        "• View properties on interactive maps\n"
        "• Contact agents directly via WhatsApp\n"
        "• Compare properties side-by-side\n\n"
        "**For Agents & Landlords:**\n"
        "• Create an account and get verified\n"
        "• List your properties with photos and details\n"
        "• Manage your listings from your dashboard\n"
        "• Connect with potential buyers and renters\n\n"
        "**Available Commands:**\n"
        "/start - Main menu and welcome\n"
        "/help - Show this help message\n"
        "/terms - View Terms of Service\n"
        "/agreement - View User Agreement\n"
        "/contact - Contact support\n\n"
        "**Need More Help?**\n"
        "Our support team is ready to assist you:\n"
        "📱 WhatsApp: +234 814 660 9734\n"
        "📧 Email: abujashoemall@gmail.com\n\n"
        "We're here to help you find your perfect property in Abuja! 🏠"
    )
    keyboard = generate_back_keyboard()
    await bot.reply_to(message, help_text, reply_markup=keyboard, parse_mode='Markdown')

@bot.message_handler(commands=['terms'])
async def terms_command(message):
    """Handle /terms command"""
    terms_text = (
        "📜 **TERMS OF SERVICE**\n\n"
        "**Last Updated:** " + datetime.datetime.now().strftime("%B %d, %Y") + "\n\n"
        "**1. Acceptance of Terms**\n"
        "By accessing and using House Me, you accept and agree to be bound by these Terms of Service.\n\n"
        "**2. Platform Description**\n"
        "House Me is a real estate platform connecting property seekers with verified agents and landlords in Abuja, Nigeria.\n\n"
        "**3. User Eligibility**\n"
        "• You must be at least 18 years old\n"
        "• You must have the legal capacity to enter into contracts\n"
        "• You must comply with all applicable Nigerian laws\n\n"
        "**4. Property Information**\n"
        "• Property listings are provided by agents and landlords\n"
        "• House Me verifies agents but not individual property details\n"
        "• Users should conduct their own inspections and due diligence\n"
        "• Prices and availability are subject to change\n\n"
        "**5. Agent Verification**\n"
        "• House Me verifies agent credentials to the best of our ability\n"
        "• Verified status indicates basic verification, not endorsement\n"
        "• Users should still exercise caution in all transactions\n\n"
        "**6. Prohibited Activities**\n"
        "• Fraudulent listings or misrepresentation\n"
        "• Harassment or abuse of other users\n"
        "• Automated data scraping or unauthorized access\n"
        "• Any illegal activities\n\n"
        "**7. Intellectual Property**\n"
        "• All content on House Me is protected by copyright\n"
        "• Property images belong to their respective owners\n"
        "• You may not reproduce content without permission\n\n"
        "**8. Disclaimer**\n"
        "• House Me is a platform only; we are not a party to transactions\n"
        "• We do not guarantee property conditions, prices, or availability\n"
        "• Users enter into agreements at their own risk\n\n"
        "**9. Termination**\n"
        "House Me reserves the right to suspend or terminate accounts that violate these terms.\n\n"
        "**10. Changes to Terms**\n"
        "We may update these terms; continued use constitutes acceptance.\n\n"
        "**11. Contact Information**\n"
        "For questions about these terms:\n"
        "📱 WhatsApp: +234 814 660 9734\n"
        "📧 Email: abujashoemall@gmail.com\n\n"
        "**Jurisdiction:** These terms are governed by Nigerian law."
    )
    keyboard = generate_back_keyboard()
    await bot.reply_to(message, terms_text, reply_markup=keyboard, parse_mode='Markdown')

@bot.message_handler(commands=['agreement'])
async def agreement_command(message):
    """Handle /agreement command"""
    agreement_text = (
        "📋 **USER AGREEMENT**\n\n"
        "**Last Updated:** " + datetime.datetime.now().strftime("%B %d, %Y") + "\n\n"
        "By using House Me's services, you agree to the following terms:\n\n"
        "**1. Account Registration**\n"
        "• You must provide accurate and complete information\n"
        "• You are responsible for maintaining the security of your account\n"
        "• One account per user\n\n"
        "**2. Property Listings**\n"
        "• All property information must be accurate and truthful\n"
        "• You may not list properties you don't own or have authorization to list\n"
        "• House Me reserves the right to verify and remove listings\n\n"
        "**3. User Conduct**\n"
        "• Respectful communication with agents and other users is required\n"
        "• No harassment, spam, or fraudulent activities\n"
        "• Compliance with Nigerian real estate laws and regulations\n\n"
        "**4. Privacy**\n"
        "• Your personal information will be handled according to our Privacy Policy\n"
        "• Contact information may be shared with verified agents\n\n"
        "**5. Limitation of Liability**\n"
        "• House Me serves as a platform connecting buyers, renters, and agents\n"
        "• We do not guarantee property conditions or transaction outcomes\n"
        "• Users are responsible for due diligence\n\n"
        "**6. Service Availability**\n"
        "• House Me reserves the right to modify or discontinue services\n"
        "• We aim to maintain service availability but cannot guarantee 100% uptime\n\n"
        "For questions about this agreement, contact us via WhatsApp:\n"
        "📱 +234 814 660 9734"
    )
    keyboard = generate_back_keyboard()
    await bot.reply_to(message, agreement_text, reply_markup=keyboard, parse_mode='Markdown')

@bot.message_handler(commands=['contact'])
async def contact_command(message):
    """Handle /contact command"""
    contact_text = (
        "💬 **CONTACT HOUSE ME SUPPORT**\n\n"
        "We're here to help you with any questions or concerns!\n\n"
        "**📱 WhatsApp Support:**\n"
        "Click here to chat: https://wa.me/2348146609734\n"
        "Or send a message to: +234 814 660 9734\n\n"
        "**📧 Email Support:**\n"
        "abujashoemall@gmail.com\n\n"
        "**🕐 Response Time:**\n"
        "We typically respond within 24 hours during business days.\n\n"
        "**📍 Location:**\n"
        "Serving Abuja, Nigeria\n\n"
        "**Common Inquiries:**\n"
        "• Property listing questions\n"
        "• Account issues\n"
        "• Agent verification\n"
        "• General platform questions\n"
        "• Technical support\n\n"
        "For urgent matters, please use WhatsApp for faster response."
    )
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton('💬 Chat on WhatsApp', url='https://wa.me/2348146609734'))
    keyboard.add(InlineKeyboardButton('🔙 Back to Main Menu', callback_data='back_to_menu'))
    await bot.reply_to(message, contact_text, reply_markup=keyboard, parse_mode='Markdown')


# Text message handlers for search inputs
@bot.message_handler(func=lambda message: True, content_types=['text'])
async def handle_text_messages(message):
    """Handle text messages for search functionality"""
    try:
        user_id = message.from_user.id
        user_state = user_states.get(user_id, {})
        waiting_for = user_state.get('waiting_for')
        
        if not waiting_for:
            # Not in a search flow, show help
            return
        
        text = message.text.strip()
        
        if waiting_for == 'location':
            # Search by location
            user_states[user_id] = {'search_type': 'location', 'location': text, 'page': 0}
            await bot.reply_to(message, f"🔍 Searching properties in {text}...")
            
            properties = await fetch_properties({'location': text, 'limit': 20})
            if properties:
                response_text = f"🏠 **Properties in {text}**\n\nFound {len(properties)} properties:\n\n"
                response_text += "Select a property to view details:"
                keyboard = generate_properties_list_keyboard(properties, 0)
                await bot.reply_to(message, response_text, reply_markup=keyboard, parse_mode='Markdown')
            else:
                await bot.reply_to(
                    message,
                    f"❌ No properties found in {text}. Try another location or browse popular areas.",
                    reply_markup=generate_back_keyboard(),
                    parse_mode='Markdown'
                )
            user_states[user_id] = {'search_type': 'location', 'location': text, 'page': 0}
        
        elif waiting_for == 'price':
            # Search by price range
            try:
                if '-' in text:
                    # Price range
                    parts = text.split('-')
                    min_price = int(parts[0].strip().replace(',', '').replace('₦', ''))
                    max_price = int(parts[1].strip().replace(',', '').replace('₦', ''))
                    filters = {'minPrice': min_price, 'maxPrice': max_price}
                    user_states[user_id] = {'search_type': 'price', 'minPrice': min_price, 'maxPrice': max_price, 'page': 0}
                    await bot.reply_to(message, f"🔍 Searching properties from ₦{min_price:,} to ₦{max_price:,}...")
                else:
                    # Maximum price only
                    max_price = int(text.replace(',', '').replace('₦', ''))
                    filters = {'maxPrice': max_price}
                    user_states[user_id] = {'search_type': 'price', 'maxPrice': max_price, 'page': 0}
                    await bot.reply_to(message, f"🔍 Searching properties up to ₦{max_price:,}...")
                
                properties = await fetch_properties({**filters, 'limit': 20})
                if properties:
                    response_text = f"💰 **Properties in your price range**\n\nFound {len(properties)} properties:\n\n"
                    response_text += "Select a property to view details:"
                    keyboard = generate_properties_list_keyboard(properties, 0)
                    await bot.reply_to(message, response_text, reply_markup=keyboard, parse_mode='Markdown')
                else:
                    await bot.reply_to(
                        message,
                        "❌ No properties found in this price range. Try a different range or browse all properties.",
                        reply_markup=generate_back_keyboard(),
                        parse_mode='Markdown'
                    )
            except ValueError:
                await bot.reply_to(
                    message,
                    "❌ Invalid price format. Please send numbers only, like:\n`5000000-20000000`\nor\n`20000000`",
                    reply_markup=generate_back_keyboard(),
                    parse_mode='Markdown'
                )
        
        elif waiting_for == 'text_search':
            # Text search
            user_states[user_id] = {'search_type': 'text', 'search': text, 'page': 0}
            await bot.reply_to(message, f"🔍 Searching for '{text}'...")
            
            properties = await fetch_properties({'search': text, 'limit': 20})
            if properties:
                response_text = f"📝 **Search Results for '{text}'**\n\nFound {len(properties)} properties:\n\n"
                response_text += "Select a property to view details:"
                keyboard = generate_properties_list_keyboard(properties, 0)
                await bot.reply_to(message, response_text, reply_markup=keyboard, parse_mode='Markdown')
            else:
                await bot.reply_to(
                    message,
                    f"❌ No properties found matching '{text}'. Try different keywords or browse by location/type.",
                    reply_markup=generate_back_keyboard(),
                    parse_mode='Markdown'
                )
        
        # Clear waiting state
        if user_id in user_states:
            user_states[user_id].pop('waiting_for', None)
    
    except Exception as e:
        print(f"Error handling text message: {str(e)}")
        await bot.reply_to(message, "❌ An error occurred. Please try again or use /start to return to the main menu.")

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
            <head>
                <title>House Me Bot Status</title>
                <style>
                    body {{ font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }}
                    .container {{ background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
                    h1 {{ color: #667eea; }}
                    ul {{ list-style: none; padding: 0; }}
                    li {{ padding: 10px; margin: 5px 0; background: #f9f9f9; border-radius: 5px; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🏠 House Me Telegram Bot Status</h1>
                    <p>Real Estate Platform for Abuja Residents</p>
                    <ul>
                        {''.join(f'<li>{msg}</li>' for msg in status_message)}
                    </ul>
                    <p style="margin-top: 20px; color: #666;">
                        Bot is running and ready to serve users.
                    </p>
                </div>
            </body>
        </html>
        """
        
        self.wfile.write(status_html.encode())
