import pytest
import uuid
from datetime import datetime, timezone
import httpx
from httpx import ASGITransport

from app.services.event_detector import event_detector
from app.models.models import Event, Device, Recording, RecordingSample
from app.core.database import AsyncSessionLocal
from sqlalchemy.future import select
from app.main import app
import pytest_asyncio

@pytest_asyncio.fixture
async def setup_env():
    test_dev_id = f"logger-event-test-{uuid.uuid4().hex[:6]}"
    async with AsyncSessionLocal() as session:
        device = Device(
            device_identifier=test_dev_id,
            device_role="LOGGER",
            hardware_model="ESP32",
            status="ONLINE"
        )
        session.add(device)
        await session.flush()
        
        # Insert a session
        sess_id = uuid.uuid4()
        from app.models.models import TelemetrySession
        t_sess = TelemetrySession(
            id=sess_id,
            device_id=device.id,
            source_mode="SIMULATION",
            status="ACTIVE"
        )
        session.add(t_sess)
        await session.flush()
        
        # Insert a recording
        rec = Recording(
            device_id=device.id,
            recording_type="ROLLING_WINDOW",
            source_mode="SIMULATION",
            transfer_status="COMPLETED",
            retrieval_request_id=uuid.uuid4(),
            recording_start_at=datetime.fromtimestamp(1000, tz=timezone.utc),
            recording_end_at=datetime.fromtimestamp(2000, tz=timezone.utc)
        )
        session.add(rec)
        await session.flush()
        
        # Insert some samples for the recording
        samples = [
            RecordingSample(
                recording_id=rec.id,
                original_timestamp_ms=1000000,
                original_sequence_number=1,
                telemetry_data={"vehicle_speed_kmh": 100.0, "engine_rpm": 2000, "throttle_percent": 10.0}
            ),
            RecordingSample(
                recording_id=rec.id,
                original_timestamp_ms=1001000,
                original_sequence_number=2,
                telemetry_data={"vehicle_speed_kmh": 70.0, "engine_rpm": 1500, "throttle_percent": 0.0} # decel of 30 km/h in 1 sec = 8.33 m/s^2
            )
        ]
        session.add_all(samples)
        
        await session.commit()
        await session.refresh(device)
        await session.refresh(rec)
        
        yield device, rec, sess_id
        
        # Cleanup
        try:
            from sqlalchemy import delete
            from app.models.models import TelemetrySession
            await session.execute(delete(Event).where(Event.device_id == device.id))
            await session.execute(delete(RecordingSample).where(RecordingSample.recording_id == rec.id))
            await session.execute(delete(Recording).where(Recording.id == rec.id))
            await session.execute(delete(TelemetrySession).where(TelemetrySession.device_id == device.id))
            await session.execute(delete(Device).where(Device.id == device.id))
            await session.commit()
        except Exception as e:
            print(f"TEARDOWN ERROR: {e}")
            await session.rollback()
            raise

@pytest.mark.asyncio
async def test_event_detector_harsh_braking(setup_env):
    device, _, sess_id = setup_env
    
    # Send normal speed
    await event_detector.process_samples([{
        "device_id": device.id,
        "session_id": str(sess_id),
        "device_timestamp_ms": 1000000,
        "vehicle_speed_kmh": 100.0,
        "source_mode": "SIMULATION"
    }])
    
    # Send rapid drop (100 -> 60 km/h in 1s = 11.1 m/s^2 > 0.8g (7.84))
    await event_detector.process_samples([{
        "device_id": device.id,
        "session_id": str(sess_id),
        "device_timestamp_ms": 1001000,
        "vehicle_speed_kmh": 60.0,
        "source_mode": "SIMULATION"
    }])
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Event).where(Event.device_id == device.id))
        events = result.scalars().all()
        
        assert len(events) == 1
        assert events[0].event_type == "HARD_BRAKING"
        assert events[0].trigger_metadata["speed_before_kmh"] == 100.0
        assert events[0].trigger_metadata["speed_after_kmh"] == 60.0
        assert events[0].trigger_metadata["dt_s"] == 1.0

@pytest.mark.asyncio
async def test_event_list_and_replay_endpoint(setup_env):
    device, rec, sess_id = setup_env
    
    # Create an event manually
    async with AsyncSessionLocal() as session:
        evt = Event(
            device_id=device.id,
            session_id=sess_id,
            event_type="HARD_BRAKING",
            trigger_timestamp_ms=1001000, # Matches recording samples
            description="Test",
            source_mode="SIMULATION",
            recording_id=rec.id
        )
        session.add(evt)
        await session.commit()
        await session.refresh(evt)
    
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test List
        list_res = await client.get("/api/v1/events")
        assert list_res.status_code == 200
        data = list_res.json()
        assert len(data) >= 1
        assert any(e["id"] == str(evt.id) for e in data)
        
        # Test Replay
        replay_res = await client.get(f"/api/v1/events/{evt.id}/replay")
        assert replay_res.status_code == 200
        replay_data = replay_res.json()
        
        assert replay_data["event"]["id"] == str(evt.id)
        assert replay_data["recording_id"] == str(rec.id)
        assert len(replay_data["samples"]) == 2
        assert replay_data["samples"][1]["telemetry"]["vehicle_speed_kmh"] == 70.0
