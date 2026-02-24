from fastapi import APIRouter
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession, OwnerUser
from app.core.exceptions import NotFoundException
from app.modules.shops.models import Shop
from app.modules.shops.schemas import ShopResponse, ShopUpdate

router = APIRouter(prefix="/shops", tags=["Shops"])


@router.get("/me", response_model=ShopResponse)
async def get_my_shop(current_user: CurrentUser, db: DbSession):
    """Get the current user's shop details."""
    result = await db.execute(select(Shop).where(Shop.id == current_user["shop_id"]))
    shop = result.scalar_one_or_none()
    if not shop:
        raise NotFoundException("Shop not found.")
    return shop


@router.patch("/me", response_model=ShopResponse)
async def update_my_shop(data: ShopUpdate, current_user: OwnerUser, db: DbSession):
    """Update the current shop's details (owner only)."""
    result = await db.execute(select(Shop).where(Shop.id == current_user["shop_id"]))
    shop = result.scalar_one_or_none()
    if not shop:
        raise NotFoundException("Shop not found.")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(shop, field, value)

    return shop
