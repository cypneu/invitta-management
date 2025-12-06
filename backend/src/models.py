from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    user_code = Column(String(20), unique=True, nullable=False, index=True)
    role = Column(String(20), nullable=False)
    
    __table_args__ = (
        CheckConstraint(role.in_(["admin", "worker"]), name="valid_role"),
    )
    
    production_entries = relationship("ProductionEntry", back_populates="worker")


class ProductionEntry(Base):
    __tablename__ = "production_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    product_type = Column(String(50), nullable=False)
    product_size = Column(String(20), nullable=False)
    quantity = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    
    worker = relationship("User", back_populates="production_entries")
