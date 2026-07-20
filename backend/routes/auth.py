from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.config.database import get_db
from backend.models.user import User
from backend.schemas.schemas import UserRegister, UserLogin, UserUpdate
from backend.middleware.auth import protect
from backend.utils.security import hash_password, verify_password, generate_token

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: Session = Depends(get_db)):
    # Validate payload details
    if not payload.name or not payload.email or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "Please provide name, email and password"}
        )
    
    # Check if user exists
    user_exists = db.query(User).filter(User.email == payload.email).first()
    if user_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "User already exists"}
        )
    
    # Check total users count. If 0, make first user HR
    total_users = db.query(User).count()
    role = "hr" if total_users == 0 else "employee"
    
    # Hash password
    hashed_pwd = hash_password(payload.password)
    
    # Set default designation
    designation = payload.designation
    if not designation:
        designation = "HR Manager" if role == "hr" else "Staff Member"
        
    # Create new user
    new_user = User(
        name=payload.name,
        email=payload.email,
        password=hashed_pwd,
        role=role,
        department=payload.department or "General",
        designation=designation
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    token = generate_token(new_user.id)
    
    return {
        "success": True,
        "token": token,
        "user": {
            "id": new_user.id,
            "name": new_user.name,
            "email": new_user.email,
            "role": new_user.role,
            "department": new_user.department,
            "designation": new_user.designation
        }
    }

@router.post("/login")
async def login(payload: UserLogin, db: Session = Depends(get_db)):
    if not payload.email or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "Please provide email and password"}
        )
        
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"success": False, "message": "Invalid credentials"}
        )
        
    # Check if deactivated
    if not user.isActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"success": False, "message": "Account deactivated. Please contact HR."}
        )
        
    # Verify password
    if not verify_password(payload.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"success": False, "message": "Invalid credentials"}
        )
        
    token = generate_token(user.id)
    
    return {
        "success": True,
        "token": token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "department": user.department,
            "designation": user.designation
        }
    }

@router.get("/me")
async def get_me(current_user: User = Depends(protect)):
    return {
        "success": True,
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "email": current_user.email,
            "role": current_user.role,
            "department": current_user.department,
            "designation": current_user.designation,
            "joinedDate": current_user.joinedDate,
            "isActive": current_user.isActive,
            "createdAt": current_user.createdAt,
            "updatedAt": current_user.updatedAt
        }
    }

@router.put("/update")
async def update_profile(payload: UserUpdate, current_user: User = Depends(protect), db: Session = Depends(get_db)):
    # Check if changing email and if email is already in use
    if payload.email and payload.email != current_user.email:
        email_exists = db.query(User).filter(User.email == payload.email).first()
        if email_exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"success": False, "message": "Email address already in use"}
            )
        current_user.email = payload.email
        
    if payload.name:
        current_user.name = payload.name
    if payload.department:
        current_user.department = payload.department
    if payload.designation:
        current_user.designation = payload.designation
        
    if payload.password:
        current_user.password = hash_password(payload.password)
        
    db.commit()
    db.refresh(current_user)
    
    return {
        "success": True,
        "message": "Profile updated successfully",
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "email": current_user.email,
            "role": current_user.role,
            "department": current_user.department,
            "designation": current_user.designation
        }
    }
