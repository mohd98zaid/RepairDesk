import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession, OwnerUser
from app.core.exceptions import ForbiddenException, NotFoundException
from app.modules.users.models import Invitation, User
from app.modules.users.schemas import InviteRequest, TeamMemberResponse

router = APIRouter(prefix="/team", tags=["Team"])
users_router = APIRouter(prefix="/users", tags=["Users"])


class UserMeUpdate(BaseModel):
    avatar_data: Optional[str] = None
    full_name: Optional[str] = None


@users_router.patch("/me")
async def update_me(data: UserMeUpdate, current_user: CurrentUser, db: DbSession):
    """Update current user profile (avatar, name)."""
    result = await db.execute(select(User).where(User.id == current_user["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("User not found.")
    if data.avatar_data is not None:
        user.avatar_data = data.avatar_data
    if data.full_name is not None:
        user.full_name = data.full_name
    return {"ok": True}




@router.get("", response_model=list[TeamMemberResponse])
async def list_team(current_user: CurrentUser, db: DbSession):
    """List all active members of the current shop."""
    result = await db.execute(
        select(User).where(User.shop_id == current_user["shop_id"], User.is_active == True)
    )
    return result.scalars().all()


@router.post("/invite", status_code=201)
async def invite_team_member(data: InviteRequest, current_user: OwnerUser, db: DbSession):
    """Invite a new technician by email (owner only)."""
    token = secrets.token_urlsafe(32)
    invitation = Invitation(
        shop_id=current_user["shop_id"],
        email=data.email,
        role=data.role,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        created_by=current_user["user_id"],
    )
    db.add(invitation)
    # TODO: Send invitation email
    return {"message": f"Invitation sent to {data.email}"}


@router.delete("/{user_id}", status_code=204)
async def deactivate_team_member(
    user_id: uuid.UUID, current_user: OwnerUser, db: DbSession
):
    """Deactivate a team member (owner only, cannot deactivate self)."""
    if str(user_id) == current_user["user_id"]:
        raise ForbiddenException("You cannot deactivate yourself.")

    result = await db.execute(
        select(User).where(User.id == user_id, User.shop_id == current_user["shop_id"])
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Team member not found.")

    user.is_active = False
