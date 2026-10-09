import pytest
import uuid
from httpx import AsyncClient

# --- ADD THESE IMPORTS ---
from app.main import app
from app.api.deps import get_current_user
# -------------------------

from tests.conftest import override_user

@pytest.mark.asyncio
async def test_workspace_isolation(client: AsyncClient):
    user_a_id = uuid.uuid4()
    user_b_id = uuid.uuid4()
    
    # 1. User A creates a workspace
    app.dependency_overrides[get_current_user] = override_user(user_a_id, "a@test.com")
    res = await client.post("/api/v1/workspaces", json={"name": "Workspace A"})
    assert res.status_code == 201
    workspace_a_id = res.json()["id"]
    
    # 2. User B creates a workspace
    app.dependency_overrides[get_current_user] = override_user(user_b_id, "b@test.com")
    res = await client.post("/api/v1/workspaces", json={"name": "Workspace B"})
    assert res.status_code == 201
    workspace_b_id = res.json()["id"]
    
    # 3. User A tries to access Workspace B (Should fail with 404 to prevent leaking IDs)
    app.dependency_overrides[get_current_user] = override_user(user_a_id, "a@test.com")
    res = await client.get(f"/api/v1/workspaces/{workspace_b_id}")
    assert res.status_code == 404
    
    # 4. User A tries to list documents in Workspace B (Should be empty/404)
    res = await client.get(f"/api/v1/workspaces/{workspace_b_id}/documents")
    assert res.status_code == 404
    
    # 5. User A can access their own workspace
    res = await client.get(f"/api/v1/workspaces/{workspace_a_id}")
    assert res.status_code == 200
    
    # Clean up dependency overrides after the test
    app.dependency_overrides.clear()
