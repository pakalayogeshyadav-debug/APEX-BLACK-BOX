import pytest
import uuid
import time
from sqlalchemy import text, select
from app.core.database import AsyncSessionLocal
from app.services.ingestion import ingestion_service
from app.schemas.schemas import TelemetryPayload, TelemetryData
from app.models.models import Device, TelemetrySession, TelemetrySample

@pytest.mark.asyncio
async def test_database_connectivity_and_query():
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar() == 1

@pytest.mark.asyncio
async def test_telemetry_persistence_and_cleanup():
    test_device_id = f"test-dev-{uuid.uuid4().hex[:6]}"
    test_session_id = uuid.uuid4()
    test_seq = 77777
    test_ts_uptime_ms = 500000 # 500 seconds uptime (fits within 32-bit INT)

    async with AsyncSessionLocal() as session:
        # Create a dedicated temporary device for the test
        device = Device(
            device_identifier=test_device_id,
            device_role="LOGGER",
            hardware_model="ESP32-S3",
            status="ONLINE"
        )
        session.add(device)
        await session.commit()
        await session.refresh(device)

    ingestion_service.start()
    try:
        payload = TelemetryPayload(
            schema_version=1,
            device_id=test_device_id,
            session_id=str(test_session_id),
            sequence_number=test_seq,
            device_timestamp_ms=test_ts_uptime_ms,
            source_mode="SIMULATION",
            telemetry=TelemetryData(
                vehicle_speed_kmh=65.0,
                engine_rpm=2800,
                throttle_percent=30.0,
                deceleration_mps2=0.0
            )
        )

        # Ingest through ingestion service
        result = await ingestion_service.ingest(payload)
        assert result is True

        # Verify database record
        async with AsyncSessionLocal() as session:
            sample_query = await session.execute(
                select(TelemetrySample).where(TelemetrySample.sequence_number == test_seq)
            )
            sample = sample_query.scalar_one_or_none()
            assert sample is not None
            assert sample.vehicle_speed_kmh == 65.0
            assert sample.engine_rpm == 2800
            assert sample.device_timestamp_ms == test_ts_uptime_ms

    finally:
        await ingestion_service.stop()
        # Safe cleanup: remove all inserted test records
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("DELETE FROM telemetry_samples WHERE sequence_number = :seq"),
                {"seq": test_seq}
            )
            await session.execute(
                text("DELETE FROM telemetry_sessions WHERE id = :sid"),
                {"sid": test_session_id.hex}
            )
            await session.execute(
                text("DELETE FROM devices WHERE device_identifier = :dev_id"),
                {"dev_id": test_device_id}
            )
            await session.commit()

        # Verify cleanup
        async with AsyncSessionLocal() as session:
            verify_sample = await session.execute(
                text("SELECT COUNT(1) FROM telemetry_samples WHERE sequence_number = :seq"),
                {"seq": test_seq}
            )
            assert verify_sample.scalar() == 0
