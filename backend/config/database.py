import os
import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DB_TYPE = os.getenv("DB_TYPE", "sqlite").strip().lower()

if DB_TYPE == "mysql":
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
                "port": DB_PORT
            }
            if use_ssl:
                connect_kwargs["ssl"] = ssl_context
                
            connection = pymysql.connect(**connect_kwargs)
            cursor = connection.cursor()
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`;")
            cursor.close()
            connection.close()
            print(f"MySQL Database '{DB_NAME}' verified/created successfully.")
        except Exception as e:
            print(f"Error checking/creating MySQL database '{DB_NAME}':", e)

    init_database()

    # Setup MySQL URL
    encoded_password = urllib.parse.quote_plus(DB_PASSWORD)
    DATABASE_URL = f"mysql+pymysql://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    
    engine_kwargs = {}
    if use_ssl:
        engine_kwargs["connect_args"] = {"ssl": ssl_context}
else:
    # Default to local SQLite
    DATABASE_URL = "sqlite:///./office.db"
    engine_kwargs = {
        "connect_args": {"check_same_thread": False}
    }
    print("Using local SQLite Database (office.db). Zero-configuration, works offline!")

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
