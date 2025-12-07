from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LoginRequest, UserResponse, UserCreate, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("/login", response_model=UserResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Login with user code (case-sensitive)."""
    user = db.query(User).filter(User.user_code == request.user_code).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)):
    """List all users"""
    return db.query(User).all()


@router.get("/workers", response_model=list[UserResponse])
def list_workers(db: Session = Depends(get_db)):
    """List all workers"""
    return db.query(User).filter(User.role == "worker").all()


@router.post("/workers", response_model=UserResponse)
def create_worker(worker: UserCreate, db: Session = Depends(get_db)):
    """Create a new worker (admin only)"""
    # Check if user_code already exists (case-sensitive)
    existing = db.query(User).filter(User.user_code == worker.user_code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Kod użytkownika już istnieje")
    
    db_worker = User(
        first_name=worker.first_name,
        last_name=worker.last_name,
        user_code=worker.user_code,
        role="worker"
    )
    db.add(db_worker)
    db.commit()
    db.refresh(db_worker)
    return db_worker


@router.put("/workers/{worker_id}", response_model=UserResponse)
def update_worker(worker_id: int, worker: UserUpdate, db: Session = Depends(get_db)):
    """Update a worker (admin only)"""
    db_worker = db.query(User).filter(User.id == worker_id, User.role == "worker").first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Pracownik nie znaleziony")
    
    if worker.user_code:
        # Check if new user_code conflicts with another user (case-sensitive)
        existing = db.query(User).filter(
            User.user_code == worker.user_code,
            User.id != worker_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Kod użytkownika już istnieje")
        db_worker.user_code = worker.user_code
    
    if worker.first_name is not None:
        db_worker.first_name = worker.first_name
    if worker.last_name is not None:
        db_worker.last_name = worker.last_name
    
    db.commit()
    db.refresh(db_worker)
    return db_worker


@router.delete("/workers/{worker_id}")
def delete_worker(worker_id: int, db: Session = Depends(get_db)):
    """Delete a worker (admin only)"""
    db_worker = db.query(User).filter(User.id == worker_id, User.role == "worker").first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Pracownik nie znaleziony")
    
    # Check if worker has production entries
    if db_worker.production_entries:
        raise HTTPException(
            status_code=400, 
            detail="Nie można usunąć pracownika z istniejącymi wpisami produkcji"
        )
    
    db.delete(db_worker)
    db.commit()
    return {"message": "Pracownik usunięty"}
