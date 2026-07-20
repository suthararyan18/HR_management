import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from backend.config.database import get_db
from backend.models.user import User
from backend.models.attendance import Attendance
from backend.models.app_setting import AppSetting
from backend.schemas.schemas import UserRegister, AttendanceManual
from backend.middleware.auth import protect, authorize
from backend.utils.security import hash_password

router = APIRouter(prefix="/hr", tags=["HR Operations"])

# Helper to get today's date
def get_today_date():
    return datetime.date.today()

@router.get("/analytics")
async def get_dashboard_analytics(
    current_user: User = Depends(authorize("hr")),
    db: Session = Depends(get_db)
):
    today_date = get_today_date()
    
    # 1. Total Employees (active only)
    total_employees = db.query(User).filter(
        User.role == "employee",
        User.isActive == True
    ).count()
    
    # 2. Today's Attendance logs (joined with User)
    today_logs = db.query(Attendance).options(
        joinedload(Attendance.user)
    ).filter(
        Attendance.date == today_date
    ).order_by(
        Attendance.checkIn.desc()
    ).all()
    
    # 3. Count categories
    present_today = len(today_logs)
    late_today = sum(1 for log in today_logs if log.status == "Late")
    absent_today = max(0, total_employees - present_today)
    
    # Format the activity logs matching the Node.js payload
    recent_activity = []
    for log in today_logs:
        recent_activity.append({
            "id": log.id,
            "userId": log.userId,
            "date": log.date,
            "checkIn": log.checkIn,
            "checkOut": log.checkOut,
            "status": log.status,
            "checkInIp": log.checkInIp,
            "notes": log.notes,
            "breakStart": log.breakStart,
            "totalBreakTime": log.totalBreakTime,
            "createdAt": log.createdAt,
            "updatedAt": log.updatedAt,
            "User": {
                "name": log.user.name if log.user else "Unknown",
                "department": log.user.department if log.user else "-",
                "designation": log.user.designation if log.user else "Staff Member"
            }
        })
        
    return {
        "success": True,
        "stats": {
            "totalEmployees": total_employees,
            "presentToday": present_today,
            "lateToday": late_today,
            "absentToday": absent_today
        },
        "recentActivity": recent_activity
    }

@router.get("/employees")
async def get_all_employees(
    current_user: User = Depends(authorize("hr")),
    db: Session = Depends(get_db)
):
    employees = db.query(User).filter(
        User.role == "employee"
    ).order_by(
        User.name.asc()
    ).all()
    
    # Format list
    formatted_employees = []
    for emp in employees:
        formatted_employees.append({
            "id": emp.id,
            "name": emp.name,
            "email": emp.email,
            "role": emp.role,
            "department": emp.department,
            "designation": emp.designation,
            "joinedDate": emp.joinedDate,
            "isActive": emp.isActive
        })
        
    return {
        "success": True,
        "employees": formatted_employees
    }

@router.post("/employees", status_code=status.HTTP_201_CREATED)
async def add_employee(
    payload: UserRegister,
    current_user: User = Depends(authorize("hr")),
    db: Session = Depends(get_db)
):
    if not payload.name or not payload.email or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "Name, email and password are required"}
        )
        
    # Check if exists
    exists = db.query(User).filter(User.email == payload.email).first()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "User with this email already exists"}
        )
        
    hashed_pwd = hash_password(payload.password)
    
    employee = User(
        name=payload.name,
        email=payload.email,
        password=hashed_pwd,
        role="employee",
        department=payload.department or "General",
        designation=payload.designation or "Staff Member"
    )
    
    db.add(employee)
    db.commit()
    db.refresh(employee)
    
    return {
        "success": True,
        "message": "Employee registered successfully",
        "employee": {
            "id": employee.id,
            "name": employee.name,
            "email": employee.email,
            "department": employee.department,
            "designation": employee.designation
        }
    }

@router.get("/reports")
async def get_monthly_reports(
    current_user: User = Depends(authorize("hr")),
    db: Session = Depends(get_db)
):
    # Get current month bounds
    now = datetime.datetime.now()
    start_of_month = datetime.date(now.year, now.month, 1)
    if now.month == 12:
        end_of_month = datetime.date(now.year, 12, 31)
    else:
        end_of_month = datetime.date(now.year, now.month + 1, 1) - datetime.timedelta(days=1)
        
    logs = db.query(Attendance).options(
        joinedload(Attendance.user)
    ).filter(
        Attendance.date.between(start_of_month, end_of_month)
    ).order_by(
        Attendance.date.asc()
    ).all()
    
    # Format matching expected structure
    formatted_logs = []
    for log in logs:
        formatted_logs.append({
            "id": log.id,
            "userId": log.userId,
            "date": log.date,
            "checkIn": log.checkIn,
            "checkOut": log.checkOut,
            "status": log.status,
            "notes": log.notes,
            "totalBreakTime": log.totalBreakTime,
            "User": {
                "id": log.user.id if log.user else None,
                "name": log.user.name if log.user else "Unknown",
                "department": log.user.department if log.user else "General"
            }
        })
        
    return {
        "success": True,
        "logs": formatted_logs
    }

@router.post("/attendance/manual")
async def manual_attendance(
    payload: AttendanceManual,
    current_user: User = Depends(authorize("hr")),
    db: Session = Depends(get_db)
):
    # Check if record exists
    record = db.query(Attendance).filter(
        Attendance.userId == payload.userId,
        Attendance.date == payload.date
    ).first()
    
    if record:
        # Update
        if payload.checkIn is not None:
            record.checkIn = payload.checkIn
        if payload.checkOut is not None:
            record.checkOut = payload.checkOut
        record.status = payload.status
        if payload.notes is not None:
            record.notes = payload.notes
        db.commit()
        db.refresh(record)
    else:
        # Create
        record = Attendance(
            userId=payload.userId,
            date=payload.date,
            checkIn=payload.checkIn,
            checkOut=payload.checkOut,
            status=payload.status,
            checkInIp="Manual override",
            notes=payload.notes or "Set by HR Manager"
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        
    return {
        "success": True,
        "message": "Attendance record updated successfully",
        "record": record
    }

@router.put("/employees/{emp_id}/toggle-status")
async def toggle_employee_status(
    emp_id: int,
    current_user: User = Depends(authorize("hr")),
    db: Session = Depends(get_db)
):
    employee = db.query(User).filter(
        User.id == emp_id,
        User.role == "employee"
    ).first()
    
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "message": "Employee not found"}
        )
        
    employee.isActive = not employee.isActive
    db.commit()
    db.refresh(employee)
    
    status_str = "Reactivated" if employee.isActive else "Deactivated"
    
    return {
        "success": True,
        "message": f"Employee account has been {status_str}",
        "isActive": employee.isActive
    }

class AppSettingsUpdate(BaseModel):
    appName: str

@router.put("/settings")
async def update_app_settings(
    payload: AppSettingsUpdate,
    current_user: User = Depends(authorize("hr")),
    db: Session = Depends(get_db)
):
    if not payload.appName or not payload.appName.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "App Name cannot be empty"}
        )
        
    setting = db.query(AppSetting).filter(AppSetting.key == "appName").first()
    if setting:
        setting.value = payload.appName.strip()
    else:
        setting = AppSetting(key="appName", value=payload.appName.strip())
        db.add(setting)
        
    db.commit()
    db.refresh(setting)
    return {
        "success": True, 
        "message": "App settings updated successfully", 
        "appName": setting.value
    }

