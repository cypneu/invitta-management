from enum import Enum as PyEnum

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Date,
    ForeignKey,
    CheckConstraint,
    UniqueConstraint,
    JSON,
    Enum,
    BigInteger,
    Float,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class ShapeType(str, PyEnum):
    rectangular = "rectangular"
    round = "round"
    oval = "oval"


class ActionType(str, PyEnum):
    cutting = "cutting"
    sewing = "sewing"
    ironing = "ironing"
    packing = "packing"


class EdgeType(str, PyEnum):
    U3 = "U3"
    U4 = "U4"
    U5 = "U5"
    O1 = "O1"
    O3 = "O3"
    O5 = "O5"
    OGK = "OGK"
    LA = "LA"


class OrderStatus(str, PyEnum):
    fetched = "fetched"
    in_progress = "in_progress"
    done = "done"
    cancelled = "cancelled"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    role = Column(String(20), nullable=False, default="worker")
    allowed_action_types = Column(JSON, nullable=False, default=list)

    __table_args__ = (
        CheckConstraint(role.in_(["admin", "worker"]), name="valid_role"),
    )

    actions = relationship("OrderPositionAction", back_populates="actor")
    action_assignments = relationship("OrderPositionActionWorker", back_populates="user")

    @property
    def name(self) -> str:
        """Full name for display."""
        return f"{self.first_name} {self.last_name}"


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String(512), unique=True, nullable=False, index=True)
    fabric = Column(String(255), nullable=False)
    pattern = Column(String(512), nullable=False)
    shape = Column(Enum(ShapeType), nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    diameter = Column(Integer, nullable=True)
    edge_type = Column(Enum(EdgeType), nullable=True, index=True)

    __table_args__ = (
        CheckConstraint("width IS NULL OR width > 0", name="chk_positive_width"),
        CheckConstraint("height IS NULL OR height > 0", name="chk_positive_height"),
        CheckConstraint("diameter IS NULL OR diameter > 0", name="chk_positive_diameter"),
    )

    order_positions = relationship("OrderPosition", back_populates="product")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    baselinker_id = Column(BigInteger, unique=True, nullable=True, index=True)
    integration = Column(String(50), nullable=True, index=True)
    external_id = Column(String(100), nullable=True, index=True)
    source = Column(String(50), nullable=True)
    expected_shipment_date = Column(Date, nullable=True, index=True)
    fullname = Column(String(200), nullable=True)
    company = Column(String(200), nullable=True)
    status = Column(Enum(OrderStatus), nullable=False, default=OrderStatus.in_progress, index=True)

    __table_args__ = (
        UniqueConstraint("integration", "external_id", name="uq_orders_integration_external_id"),
    )

    positions = relationship("OrderPosition", back_populates="order", cascade="all, delete-orphan")


class OrderPosition(Base):
    __tablename__ = "order_positions"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint("order_id", "product_id", name="uq_order_product"),
        CheckConstraint("quantity > 0", name="chk_positive_quantity"),
    )

    order = relationship("Order", back_populates="positions")
    product = relationship("Product", back_populates="order_positions")
    actions = relationship("OrderPositionAction", back_populates="order_position", cascade="all, delete-orphan")


class OrderPositionAction(Base):
    __tablename__ = "order_position_actions"

    id = Column(Integer, primary_key=True, index=True)
    order_position_id = Column(
        Integer, ForeignKey("order_positions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action_type = Column(Enum(ActionType), nullable=False)
    quantity = Column(Integer, nullable=False)
    cost = Column(Float, nullable=True)  # Snapshot of calculated cost at time of action
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    timestamp = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_action_positive_quantity"),
    )

    order_position = relationship("OrderPosition", back_populates="actions")
    actor = relationship("User", back_populates="actions")
    worker_assignments = relationship(
        "OrderPositionActionWorker",
        back_populates="action",
        cascade="all, delete-orphan",
    )


class OrderPositionActionWorker(Base):
    __tablename__ = "order_position_action_workers"

    action_id = Column(
        Integer,
        ForeignKey("order_position_actions.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        primary_key=True,
        nullable=False,
        index=True,
    )

    action = relationship("OrderPositionAction", back_populates="worker_assignments")
    user = relationship("User", back_populates="action_assignments")


class SyncState(Base):
    __tablename__ = "sync_state"

    id = Column(Integer, primary_key=True, index=True)
    integration = Column(String(50), unique=True, nullable=False)
    last_sync_timestamp = Column(BigInteger, nullable=False, default=0)
    shipment_date_field_id = Column(Integer, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class CostConfig(Base):
    __tablename__ = "cost_config"

    id = Column(Integer, primary_key=True, index=True)

    lag_factor = Column(Float, nullable=False, default=0.35)
    cutting_factor = Column(Float, nullable=False, default=1.86)
    ironing_factor = Column(Float, nullable=False, default=0.65)
    prepacking_factor = Column(Float, nullable=False, default=0.3539)
    packing_factor = Column(Float, nullable=False, default=0.2045)
    depreciation_factor = Column(Float, nullable=False, default=0.062)
    packaging_materials_price = Column(Float, nullable=False, default=3.2)

    corner_sewing_factors = Column(JSON, nullable=False, default=dict)
    sewing_factors = Column(JSON, nullable=False, default=dict)

    material_waste = Column(JSON, nullable=False, default=dict)

    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
