from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.models.bill import BillTemplate
from app.models.category import Category
from app.models.user import User
from app.schemas.category import CategoryCreate, CategoryOut, CategoryUpdate
from app.services.categories import CATEGORY_COLORS

router = APIRouter(prefix="/categories", tags=["categories"])


def _owned_category(db: Session, category_id: int, user_id: int) -> Category:
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.user_id != user_id:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


def _validate_color(color: str) -> None:
    if color not in CATEGORY_COLORS:
        raise HTTPException(status_code=422, detail="Invalid color")


@router.get("", response_model=list[CategoryOut])
def list_categories(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    q = db.query(Category).filter(Category.user_id == me.id)
    if not include_archived:
        q = q.filter(Category.is_archived.is_(False))
    return q.order_by(Category.sort_order).all()


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    body: CategoryCreate,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    _validate_color(body.color)
    max_order = (
        db.query(Category.sort_order)
        .filter(Category.user_id == me.id)
        .order_by(Category.sort_order.desc())
        .first()
    )
    next_order = (max_order[0] + 1) if max_order else 0
    category = Category(
        user_id=me.id,
        name=body.name,
        color=body.color,
        sort_order=next_order,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    body: CategoryUpdate,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    category = _owned_category(db, category_id, me.id)
    updates = body.model_dump(exclude_unset=True)
    if "color" in updates:
        _validate_color(updates["color"])
    for field, value in updates.items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category


@router.post("/{category_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_category(
    category_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    category = _owned_category(db, category_id, me.id)
    category.is_archived = True
    db.commit()


@router.post("/{category_id}/unarchive", status_code=status.HTTP_204_NO_CONTENT)
def unarchive_category(
    category_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    category = _owned_category(db, category_id, me.id)
    category.is_archived = False
    db.commit()


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    category = _owned_category(db, category_id, me.id)
    in_use = (
        db.query(BillTemplate.id)
        .filter(BillTemplate.category_id == category.id)
        .first()
    )
    if in_use:
        raise HTTPException(status_code=409, detail="Category is used by bills")
    db.delete(category)
    db.commit()
