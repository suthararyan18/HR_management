import os
import jwt
import bcrypt
from datetime import datetime, timedelta
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "super_secret_office_key_123")
JWT_ALGORITHM = "HS256"

def hash_password(password: str) -> str:
    # Hash password using native bcrypt library
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Verify password using native bcrypt library
    try:
        pwd_bytes = plain_password.encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False

def generate_token(user_id: int) -> str:
    # 30 days expiration to match the Node.js implementation
    expire = datetime.utcnow() + timedelta(days=30)
    payload = {
        "id": user_id,
        "exp": expire
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> Optional[int]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("id")
    except jwt.PyJWTError:
        return None
