from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import UserResponse, LoginRequest

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("/login", response_model=UserResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Login by user code - returns user info including role"""
    user = db.query(User).filter(User.user_code == request.user_code).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)):
    """List all users (for admin dashboard)"""
    return db.query(User).all()


@router.get("/workers", response_model=list[UserResponse])
def list_workers(db: Session = Depends(get_db)):
    """List only workers"""
    return db.query(User).filter(User.role == "worker").all()
