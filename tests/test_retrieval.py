import pytest
import uuid
import httpx
from datetime import datetime, timezone
from sqlalchemy.future import select
from app.models.models import Device, Recording, RecordingSample
from app.services.retrieval import retrieval_service
from app.services.device_adapter import device_adapter
from app.core.database import AsyncSessionLocal
from httpx import ASGITransport
from app.main import app

import pytest_asyncio

@pytest_asyncio.fixture
async def setup_device():
    test_dev_id = f"logger-test-{uuid.uuid4().hex[:6]}"
    async with AsyncSessionLocal() as session:
        device = Device(
            device_identifier=test_dev_id,
            device_role="LOGGER",
            hardware_model="ESP32-S3",
            status="ONLINE"
        )
        session.add(device)
        await session.commit()
        await session.refresh(device)
        yield device
        
        from sqlalchemy import delete
        rec_ids_subq = select(Recording.id).where(Recording.device_id == device.id)
        await session.execute(delete(RecordingSample).where(RecordingSample.recording_id.in_(rec_ids_subq)))
        await session.execute(delete(Recording).where(Recording.device_id == device.id))
        await session.delete(device)
        await session.commit()

@pytest.mark.asyncio
async def test_retrieval_no_device_connection(setup_device):
    # Simulate disconnect
    device_adapter.connected = False
    
    with pytest.raises(ValueError, match="Device is disconnected"):
        await retrieval_service.initiate_retrieval(setup_device.device_identifier, 300)
        
    device_adapter.connected = True

@pytest.mark.asyncio
async def test_retrieval_success_simulation(setup_device):
    # Use TestClient equivalent via httpx for async
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Initiate
        request_id = await retrieval_service.initiate_retrieval(setup_device.device_identifier, 50)
        
        # In reality, SimulatorDeviceAdapter spawns a background task. 
        # But we will mock the chunk ingestion directly here to avoid timing issues.
        payload = {
            "retrieval_request_id": str(request_id),
            "chunk_index": 0,
            "total_chunks": 1,
            "samples": [
                {
                    "original_timestamp_ms": int(datetime.now(timezone.utc).timestamp() * 1000),
                    "original_sequence_number": 0,
                    "telemetry_data": {"vehicle_speed_kmh": 100.0}
                },
                {
                    "original_timestamp_ms": int(datetime.now(timezone.utc).timestamp() * 1000) + 100,
                    "original_sequence_number": 1,
                    "telemetry_data": {"vehicle_speed_kmh": 101.0}
                }
            ],
            "chunk_checksum": "hash"
        }
        
        response = await client.post(
            "/api/v1/blackbox/chunk",
            json=payload,
            headers={"X-API-Key": "ApexESP32SecretKey_2097!"}
        )
        assert response.status_code == 200, response.text
        
        # Check DB
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Recording).where(Recording.retrieval_request_id == request_id))
            recording = result.scalar_one()
            
            assert recording.transfer_status == "COMPLETED"
            assert recording.sample_count == 2
            assert recording.actual_duration_sec == 0.1
            assert recording.integrity_status == "VERIFIED"

@pytest.mark.asyncio
async def test_duplicate_chunks_idempotency(setup_device):
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        request_id = await retrieval_service.initiate_retrieval(setup_device.device_identifier, 50)
        
        payload = {
            "retrieval_request_id": str(request_id),
            "chunk_index": 0,
            "total_chunks": 1,
            "samples": [
                {
                    "original_timestamp_ms": 1000,
                    "original_sequence_number": 0,
                    "telemetry_data": {}
                }
            ]
        }
        
        # Send twice
        await client.post("/api/v1/blackbox/chunk", json=payload, headers={"X-API-Key": "ApexESP32SecretKey_2097!"})
        await client.post("/api/v1/blackbox/chunk", json=payload, headers={"X-API-Key": "ApexESP32SecretKey_2097!"})
        
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Recording).where(Recording.retrieval_request_id == request_id))
            recording = result.scalar_one()
            assert recording.sample_count == 1 # Still 1 sample despite two POSTs
