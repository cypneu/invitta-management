from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, CheckConstraint, Float
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
    product_type = Column(String(50), nullable=False)  # TableclothFinish value
    width_cm = Column(Integer, nullable=False)  # Width in cm (10-2000)
    height_cm = Column(Integer, nullable=False)  # Height in cm (10-2000)
    quantity = Column(Integer, nullable=False)
    production_cost = Column(Float, nullable=False)  # Calculated cost per unit
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    
    worker = relationship("User", back_populates="production_entries")
