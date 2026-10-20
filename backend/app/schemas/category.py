from typing import Annotated

from pydantic import BaseModel, Field


class CategoryOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    slug: str | None
    color: str
    sort_order: int
    is_default: bool
    is_archived: bool
    # A bill uses it, so it can only be archived. Filled in by GET /categories.
    in_use: bool = False


# Mirrors the DB column, String(50).
CategoryName = Annotated[str, Field(min_length=1, max_length=50)]


class CategoryCreate(BaseModel):
    name: CategoryName
    color: str


class CategoryUpdate(BaseModel):
    name: CategoryName | None = None
    color: str | None = None
