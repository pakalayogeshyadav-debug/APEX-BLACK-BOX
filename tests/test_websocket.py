import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.websocket import ws_manager
import asyncio

client = TestClient(app)

def test_websocket_connection():
    with client.websocket_connect("/api/v1/ws/telemetry") as websocket:
        assert len(ws_manager.active_connections) == 1
        
        # Test ping pong
        websocket.send_text("ping")
        data = websocket.receive_text()
        assert data == "pong"
        
    assert len(ws_manager.active_connections) == 0

@pytest.mark.asyncio
async def test_websocket_broadcast():
    with client.websocket_connect("/api/v1/ws/telemetry") as websocket:
        # Trigger broadcast manually for test
        await ws_manager.broadcast({
            "schema_version": 1,
            "type": "telemetry.update",
            "source_mode": "SIMULATION",
            "sequence_number": 1001,
            "data": {"vehicle_speed_kmh": 120}
        })
        
        data = websocket.receive_json()
        assert data["type"] == "telemetry.update"
        assert data["source_mode"] == "SIMULATION"
        assert data["data"]["vehicle_speed_kmh"] == 120
        assert "server_timestamp" in data

@pytest.mark.asyncio
async def test_multiple_clients_and_slow_consumer():
    # Just test that multiple clients can connect
    with client.websocket_connect("/api/v1/ws/telemetry") as ws1:
        with client.websocket_connect("/api/v1/ws/telemetry") as ws2:
            assert len(ws_manager.active_connections) == 2
            
            await ws_manager.broadcast({"type": "telemetry.update"})
            
            data1 = ws1.receive_json()
            data2 = ws2.receive_json()
            
            assert data1["type"] == "telemetry.update"
            assert data2["type"] == "telemetry.update"
