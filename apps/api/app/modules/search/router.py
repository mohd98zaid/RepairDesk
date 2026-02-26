from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.dependencies import get_current_user
from app.modules.users.models import User
from app.modules.search.schemas import GlobalSearchResponse
from app.modules.search.service import SearchService

router = APIRouter(prefix="/search", tags=["Global Search"])

from app.core.dependencies import CurrentUser

@router.get("", response_model=GlobalSearchResponse)
async def global_search(
    current_user: CurrentUser,
    query: str = Query(..., min_length=1, description="Search term across tickets, customers, and inventory"),
    limit: int = Query(5, ge=1, le=20, description="Max results per category"),
    db: AsyncSession = Depends(get_db),
):
    """
    Search across multiple entities (Tickets, Customers, Inventory) simultaneously.
    """
    results = await SearchService.global_search(
        db=db,
        shop_id=current_user["shop_id"],
        query=query,
        limit=limit
    )
    return results
