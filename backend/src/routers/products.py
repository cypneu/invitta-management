"""Products router - Product management with CRUD operations."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Product, ShapeType, User
from ..schemas import ProductResponse, ProductCreate, ProductUpdate
from .users import get_current_user

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("/", response_model=list[ProductResponse])
def list_products(
    fabric: Optional[str] = None,
    pattern: Optional[str] = None,
    shape: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List all products with optional filters."""
    query = db.query(Product)

    if fabric:
        query = query.filter(Product.fabric == fabric)
    if pattern:
        query = query.filter(Product.pattern == pattern)
    if shape:
        try:
            shape_enum = ShapeType(shape)
            query = query.filter(Product.shape == shape_enum)
        except ValueError:
            pass  # Invalid shape, ignore filter
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Product.sku.ilike(search_term))
            | (Product.fabric.ilike(search_term))
            | (Product.pattern.ilike(search_term))
        )

    return query.order_by(Product.sku).all()


@router.get("/shapes/", response_model=list[str])
def list_shapes():
    """Get available shape types."""
    return [s.value for s in ShapeType]


@router.get("/fabrics/", response_model=list[str])
def list_fabrics(db: Session = Depends(get_db)):
    """Get unique fabric values from existing products."""
    results = db.query(Product.fabric).distinct().order_by(Product.fabric).all()
    return [r[0] for r in results]


@router.get("/patterns/", response_model=list[str])
def list_patterns(db: Session = Depends(get_db)):
    """Get unique pattern values from existing products."""
    results = db.query(Product.pattern).distinct().order_by(Product.pattern).all()
    return [r[0] for r in results]


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db)):
    """Get a single product by ID."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/sku/{sku}", response_model=ProductResponse)
def get_product_by_sku(sku: str, db: Session = Depends(get_db)):
    """Get a single product by SKU."""
    product = db.query(Product).filter(Product.sku == sku).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


# Admin-only CRUD operations


@router.post("/", response_model=ProductResponse)
def create_product(
    product_data: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new product (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    # Check if SKU already exists
    existing = db.query(Product).filter(Product.sku == product_data.sku).first()
    if existing:
        raise HTTPException(status_code=400, detail="Product with this SKU already exists")

    product = Product(
        sku=product_data.sku,
        fabric=product_data.fabric,
        pattern=product_data.pattern,
        shape=product_data.shape,
        width=product_data.width,
        height=product_data.height,
        diameter=product_data.diameter,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    product_data: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing product (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Check if SKU already taken by another product
    if product_data.sku and product_data.sku != product.sku:
        existing = db.query(Product).filter(Product.sku == product_data.sku).first()
        if existing:
            raise HTTPException(status_code=400, detail="Product with this SKU already exists")

    # Update fields that are provided
    update_data = product_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a product (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Check if product is used in any order positions
    from ..models import OrderPosition
    position_count = db.query(OrderPosition).filter(OrderPosition.product_id == product_id).count()
    if position_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete product - it is used in {position_count} order position(s)"
        )

    db.delete(product)
    db.commit()
    return {"message": "Product deleted successfully"}
