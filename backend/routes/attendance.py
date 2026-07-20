import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from backend.config.database import get_db
from backend.models.attendance import Attendance
from backend.models.user import User
from backend.schemas.schemas import AttendanceCheckIn
from backend.middleware.auth import protect

router = APIRouter(prefix="/attendance", tags=["Attendance"])

# Helper to get today's date
def get_today_date():
    return datetime.date.today()

@router.get("/status")
async def get_attendance_status(current_user: User = Depends(protect), db: Session = Depends(get_db)):
    today_date = get_today_date()
    
    record = db.query(Attendance).filter(
        Attendance.userId == current_user.id,
        Attendance.date == today_date
    ).first()
    
    return {
        "success": True,
        "hasCheckedIn": record is not None,
        "hasCheckedOut": record.checkOut is not None if record else False,
        "record": record
    }

@router.post("/check-in")
async def check_in(payload: AttendanceCheckIn, request: Request, current_user: User = Depends(protect), db: Session = Depends(get_db)):
    today_date = get_today_date()
    
    # Check if already checked in
    existing = db.query(Attendance).filter(
        Attendance.userId == current_user.id,
        Attendance.date == today_date
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "Already checked in for today"}
        )
        
    check_in_time = datetime.datetime.now()
    
    # Determine status (Late if after 9:00 AM)
    attendance_status = "Present"
    limit_hour = 9
    if check_in_time.hour > limit_hour or (check_in_time.hour == limit_hour and check_in_time.minute > 0):
        attendance_status = "Late"
        
    # Get Client IP
    ip = request.headers.get("x-forwarded-for")
    if not ip and request.client:
        ip = request.client.host
    if not ip:
        ip = "127.0.0.1"
        
    # Create Attendance log
    record = Attendance(
        userId=current_user.id,
        date=today_date,
        checkIn=check_in_time,
        status=attendance_status,
        checkInIp=ip,
        notes=payload.notes or "",
    )
    
    db.add(record)
    db.commit()
    db.refresh(record)
    
    return {
        "success": True,
        "message": f"Checked in successfully as {attendance_status}",
        "record": record
    }

@router.post("/check-out")
async def check_out(current_user: User = Depends(protect), db: Session = Depends(get_db)):
    today_date = get_today_date()
    
    # Find record
    record = db.query(Attendance).filter(
        Attendance.userId == current_user.id,
        Attendance.date == today_date
    ).first()
    
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "You must check-in first before checking-out"}
        )
        
    if record.checkOut:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "Already checked out for today"}
        )
        
    record.checkOut = datetime.datetime.now()
    db.commit()
    db.refresh(record)
    
    return {
        "success": True,
        "message": "Checked out successfully",
        "record": record
    }

@router.post("/break/start")
async def start_break(current_user: User = Depends(protect), db: Session = Depends(get_db)):
    today_date = get_today_date()
    
    record = db.query(Attendance).filter(
        Attendance.userId == current_user.id,
        Attendance.date == today_date
    ).first()
    
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "You must check-in first before starting a break"}
        )
        
    if record.checkOut:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "Cannot start a break after check-out"}
        )
        
    if record.breakStart:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "You are already on a break"}
        )
        
    record.breakStart = datetime.datetime.now()
    db.commit()
    db.refresh(record)
    
    return {
        "success": True,
        "message": "Break started successfully",
        "record": record
    }

@router.post("/break/end")
async def end_break(current_user: User = Depends(protect), db: Session = Depends(get_db)):
    today_date = get_today_date()
    
    record = db.query(Attendance).filter(
        Attendance.userId == current_user.id,
        Attendance.date == today_date
    ).first()
    
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "No attendance log found for today"}
        )
        
    if not record.breakStart:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "You are not currently on a break"}
        )
        
    break_end = datetime.datetime.now()
    break_start = record.breakStart
    
    duration_seconds = int((break_end - break_start).total_seconds())
    
    record.totalBreakTime = (record.totalBreakTime or 0) + duration_seconds
    record.breakStart = None
    
    db.commit()
    db.refresh(record)
    
    return {
        "success": True,
        "message": f"Break ended successfully. Duration: {duration_seconds // 60}m {duration_seconds % 60}s",
        "record": record
    }

@router.get("/history")
async def get_history(current_user: User = Depends(protect), db: Session = Depends(get_db)):
    history = db.query(Attendance).filter(
        Attendance.userId == current_user.id
    ).order_by(Attendance.date.desc()).limit(30).all()
    
    return {
        "success": True,
        "history": history
    }
