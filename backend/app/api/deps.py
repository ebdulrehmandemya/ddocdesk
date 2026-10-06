from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.models.workspace import Membership, Workspace
from app.services.auth import decode_token

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials

    try:
        payload = decode_token(token)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )

    keycloak_id = payload.get("sub")
    email = payload.get("email")

    if not keycloak_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
        )

    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing email claim",
        )

    result = await db.execute(select(User).where(User.keycloak_id == keycloak_id))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            keycloak_id=keycloak_id,
            email=email,
            display_name=payload.get("name") or payload.get("preferred_username"),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user


async def get_workspace_membership(
    workspace_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> tuple[Workspace, Membership]:
    """
    Return the workspace and the current user's membership.

    Returns 404 instead of 403 when the user is not a member.
    This avoids leaking the existence of private workspaces.
    """
    statement = (
        select(Workspace, Membership)
        .join(Membership, Membership.workspace_id == Workspace.id)
        .where(
            Workspace.id == workspace_id,
            Membership.user_id == current_user.id,
        )
    )

    result = await db.execute(statement)
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    workspace, membership = row
    return workspace, membership


def require_workspace_role(membership: Membership, allowed_roles: set[str]) -> None:
    if membership.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient workspace role",
        )
