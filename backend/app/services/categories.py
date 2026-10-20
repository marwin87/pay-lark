from sqlalchemy.orm import Session

from app.models.category import Category

# Fixed color palette every category (default or user-created) picks from.
# Frontend maps each key to its Tailwind border-accent classes; the backend
# only stores/validates the key so custom categories can't inject arbitrary
# CSS.
CATEGORY_COLORS = (
    "blue",
    "purple",
    "rose",
    "orange",
    "slate",
    "violet",
    "cyan",
    "emerald",
    "slate-light",
    "yellow",
    "lime",
    "pink",
    "blue-dark",
    "emerald-dark",
    "rose-dark",
    "orange-dark",
)

# The starter set every user gets on registration. slug matches the old
# BillCategory enum values 1:1 so existing i18n labels and legacy (pre-
# categories-table) backup restores keep working unchanged.
DEFAULT_CATEGORIES = (
    {"slug": "education", "name": "Education", "color": "blue"},
    {"slug": "entertainment", "name": "Entertainment", "color": "purple"},
    {"slug": "healthcare", "name": "Healthcare", "color": "rose"},
    {"slug": "housing", "name": "Housing", "color": "orange"},
    {"slug": "insurance", "name": "Insurance", "color": "slate"},
    {"slug": "loans", "name": "Loans", "color": "lime"},
    {"slug": "subscriptions", "name": "Subscriptions", "color": "violet"},
    {"slug": "transport", "name": "Transport", "color": "cyan"},
    {"slug": "utilities", "name": "Utilities", "color": "emerald"},
    {"slug": "other", "name": "Other", "color": "slate-light"},
)


def seed_default_categories(db: Session, user_id: int) -> list[Category]:
    """Insert the starter category set for a user. Idempotent: no-op if the
    user already has any categories (covers both the registration call site
    and the one-off migration backfill for pre-existing users)."""
    existing = db.query(Category.id).filter(Category.user_id == user_id).first()
    if existing is not None:
        return []

    rows = [
        Category(
            user_id=user_id,
            name=c["name"],
            slug=c["slug"],
            color=c["color"],
            sort_order=i,
            is_default=True,
        )
        for i, c in enumerate(DEFAULT_CATEGORIES)
    ]
    db.add_all(rows)
    db.flush()
    return rows
