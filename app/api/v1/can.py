import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.schemas import (
    CANControllerConfig,
    RawCANFrameSchema,
    DecodedTelemetrySignal
)
from app.services.can_decoder import can_decoder_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/can", tags=["CAN Acquisition & Diagnostics"])

@router.get("/config", response_model=CANControllerConfig)
async def get_can_config():
    """Returns current CAN controller and transceiver profile configuration."""
    return can_decoder_service.config

@router.post("/config", response_model=CANControllerConfig)
async def update_can_config(config: CANControllerConfig):
    """
    Updates the CAN controller configuration with validation.
    Enforces safe GPIO assignment and supported transceiver profiles (SN65HVD230 / TJA1050).
    """
    can_decoder_service.update_config(config)
    return can_decoder_service.config

@router.get("/frames", response_model=List[RawCANFrameSchema])
async def get_raw_can_frames(
    limit: int = Query(50, ge=1, le=500, description="Max number of recent frames to retrieve"),
    can_id: Optional[int] = Query(None, description="Optional CAN identifier filter")
):
    """
    Mode A: Raw CAN Frame Acquisition Viewer.
    Returns frames exactly as received on the bus without requiring DBC definitions.
    Returns an empty array when the CAN bus is quiet or unobserved.
    """
    return can_decoder_service.get_raw_frames(limit=limit, filter_can_id=can_id)

@router.get("/signals", response_model=Dict[str, DecodedTelemetrySignal])
async def get_decoded_signals():
    """
    Mode B: Decoded Telemetry.
    Returns vehicle parameters (Speed, RPM, Throttle, Temp) decoded from recognized CAN IDs.
    Unavailable signals are explicitly marked as is_valid=False.
    """
    return can_decoder_service.get_decoded_signals()

@router.get("/status")
async def get_can_bus_status():
    """Returns real-time CAN controller and bus activity statistics."""
    stats = can_decoder_service.get_stats()
    is_quiet = stats["total_frames_received"] == 0
    return {
        **stats,
        "traffic_observed": not is_quiet,
        "bus_state": "QUIET" if is_quiet else "ACTIVE",
        "transceiver_profile_details": {
            "name": stats["transceiver_profile"],
            "supply_voltage": "3.3V" if stats["transceiver_profile"] == "SN65HVD230" else "5.0V",
            "level_shifter_required": stats["transceiver_profile"] == "TJA1050",
            "operating_mode": stats["mode"]
        }
    }

@router.post("/frames/inject", response_model=RawCANFrameSchema)
async def inject_raw_frame(frame: RawCANFrameSchema):
    """
    Ingests a raw CAN frame into the acquisition pipeline.
    Used for testing, hardware replay, and simulator adapter integration.
    """
    can_decoder_service.ingest_raw_frame(frame)
    return frame
