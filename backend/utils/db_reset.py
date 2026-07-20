import os
import sys

# Add root folder to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.config.database import engine, Base
from backend.models.user import User
from backend.models.attendance import Attendance
from backend.models.leave_request import LeaveRequest
from backend.models.app_setting import AppSetting

def reset_database():
    print("=========================================")
    print("      OmniStaff - Resetting Database")
    print("=========================================")
    try:
        # Drop all tables
        Base.metadata.drop_all(bind=engine)
        print("Dropped all existing tables.")
        
        # Recreate all tables
        Base.metadata.create_all(bind=engine)
        print("Recreated all tables successfully (empty).")
        print("\nDatabase is now clean and ready for a fresh start!")
    except Exception as e:
        print("\n[ERROR] Failed to reset database:", e)

if __name__ == "__main__":
    reset_database()
