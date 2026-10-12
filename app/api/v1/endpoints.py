from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import uuid

from app.core.database import AsyncSessionLocal
from app.api.dependencies import get_db, verify_api_key
from app.models.models import Device, TelemetrySample, Recording, RecordingSample, Event, CANFrame
from app.schemas.schemas import DeviceResponse, TelemetryPayload, RecordingResponse, RetrievalRequest, RecordingChunkPayload, EventResponse

router = APIRouter()

from app.api.v1.diagnostics import router as diagnostics_router
router.include_router(diagnostics_router)

from app.api.v1.can import router as can_router
router.include_router(can_router)

@router.get("/devices", response_model=List[DeviceResponse])
async def get_devices(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device))
    return result.scalars().all()

@router.get("/devices/{device_id}", response_model=DeviceResponse)
async def get_device(device_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device

@router.get("/devices/{device_id}/health")
async def get_device_health(device_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    # Placeholder for health history
    return {"device_id": device_id, "status": "ONLINE"}

from app.services.ingestion import ingestion_service

@router.post("/telemetry/ingest", dependencies=[Depends(verify_api_key)])
async def ingest_telemetry(payload: TelemetryPayload):
    try:
        await ingestion_service.ingest(payload)
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error during ingestion")

@router.get("/telemetry/latest")
async def get_latest_telemetry(db: AsyncSession = Depends(get_db)):
    return {"message": "Latest telemetry stream endpoint"}

@router.get("/telemetry/history")
async def get_telemetry_history(db: AsyncSession = Depends(get_db)):
    return []

@router.get("/can-frames")
async def get_can_frames(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CANFrame).limit(100))
    return result.scalars().all()

@router.get("/events", response_model=List[EventResponse])
async def get_events(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Event).order_by(Event.trigger_timestamp_ms.desc()).limit(50))
    return result.scalars().all()

@router.get("/recordings", response_model=List[RecordingResponse])
async def get_recordings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Recording).order_by(Recording.created_at.desc()))
    return result.scalars().all()

@router.get("/recordings/{recording_id}", response_model=RecordingResponse)
async def get_recording(recording_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Recording).where(Recording.id == recording_id))
    rec = result.scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    return rec

@router.get("/recordings/{recording_id}/samples")
async def get_recording_samples(recording_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RecordingSample)
        .where(RecordingSample.recording_id == recording_id)
        .order_by(RecordingSample.original_sequence_number.asc(), RecordingSample.original_timestamp_ms.asc())
    )
    return result.scalars().all()

from app.services.retrieval import retrieval_service

@router.post("/blackbox/retrieve", dependencies=[Depends(verify_api_key)])
async def retrieve_blackbox(payload: RetrievalRequest):
    try:
        request_id = await retrieval_service.initiate_retrieval(payload.device_id, payload.duration_sec)
        return {"status": "retrieval_initiated", "request_id": request_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/blackbox/chunk", dependencies=[Depends(verify_api_key)])
async def ingest_blackbox_chunk(payload: RecordingChunkPayload):
    try:
        await retrieval_service.process_chunk(payload)
        return {"status": "chunk_accepted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process chunk: {e}")

@router.get("/events", response_model=List[EventResponse])
async def list_events(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Event).order_by(Event.detected_at.desc()).limit(50))
    events = result.scalars().all()
    
    # Try to dynamically associate recordings if not explicitly set
    for evt in events:
        if not evt.recording_id:
            # Find a recording that overlaps this event's trigger timestamp
            # Event timestamp is in MS, recordings use start_at/end_at in datetime
            from datetime import datetime, timezone
            evt_dt = datetime.fromtimestamp(evt.trigger_timestamp_ms / 1000.0, tz=timezone.utc)
            rec_result = await db.execute(
                select(Recording).where(
                    Recording.device_id == evt.device_id,
                    Recording.recording_start_at <= evt_dt,
                    Recording.recording_end_at >= evt_dt,
                    Recording.transfer_status == "COMPLETED"
                ).limit(1)
            )
            rec = rec_result.scalar_one_or_none()
            if rec:
                evt.recording_id = rec.id
    
    return events

