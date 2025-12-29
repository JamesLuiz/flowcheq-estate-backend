"""
Bot module initialization
Exports key components for use in serverless functions
"""
from bot import (
    bot,
    users_collection,
    db,
    init_db,
    BOT_TOKEN,
    MONGO_URI,
    API_BASE_URL
)

__all__ = [
    'bot',
    'users_collection',
    'db',
    'init_db',
    'BOT_TOKEN',
    'MONGO_URI',
    'API_BASE_URL'
]

