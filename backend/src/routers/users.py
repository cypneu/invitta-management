"""Users router - User management and authentication."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, ActionType
from ..schemas import LoginRequest, UserResponse, UserCreate, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


def require_admin(user_id: int, db: Session) -> User:
    """Verify user is an admin."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def get_current_user(
    user_id: int = Query(..., description="ID of the authenticated user"),
    db: Session = Depends(get_db),
) -> User:
    """Get the current user from user_id query parameter.
    
    This is a simple auth dependency - in production you'd use JWT tokens.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/login", response_model=UserResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Login with user code (case-sensitive)."""
    user = db.query(User).filter(User.code == request.code).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)):
    """List all users."""
    return db.query(User).all()


@router.get("/workers", response_model=list[UserResponse])
def list_workers(db: Session = Depends(get_db)):
    """List all workers."""
    return db.query(User).filter(User.role == "worker").all()


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    """Get a single user by ID."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/workers", response_model=UserResponse)
def create_worker(
    worker: UserCreate,
    user_id: int = Query(..., description="ID of the admin creating the worker"),
    db: Session = Depends(get_db),
):
    """Create a new worker (admin only)."""
    require_admin(user_id, db)

    # Check if code already exists (case-sensitive)
    existing = db.query(User).filter(User.code == worker.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Kod użytkownika już istnieje")

    # Validate action types
    allowed_types = []
    for at in worker.allowed_action_types:
        try:
            if isinstance(at, str):
                allowed_types.append(ActionType(at).value)
            else:
                allowed_types.append(at.value)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid action type: {at}")

    db_worker = User(
        first_name=worker.first_name,
        last_name=worker.last_name,
        code=worker.code,
        role="worker",
        allowed_action_types=allowed_types,
    )
    db.add(db_worker)
    db.commit()
    db.refresh(db_worker)
    return db_worker


@router.put("/workers/{worker_id}", response_model=UserResponse)
def update_worker(
    worker_id: int,
    worker: UserUpdate,
    user_id: int = Query(..., description="ID of the admin updating the worker"),
    db: Session = Depends(get_db),
):
    """Update a worker (admin only)."""
    require_admin(user_id, db)

    db_worker = db.query(User).filter(User.id == worker_id, User.role == "worker").first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Pracownik nie znaleziony")

    if worker.code:
        # Check if new code conflicts with another user (case-sensitive)
        existing = db.query(User).filter(User.code == worker.code, User.id != worker_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Kod użytkownika już istnieje")
        db_worker.code = worker.code

    if worker.first_name is not None:
        db_worker.first_name = worker.first_name
    if worker.last_name is not None:
        db_worker.last_name = worker.last_name

    if worker.allowed_action_types is not None:
        # Validate and convert action types
        allowed_types = []
        for at in worker.allowed_action_types:
            try:
                if isinstance(at, str):
                    allowed_types.append(ActionType(at).value)
                else:
                    allowed_types.append(at.value)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid action type: {at}")
        db_worker.allowed_action_types = allowed_types

    db.commit()
    db.refresh(db_worker)
    return db_worker


@router.delete("/workers/{worker_id}")
def delete_worker(
    worker_id: int,
    user_id: int = Query(..., description="ID of the admin deleting the worker"),
    db: Session = Depends(get_db),
):
    """Delete a worker (admin only)."""
    require_admin(user_id, db)

    db_worker = db.query(User).filter(User.id == worker_id, User.role == "worker").first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Pracownik nie znaleziony")

    # Check if worker has actions
    if db_worker.actions:
        raise HTTPException(
            status_code=400,
            detail="Nie można usunąć pracownika z istniejącymi akcjami produkcji",
        )

    db.delete(db_worker)
    db.commit()
    return {"message": "Pracownik usunięty"}
