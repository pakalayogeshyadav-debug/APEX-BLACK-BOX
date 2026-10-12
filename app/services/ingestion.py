import asyncio
import uuid
import logging
from typing import List, Tuple
from datetime import datetime, timezone

from sqlalchemy.future import select
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.models import TelemetrySample, Device, TelemetrySession
from app.schemas.schemas import TelemetryPayload
from app.services.websocket import ws_manager

logger = logging.getLogger(__name__)

class IngestionService:
    def __init__(self):
        self.queue = asyncio.Queue()
        self.batch_size = 100
        self.flush_interval_sec = 0.1
        self._task = None
        self.latest_stats = {
            "last_packet_time": None,
            "last_device_id": None,
            "last_source_mode": None,
            "last_sequence_number": None,
            "last_can_frame_count": None,
            "last_dropped_frame_count": None,
            "total_received_packets": 0,
        }

    def start(self):
        try:
            loop = asyncio.get_running_loop()
            if self.queue is None or (getattr(self.queue, '_loop', None) is not None and self.queue._loop != loop):
                self.queue = asyncio.Queue()
        except RuntimeError:
            pass

        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._worker())

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def ingest(self, payload: TelemetryPayload) -> bool:
        future = asyncio.get_running_loop().create_future()
        await self.queue.put((payload, future))
        return await future

    async def _worker(self):
        while True:
            batch: List[Tuple[TelemetryPayload, asyncio.Future]] = []
            try:
                item = await asyncio.wait_for(self.queue.get(), timeout=self.flush_interval_sec)
                batch.append(item)
                
                while len(batch) < self.batch_size:
                    try:
                        item = self.queue.get_nowait()
                        batch.append(item)
                    except asyncio.QueueEmpty:
                        break
                        
            except asyncio.TimeoutError:
                pass
            except asyncio.CancelledError:
                break
            
            if batch:
                await self._process_batch(batch)

    async def _process_batch(self, batch: List[Tuple[TelemetryPayload, asyncio.Future]]):
        async with AsyncSessionLocal() as session:
            try:
                device_ids = list(set([item[0].device_id for item in batch]))
                device_result = await session.execute(
                    select(Device).where(Device.device_identifier.in_(device_ids))
                )
                devices_map = {d.device_identifier: d for d in device_result.scalars()}
                
                valid_items = []
                futures_to_resolve = []
                futures_to_reject = []
                
                values_to_insert = []
                sessions_to_ensure = set()
                
                for payload, future in batch:
                    if payload.device_id not in devices_map:
                        futures_to_reject.append((future, f"Device {payload.device_id} not found"))
                        continue
                    
                    device = devices_map[payload.device_id]
                    
                    try:
                        sess_uuid = uuid.UUID(payload.session_id)
                    except ValueError:
                        sess_uuid = uuid.uuid5(uuid.NAMESPACE_OID, payload.session_id)
                        
                    sessions_to_ensure.add((sess_uuid, device.id, payload.source_mode))
                    
                    can_stats = payload.can_statistics
                    rcv = can_stats.received_frames if can_stats else None
                    drp = can_stats.dropped_frames if can_stats else None
                    
                    values_to_insert.append({
                        "id": uuid.uuid4(),
                        "session_id": sess_uuid,
                        "device_id": device.id,
                        "device_timestamp_ms": payload.device_timestamp_ms,
                        "vehicle_speed_kmh": payload.telemetry.vehicle_speed_kmh,
                        "engine_rpm": payload.telemetry.engine_rpm,
                        "throttle_percent": payload.telemetry.throttle_percent,
                        "deceleration_mps2": payload.telemetry.deceleration_mps2,
                        "can_frame_count": rcv,
                        "dropped_frame_count": drp,
                        "sequence_number": payload.sequence_number,
                        "source_mode": payload.source_mode,
                        "received_at": datetime.now(timezone.utc)
                    })
                    futures_to_resolve.append(future)
                    device.last_seen_at = datetime.now(timezone.utc)
                
                if sessions_to_ensure:
                    # Auto-create sessions if they don't exist
                    for s_id, d_id, mode in sessions_to_ensure:
                        sess_check = await session.execute(select(TelemetrySession).where(TelemetrySession.id == s_id))
                        if not sess_check.scalar_one_or_none():
                            new_sess = TelemetrySession(
                                id=s_id,
                                device_id=d_id,
                                source_mode=mode,
                                status="ACTIVE"
                            )
                            session.add(new_sess)
                    await session.commit()
                
                if values_to_insert:
                    last_val = values_to_insert[-1]
                    self.latest_stats["last_packet_time"] = datetime.now(timezone.utc)
                    self.latest_stats["last_device_id"] = str(last_val["device_id"])
                    self.latest_stats["last_source_mode"] = last_val["source_mode"]
                    self.latest_stats["last_sequence_number"] = last_val["sequence_number"]
                    self.latest_stats["last_can_frame_count"] = last_val.get("can_frame_count")
                    self.latest_stats["last_dropped_frame_count"] = last_val.get("dropped_frame_count")
                    self.latest_stats["total_received_packets"] += len(values_to_insert)

                    # Use INSERT IGNORE for deduplication by (session_id, sequence_number)
                    stmt = insert(TelemetrySample).values(values_to_insert).prefix_with("IGNORE")
                    await session.execute(stmt)
                    await session.commit()
                    
                    # Run event detection
                    from app.services.event_detector import event_detector
                    await event_detector.process_samples(values_to_insert)
                    
                    # Broadcast to WS clients
                    for val in values_to_insert:
                        await ws_manager.broadcast({
                            "schema_version": 1,
                            "type": "telemetry.update",
                            "source_mode": val["source_mode"],
                            "sequence_number": val["sequence_number"],
                            "server_timestamp": val["received_at"].isoformat(),
                            "data": {
                                "device_id": str(val["device_id"]),
                                "session_id": str(val["session_id"]),
                                "device_timestamp_ms": val["device_timestamp_ms"],
                                "vehicle_speed_kmh": val["vehicle_speed_kmh"],
                                "engine_rpm": val["engine_rpm"],
                                "throttle_percent": val["throttle_percent"],
                                "deceleration_mps2": val["deceleration_mps2"],
                                "can_frame_count": val.get("can_frame_count"),
                                "dropped_frame_count": val.get("dropped_frame_count"),
                            }
                        })
                    
                for f in futures_to_resolve:
                    if not f.done():
                        f.set_result(True)
                        
                for f, msg in futures_to_reject:
                    if not f.done():
                        f.set_exception(ValueError(msg))
                    
            except Exception as e:
                logger.error(f"Batch insert failed: {e}")
                for _, future in batch:
                    if not future.done():
                        future.set_exception(e)

ingestion_service = IngestionService()
