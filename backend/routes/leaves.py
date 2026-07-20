from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from backend.config.database import get_db
from backend.models.leave_request import LeaveRequest
from backend.models.user import User
from backend.schemas.schemas import LeaveApply, LeaveAction
from backend.middleware.auth import protect, authorize

router = APIRouter(prefix="/leaves", tags=["Leave Management"])

@router.post("/apply", status_code=status.HTTP_201_CREATED)
async def apply_leave(
    payload: LeaveApply,
    current_user: User = Depends(protect),
    db: Session = Depends(get_db)
):
    if not payload.startDate or not payload.endDate or not payload.type or not payload.reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "Please provide start date, end date, leave type and reason"}
        )
        
    leave = LeaveRequest(
        userId=current_user.id,
        startDate=payload.startDate,
        endDate=payload.endDate,
        type=payload.type,
        reason=payload.reason,
        status="Pending"
    )
    
    db.add(leave)
    db.commit()
    db.refresh(leave)
    
    return {
        "success": True,
        "message": "Leave application submitted successfully",
        "leave": leave
    }

@router.get("/my-requests")
async def get_my_leaves(
    current_user: User = Depends(protect),
    db: Session = Depends(get_db)
):
    requests = db.query(LeaveRequest).filter(
        LeaveRequest.userId == current_user.id
    ).order_by(
        LeaveRequest.createdAt.desc()
    ).all()
    
    return {
        "success": True,
        "requests": requests
    }

@router.get("/admin/all")
async def get_all_leaves(
    current_user: User = Depends(authorize("hr")),
    db: Session = Depends(get_db)
):
    requests = db.query(LeaveRequest).options(
        joinedload(LeaveRequest.user)
    ).order_by(
        LeaveRequest.createdAt.desc()
    ).all()
    
    # Format matching the Node.js JSON output
    formatted_requests = []
    for req in requests:
        formatted_requests.append({
            "id": req.id,
            "userId": req.userId,
            "startDate": req.startDate,
            "endDate": req.endDate,
            "type": req.type,
            "reason": req.reason,
            "status": req.status,
            "hrNotes": req.hrNotes,
            "createdAt": req.createdAt,
            "updatedAt": req.updatedAt,
            "User": {
                "id": req.user.id if req.user else None,
                "name": req.user.name if req.user else "Unknown",
                "department": req.user.department if req.user else "General",
                "designation": req.user.designation if req.user else "Staff Member"
            }
        })
        
    return {
        "success": True,
        "requests": formatted_requests
    }

@router.post("/admin/action")
async def take_leave_action(
    payload: LeaveAction,
    current_user: User = Depends(authorize("hr")),
    db: Session = Depends(get_db)
):
    if not payload.requestId or not payload.status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "Request ID and status action are required"}
        )
        
    if payload.status not in ["Approved", "Rejected"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "message": "Invalid status. Choose Approved or Rejected"}
        )
        
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == payload.requestId).first()
    if not leave:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "message": "Leave request not found"}
        )
        
    leave.status = payload.status
    leave.hrNotes = payload.hrNotes or ""
    db.commit()
    db.refresh(leave)
    
    return {
        "success": True,
        "message": f"Leave request has been {payload.status.lower()}",
        "leave": leave
    }
