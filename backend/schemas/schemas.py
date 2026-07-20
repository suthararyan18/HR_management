from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import date, datetime

# User schemas
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    department: Optional[str] = "General"
    designation: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    department: Optional[str]
    designation: Optional[str]

    class Config:
        from_attributes = True

# Attendance schemas
class AttendanceCheckIn(BaseModel):
    notes: Optional[str] = ""

class AttendanceManual(BaseModel):
    userId: int
    date: date
    status: str
    checkIn: Optional[datetime] = None
    checkOut: Optional[datetime] = None
    notes: Optional[str] = None

# Leave schemas
class LeaveApply(BaseModel):
    startDate: date
    endDate: date
    type: str
    reason: str

class LeaveAction(BaseModel):
    requestId: int
    status: str
    hrNotes: Optional[str] = ""
