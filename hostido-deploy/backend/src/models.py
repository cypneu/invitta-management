from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, CheckConstraint, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    user_code = Column(String(20), unique=True, nullable=False, index=True)
    role = Column(String(20), nullable=False)
    
    __table_args__ = (
        CheckConstraint(role.in_(["admin", "worker"]), name="valid_role"),
    )
    
    production_entries = relationship("ProductionEntry", back_populates="worker")
    
    @property
    def name(self) -> str:
        """Full name for display."""
        return f"{self.first_name} {self.last_name}"


class ProductionEntry(Base):
    __tablename__ = "production_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    product_type = Column(String(50), nullable=False)
    width_cm = Column(Integer, nullable=False)
    height_cm = Column(Integer, nullable=False)
    quantity = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    
    worker = relationship("User", back_populates="production_entries")


class CostConfig(Base):
    __tablename__ = "cost_config"
    
    id = Column(Integer, primary_key=True, index=True)
    corner_sewing_factors = Column(JSON, nullable=False)
    sewing_factors = Column(JSON, nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
