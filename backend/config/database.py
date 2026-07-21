import os
import urllib.parse
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

# Load environment variables from the backend folder regardless of the current working directory
BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

DB_TYPE = os.getenv("DB_TYPE", "mysql").strip().lower()

if DB_TYPE not in {"mysql", "mariadb"}:
    raise RuntimeError(
        "This backend is configured for MySQL/MariaDB only. Set DB_TYPE=mysql in backend/.env."
    )

import pymysql
import ssl

DB_HOST = os.getenv("DB_HOST", "localhost").strip()
DB_USER = os.getenv("DB_USER", "root").strip()
DB_PASSWORD = os.getenv("DB_PASSWORD", "").strip()
DB_NAME = os.getenv("DB_NAME", "office_management").strip()
DB_PORT = int(os.getenv("DB_PORT", "3306").strip())

# Determine if we should use SSL (recommended for cloud databases like TiDB)
use_ssl = DB_HOST not in ["localhost", "127.0.0.1"]

# Build SSL Context if connecting to cloud to prevent certificate verify issues
ssl_context = None
if use_ssl:
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE


# Initialize and create DB if not exists
def init_database():
    try:
        connect_kwargs = {
            "host": DB_HOST,
            "user": DB_USER,
            "password": DB_PASSWORD,
            "port": DB_PORT,
        }
        if use_ssl:
            connect_kwargs["ssl"] = ssl_context

        connection = pymysql.connect(**connect_kwargs)
        cursor = connection.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`;")
        cursor.close()
        connection.close()
        print(f"Using MySQL database '{DB_NAME}' on {DB_HOST}:{DB_PORT}.")
    except Exception as e:
        print(f"Error checking/creating MySQL database '{DB_NAME}':", e)
        raise


init_database()

# Setup MySQL URL
encoded_password = urllib.parse.quote_plus(DB_PASSWORD)
DATABASE_URL = f"mysql+pymysql://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"

engine_kwargs = {"pool_pre_ping": True}
if use_ssl:
    engine_kwargs["connect_args"] = {"ssl": ssl_context}

engine = create_engine(DATABASE_URL, echo=False, **engine_kwargs)

# Session local class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative Base
Base = declarative_base()


# Dependency to get db session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
