import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_health_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "APEX_BLACKBOX_BACKEND"
    assert data["database"]["status"] == "CONNECTED"
    assert data["database"]["query"] == "OK"
    assert data["backend_process"]["status"] == "ONLINE"

@pytest.mark.asyncio
async def test_get_devices():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/v1/devices")
    assert response.status_code == 200
    devices = response.json()
    assert isinstance(devices, list)