@router.get("/events/{event_id}/replay")
async def get_event_replay(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    evt_result = await db.execute(select(Event).where(Event.id == event_id))
    event = evt_result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    recording_id = event.recording_id
    if not recording_id:
        from datetime import datetime, timezone
        evt_dt = datetime.fromtimestamp(event.trigger_timestamp_ms / 1000.0, tz=timezone.utc)
        rec_result = await db.execute(
            select(Recording).where(
                Recording.device_id == event.device_id,
                Recording.recording_start_at <= evt_dt,
                Recording.recording_end_at >= evt_dt,
                Recording.transfer_status == "COMPLETED"
            ).limit(1)
        )
        rec = rec_result.scalar_one_or_none()
        if not rec:
            raise HTTPException(status_code=404, detail="No recording available for this event")
        recording_id = rec.id
        
    # Get recording samples 10 seconds before and 10 seconds after event
    # Our recording samples have original_timestamp_ms
    start_ms = event.trigger_timestamp_ms - 10000
    end_ms = event.trigger_timestamp_ms + 10000
    
    samples_result = await db.execute(
        select(RecordingSample).where(
            RecordingSample.recording_id == recording_id,
            RecordingSample.original_timestamp_ms >= start_ms,
            RecordingSample.original_timestamp_ms <= end_ms
        ).order_by(RecordingSample.original_timestamp_ms.asc())
    )
    samples = samples_result.scalars().all()
    
    return {
        "event": {
            "id": str(event.id),
            "type": event.event_type,
            "trigger_timestamp_ms": event.trigger_timestamp_ms,
            "metadata": event.trigger_metadata,
            "source_mode": event.source_mode
        },
        "recording_id": str(recording_id),
        "samples": [
            {
                "timestamp_ms": s.original_timestamp_ms,
                "sequence_number": s.original_sequence_number,
                "telemetry": s.telemetry_data,
                "can_frames": s.can_frames
            }
            for s in samples
        ]
    }

from app.services.websocket import ws_manager

@router.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Just wait for messages to keep connection open (or handle ping/pong)
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


from app.services.simulator import simulator_service
from app.schemas.schemas import (
    SimulatorControlsRequest,
    SimulatorScenarioRequest,
    SimulatorEventTriggerRequest,
    SimulatorRecordingStartRequest
)

@router.post("/simulator/start")
async def start_simulator():
    simulator_service.start()
    return {"status": "Simulator started", "state": simulator_service.get_full_state()}

@router.post("/simulator/stop")
async def stop_simulator():
    await simulator_service.stop()
    return {"status": "Simulator stopped", "state": simulator_service.get_full_state()}

@router.post("/simulator/pause")
async def pause_simulator():
    simulator_service.pause()
    return {"status": "Simulator paused", "state": simulator_service.get_full_state()}

@router.post("/simulator/resume")
async def resume_simulator():
    simulator_service.resume()
    return {"status": "Simulator resumed", "state": simulator_service.get_full_state()}

@router.post("/simulator/reset")
async def reset_simulator():
    simulator_service.reset()
    return {"status": "Simulator reset", "state": simulator_service.get_full_state()}

@router.post("/simulator/controls")
async def update_simulator_controls(payload: SimulatorControlsRequest):
    simulator_service.set_controls(
        accelerator=payload.accelerator,
        brake=payload.brake,
        steering=payload.steering,
        gear=payload.gear,
        ignition=payload.ignition,
        parking_brake=payload.parking_brake,
        headlights=payload.headlights,
        turn_indicators=payload.turn_indicators,
        hazard_lights=payload.hazard_lights
    )
    return {"status": "Controls updated", "state": simulator_service.get_full_state()}

@router.get("/simulator/state")
async def get_simulator_state():
    return simulator_service.get_full_state()

@router.post("/simulator/scenario/start")
async def start_simulator_scenario(payload: SimulatorScenarioRequest):
    try:
        simulator_service.start_scenario(payload.scenario_name)
        return {"status": "Scenario started", "scenario": payload.scenario_name, "state": simulator_service.get_full_state()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/simulator/scenario/stop")
async def stop_simulator_scenario():
    simulator_service.stop_scenario()
    return {"status": "Scenario stopped", "state": simulator_service.get_full_state()}

@router.post("/simulator/trigger-event")
async def trigger_simulator_event(payload: SimulatorEventTriggerRequest):
    evt = await simulator_service.trigger_event(
        event_type=payload.event_type,
        severity=payload.severity,
        description=payload.description or f"Manual test event: {payload.event_type}"
    )
    return {"status": "Event triggered", "event": evt}

@router.post("/simulator/recording/start")
async def start_simulator_recording(payload: SimulatorRecordingStartRequest):
    res = await simulator_service.start_recording(requested_duration_sec=payload.duration_sec)
    return res

@router.post("/simulator/recording/stop")
async def stop_simulator_recording():
    res = await simulator_service.stop_recording()
    return res
