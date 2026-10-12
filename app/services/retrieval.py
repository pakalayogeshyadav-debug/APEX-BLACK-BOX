import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List
from sqlalchemy.future import select
from sqlalchemy import func
from app.core.database import AsyncSessionLocal
from app.models.models import Recording, RecordingSample, Device
from app.services.device_adapter import device_adapter
from app.services.websocket import ws_manager

logger = logging.getLogger(__name__)

class RetrievalService:
    async def initiate_retrieval(self, device_identifier: str, duration_sec: int) -> uuid.UUID:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Device).where(Device.device_identifier == device_identifier))
            device = result.scalar_one_or_none()
            if not device:
                raise ValueError("Device not found")
                
            is_connected = await device_adapter.check_device_connectivity(device_identifier)
            if not is_connected:
                raise ValueError("Device is disconnected. Cannot retrieve blackbox.")
                
            request_id = uuid.uuid4()
            
            # Create a pending recording
            recording = Recording(
                device_id=device.id,
                recording_type="ROLLING_WINDOW",
                source_mode="SIMULATION" if isinstance(device_adapter.__class__.__name__, str) and "Simulator" in device_adapter.__class__.__name__ else "LIVE",
                requested_duration_sec=duration_sec,
                transfer_status="PENDING",
                retrieval_request_id=request_id,
                sample_count=0
            )
            session.add(recording)
            await session.commit()
            
            # Notify frontend
            await self._broadcast_status(recording.id, "PENDING", 0)
            
            # Send command to device
            success = await device_adapter.send_retrieval_command(device_identifier, request_id, duration_sec)
            if not success:
                recording.transfer_status = "FAILED"
                await session.commit()
                await self._broadcast_status(recording.id, "FAILED", 0)
                raise ValueError("Failed to dispatch command to device.")
                
            return request_id

    async def process_chunk(self, payload) -> None:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Recording).where(Recording.retrieval_request_id == payload.retrieval_request_id))
            recording = result.scalar_one_or_none()
            if not recording:
                logger.error(f"Recording for request {payload.retrieval_request_id} not found.")
                return
                
            # Idempotent insert of samples
            # Query existing sequence numbers for this recording
            existing_result = await session.execute(
                select(RecordingSample.original_sequence_number)
                .where(RecordingSample.recording_id == recording.id)
            )
            existing_seq_nums = {row[0] for row in existing_result.all() if row[0] is not None}
            
            samples_to_insert = []
            for s in payload.samples:
                if s.original_sequence_number in existing_seq_nums:
                    continue # Skip duplicate
                    
                samples_to_insert.append(
                    RecordingSample(
                        recording_id=recording.id,
                        original_timestamp_ms=s.original_timestamp_ms,
                        original_sequence_number=s.original_sequence_number,
                        telemetry_data=s.telemetry_data,
                        can_frames=s.can_frames
                    )
                )
            
            if samples_to_insert:
                session.add_all(samples_to_insert)
            
            # Update progress
            current_progress = (payload.chunk_index + 1) / payload.total_chunks
            
            if payload.chunk_index == payload.total_chunks - 1:
                # Final chunk received
                recording.transfer_status = "COMPLETED"
                
            await session.commit()
            
            if recording.transfer_status == "COMPLETED":
                await self._finalize_recording(recording.id)
            else:
                await self._broadcast_status(recording.id, "TRANSFERRING", current_progress)

    async def _finalize_recording(self, recording_id: uuid.UUID):
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Recording).where(Recording.id == recording_id))
            recording = result.scalar_one_or_none()
            if not recording:
                return
                
            # Calculate actuals
            samples_result = await session.execute(
                select(RecordingSample).where(RecordingSample.recording_id == recording_id).order_by(RecordingSample.original_timestamp_ms.asc())
            )
            samples = samples_result.scalars().all()
            
            if not samples:
                recording.transfer_status = "FAILED"
                recording.missing_data_info = {"error": "No samples received"}
            else:
                first_ts = samples[0].original_timestamp_ms
                last_ts = samples[-1].original_timestamp_ms
                
                # Only convert to calendar datetime if timestamps are valid epoch (>= year 2000, 946684800000 ms)
                if first_ts >= 946684800000:
                    recording.recording_start_at = datetime.fromtimestamp(first_ts / 1000.0, tz=timezone.utc)
                    recording.recording_end_at = datetime.fromtimestamp(last_ts / 1000.0, tz=timezone.utc)
                else:
                    # Relative hardware uptime: do not fabricate 1970 epoch calendar dates
                    recording.recording_start_at = None
                    recording.recording_end_at = None
                recording.actual_duration_sec = (last_ts - first_ts) / 1000.0
                recording.sample_count = len(samples)
                recording.integrity_status = "VERIFIED"
                
                # Check for gaps (e.g. sequence number skips)
                expected_seq = samples[0].original_sequence_number
                gaps = []
                for s in samples:
                    if s.original_sequence_number is not None and s.original_sequence_number != expected_seq:
                        gaps.append({"expected": expected_seq, "got": s.original_sequence_number})
                        expected_seq = s.original_sequence_number
                    expected_seq += 1
                
                if gaps:
                    recording.missing_data_info = {"gaps": gaps}
            
            await session.commit()
            await self._broadcast_status(recording.id, recording.transfer_status, 1.0)

    async def _broadcast_status(self, recording_id: uuid.UUID, status: str, progress: float):
        await ws_manager.broadcast({
            "type": "recording.status",
            "data": {
                "recording_id": str(recording_id),
                "status": status,
                "progress": progress
            }
        })

retrieval_service = RetrievalService()
