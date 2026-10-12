import pytest
import uuid
from pydantic import ValidationError
from sqlalchemy import text, select, delete

from app.core.database import AsyncSessionLocal
from app.models.models import Device, TelemetrySession, TelemetrySample, Recording, RecordingSample
from app.schemas.schemas import TelemetryPayload, TelemetryData, CANStatistics, RecordingChunkPayload, RecordingSampleBase
from app.services.ingestion import ingestion_service
from app.services.retrieval import retrieval_service

@pytest.mark.asyncio
async def test_full_pipeline_isolated_simulation():
    """
    PHASE 4 ISOLATED INTEGRATION TEST
    Label: SIMULATION (Hardware not physically attached)
    Verifies:
      1. Dedicated test device creation
      2. Telemetry session creation
      3. Sequence ingestion
      4. Database commit verification
      5. Read-back of values from MySQL
      6. Sequence-number deduplication
      7. Rejection of invalid payloads
      8. Recording metadata persistence
      9. Recording chunk persistence
      10. Recording samples read-back
      11. Strict cleanup of test-only data
    """
    test_run_id = uuid.uuid4().hex[:8]
    dev_identifier = f"iso-test-dev-{test_run_id}"
    session_id = uuid.uuid4()
    req_id = uuid.uuid4()
    
    test_device_db_id = None
    test_recording_db_id = None
    
    # 1. Create dedicated test device
    async with AsyncSessionLocal() as session:
        device = Device(
            device_identifier=dev_identifier,
            device_role="LOGGER",
            hardware_model="ESP32-S3",
            firmware_version="v1.2-SIM",
            status="ONLINE"
        )
        session.add(device)
        await session.commit()
        await session.refresh(device)
        test_device_db_id = device.id
        assert test_device_db_id is not None

    ingestion_service.start()
    try:
        # 2 & 3. Send a sequence of 3 telemetry samples
        seq_numbers = [1001, 1002, 1003]
        base_uptime_ms = 150000 # 150 seconds uptime (fits in 32-bit INT)
        
        for idx, seq in enumerate(seq_numbers):
            payload = TelemetryPayload(
                schema_version=1,
                device_id=dev_identifier,
                session_id=str(session_id),
                sequence_number=seq,
                device_timestamp_ms=base_uptime_ms + (idx * 100),
                source_mode="SIMULATION",
                telemetry=TelemetryData(
                    vehicle_speed_kmh=50.0 + (idx * 10.0),
                    engine_rpm=2000 + (idx * 500),
                    throttle_percent=25.0 + (idx * 5.0),
                    deceleration_mps2=0.0
                ),
                can_statistics=CANStatistics(
                    received_frames=seq * 10,
                    dropped_frames=0
                )
            )
            success = await ingestion_service.ingest(payload)
            assert success is True

        # 4 & 5. Verify MySQL commit and read-back persisted values
        async with AsyncSessionLocal() as session:
            sess_res = await session.execute(
                select(TelemetrySession).where(TelemetrySession.id == session_id)
            )
            db_session = sess_res.scalar_one_or_none()
            assert db_session is not None
            assert db_session.device_id == test_device_db_id
            assert db_session.source_mode == "SIMULATION"

            samples_res = await session.execute(
                select(TelemetrySample)
                .where(TelemetrySample.session_id == session_id)
                .order_by(TelemetrySample.sequence_number.asc())
            )
            db_samples = samples_res.scalars().all()
            assert len(db_samples) == 3
            assert [s.sequence_number for s in db_samples] == seq_numbers
            assert db_samples[0].vehicle_speed_kmh == 50.0
            assert db_samples[1].vehicle_speed_kmh == 60.0
            assert db_samples[2].vehicle_speed_kmh == 70.0
            assert db_samples[0].engine_rpm == 2000

        # 6. Verify sequence-number deduplication
        dup_payload = TelemetryPayload(
            schema_version=1,
            device_id=dev_identifier,
            session_id=str(session_id),
            sequence_number=1002, # duplicate of second sample
            device_timestamp_ms=base_uptime_ms + 100,
            source_mode="SIMULATION",
            telemetry=TelemetryData(
                vehicle_speed_kmh=99.9, # different value
                engine_rpm=9999
            )
        )
        dup_success = await ingestion_service.ingest(dup_payload)
        assert dup_success is True

        # Confirm count remains 3 and original value was preserved by INSERT IGNORE
        async with AsyncSessionLocal() as session:
            count_res = await session.execute(
                select(TelemetrySample).where(TelemetrySample.session_id == session_id)
            )
            all_samples = count_res.scalars().all()
            assert len(all_samples) == 3
            sample_1002 = next(s for s in all_samples if s.sequence_number == 1002)
            assert sample_1002.vehicle_speed_kmh == 60.0 # Not overwritten with 99.9

        # 7. Verify invalid payloads are rejected
        # Case A: Negative vehicle speed
        with pytest.raises(ValidationError):
            TelemetryPayload(
                schema_version=1,
                device_id=dev_identifier,
                session_id=str(session_id),
                sequence_number=1004,
                device_timestamp_ms=base_uptime_ms + 300,
                source_mode="SIMULATION",
                telemetry=TelemetryData(vehicle_speed_kmh=-15.0)
            )

        # Case B: Unknown device identifier rejected by ingestion service
        invalid_dev_payload = TelemetryPayload(
            schema_version=1,
            device_id="non-existent-device-xyz",
            session_id=str(session_id),
            sequence_number=1005,
            device_timestamp_ms=base_uptime_ms + 400,
            source_mode="SIMULATION",
            telemetry=TelemetryData(vehicle_speed_kmh=40.0)
        )
        with pytest.raises(ValueError, match="not found"):
            await ingestion_service.ingest(invalid_dev_payload)

        # 8. Verify recording metadata persistence
        async with AsyncSessionLocal() as session:
            rec = Recording(
                device_id=test_device_db_id,
                session_id=session_id,
                recording_type="ROLLING_WINDOW",
                source_mode="SIMULATION",
                requested_duration_sec=300,
                retrieval_request_id=req_id,
                transfer_status="PENDING",
                sample_count=0
            )
            session.add(rec)
            await session.commit()
            await session.refresh(rec)
            test_recording_db_id = rec.id
            assert test_recording_db_id is not None

        # 9. Verify recording chunk persistence
        chunk_payload = RecordingChunkPayload(
            retrieval_request_id=req_id,
            chunk_index=0,
            total_chunks=1,
            samples=[
                RecordingSampleBase(
                    original_timestamp_ms=base_uptime_ms,
                    original_sequence_number=1,
                    telemetry_data={"vehicle_speed_kmh": 55.0, "engine_rpm": 2200}
                ),
                RecordingSampleBase(
                    original_timestamp_ms=base_uptime_ms + 100,
                    original_sequence_number=2,
                    telemetry_data={"vehicle_speed_kmh": 58.0, "engine_rpm": 2300}
                )
            ]
        )
        await retrieval_service.process_chunk(chunk_payload)

        # 10. Read back stored recording samples and finalized recording state
        async with AsyncSessionLocal() as session:
            rec_res = await session.execute(
                select(Recording).where(Recording.id == test_recording_db_id)
            )
            final_rec = rec_res.scalar_one()
            assert final_rec.transfer_status == "COMPLETED"
            assert final_rec.sample_count == 2
            assert final_rec.integrity_status == "VERIFIED"

            chunk_samples_res = await session.execute(
                select(RecordingSample)
                .where(RecordingSample.recording_id == test_recording_db_id)
                .order_by(RecordingSample.original_sequence_number.asc())
            )
            chunk_samples = chunk_samples_res.scalars().all()
            assert len(chunk_samples) == 2
            assert chunk_samples[0].telemetry_data["vehicle_speed_kmh"] == 55.0
            assert chunk_samples[1].telemetry_data["vehicle_speed_kmh"] == 58.0

    finally:
        await ingestion_service.stop()
        # 11. Strictly clean up ONLY the records created by this test
        async with AsyncSessionLocal() as session:
            if test_recording_db_id:
                await session.execute(
                    delete(RecordingSample).where(RecordingSample.recording_id == test_recording_db_id)
                )
                await session.execute(
                    delete(Recording).where(Recording.id == test_recording_db_id)
                )
            await session.execute(
                delete(TelemetrySample).where(TelemetrySample.session_id == session_id)
            )
            await session.execute(
                delete(TelemetrySession).where(TelemetrySession.id == session_id)
            )
            if test_device_db_id:
                await session.execute(
                    delete(Device).where(Device.id == test_device_db_id)
                )
            await session.commit()
            
        # Verify strict cleanup
        async with AsyncSessionLocal() as session:
            c1 = await session.execute(
                select(Device).where(Device.device_identifier == dev_identifier)
            )
            assert c1.scalar_one_or_none() is None
