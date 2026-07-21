import os
from pathlib import Path
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from dotenv import load_dotenv

# Initialize DB first (auto-created if not exists)
from backend.config.database import engine, Base, get_db

# Import models to ensure they register on Base metadata
from backend.models.user import User
from backend.models.attendance import Attendance
from backend.models.leave_request import LeaveRequest
from backend.models.app_setting import AppSetting

# Create tables if they do not exist
try:
    Base.metadata.create_all(bind=engine)
    print("Database synced & tables verified successfully in Python.")
except Exception as error:
    print("Error syncing database schema:", error)

# Import routes
from backend.routes.auth import router as auth_router
from backend.routes.attendance import router as attendance_router
from backend.routes.hr import router as router_hr
from backend.routes.leaves import router as leaves_router

load_dotenv(Path(__file__).resolve().parent / ".env")

app = FastAPI(
    title="OmniStaff - Office Management API",
    description="Python FastAPI backend for Office & Attendance management system",
    version="1.0.0",
)

# CORS Middleware (matching node's cors())
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Root route - Serve frontend index page
@app.get("/")
async def root():
    return RedirectResponse(url="/index.html")


# Public configuration endpoint to fetch dynamic web app branding
@app.get("/api/config")
async def get_config(db: Session = Depends(get_db)):
    setting = db.query(AppSetting).filter(AppSetting.key == "appName").first()
    app_name = setting.value if setting else "OmniStaff"

    # Check if at least one HR account exists
    has_hr = db.query(User).filter(User.role == "hr").first() is not None

    return {"success": True, "appName": app_name, "hasHR": has_hr}


# Mount Routes under /api prefix
app.include_router(auth_router, prefix="/api")
app.include_router(attendance_router, prefix="/api")
app.include_router(router_hr, prefix="/api")
app.include_router(leaves_router, prefix="/api")

# Serve frontend static files
FRONTEND_DIR = Path(__file__).resolve().parents[1] / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


# Simple Health Route
@app.get("/api/health")
async def health_check():
    return {"success": True, "message": "Office Management API is running smooth."}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 5000))
    print(f"Starting Python server on port {port}...")
    uvicorn.run("backend.server:app", host="0.0.0.0", port=port, reload=True)
