from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from app.schemas.schemas import (
    OverallDiagnosticsResponse,
    SerialPortInfo,
    SerialProbeRequest,
    SerialProbeResponse,
    SubsystemDiagnostic
)
from app.services.diagnostics import diagnostics_service
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from app.api.dependencies import verify_api_key, get_db
from app.models.models import Device

router = APIRouter(prefix="/diagnostics", tags=["Diagnostics"])

@router.get("", response_model=OverallDiagnosticsResponse)
async def get_all_diagnostics():
    """
    Returns unified diagnostic state across all 8 hardware and software subsystems:
    Backend, Database, USB/Serial, ESP32 Logger, ESP32 Gateway, Inter-ESP32 link,
    CAN Bus, Gateway-to-Backend ingress, and Telemetry reception.
    """
    return await diagnostics_service.get_full_diagnostics()

@router.get("/serial/ports", response_model=List[SerialPortInfo])
def list_serial_ports():
    """
    Discovers available host COM/serial ports safely without automatically opening them.
    """
    return diagnostics_service.enumerate_serial_ports()

@router.post("/serial/probe", response_model=SerialProbeResponse)
async def probe_serial_device(req: SerialProbeRequest, db: AsyncSession = Depends(get_db)):
    """
    Safely probes a specific user-selected serial port with an APEX diagnostic ping.
    Handles busy ports, timeouts, and errors safely without toggling reset lines.
    """
    resp = diagnostics_service.probe_serial_port(
        port=req.port,
        baudrate=req.baudrate,
        timeout_sec=req.timeout_sec
    )
    if resp.device_verified and resp.device_info:
        dev_id = resp.device_info.get("device_id") or "apex-gateway-001"
        role = resp.device_info.get("role") or "GATEWAY"
        fw_ver = resp.device_info.get("firmware_version") or "v1.2.0"
        now = datetime.now(timezone.utc)
        
        result = await db.execute(select(Device).where(Device.device_identifier == dev_id))
        device = result.scalar_one_or_none()
        if device:
            device.status = "ONLINE"
            device.last_seen_at = now
            device.device_role = role
            device.firmware_version = fw_ver
        else:
            new_device = Device(
                device_identifier=dev_id,
                device_role=role,
                hardware_model="ESP32",
                firmware_version=fw_ver,
                status="ONLINE",
                last_seen_at=now,
            )
            db.add(new_device)
        await db.commit()

    return resp

from app.schemas.schemas import SerialConnectRequest, SerialDisconnectRequest, SerialRoleAssignRequest
from app.services.serial_manager import serial_manager

@router.get("/serial/config")
def get_serial_role_config():
    """
    Returns current persistent role-to-port bindings and active connection states.
    """
    return {
        "assigned_ports": serial_manager.assigned_ports,
        "active_ports": list(serial_manager.active_connections.keys())
    }

@router.post("/serial/assign")
async def assign_serial_roles(req: SerialRoleAssignRequest, db: AsyncSession = Depends(get_db)):
    """
    Configures and optionally auto-connects COM ports for CAN Receiver and Vehicle Simulator.
    Enforces validation, excludes Bluetooth ports, and prevents port collisions.
    """
    try:
        result = serial_manager.assign_roles(
            receiver_port=req.receiver_port,
            simulator_port=req.simulator_port,
            auto_connect=req.auto_connect
        )
        now = datetime.now(timezone.utc)
        # Ensure gateway device in database if receiver assigned
        if req.receiver_port:
            gw_res = await db.execute(select(Device).where(Device.device_identifier == "apex-gateway-001"))
            gw_dev = gw_res.scalar_one_or_none()
            if not gw_dev:
                db.add(Device(
                    device_identifier="apex-gateway-001",
                    device_role="GATEWAY",
                    hardware_model="ESP32",
                    status="ONLINE" if req.auto_connect else "OFFLINE",
                    last_seen_at=now
                ))
            else:
                if req.auto_connect:
                    gw_dev.status = "ONLINE"
                    gw_dev.last_seen_at = now
            await db.commit()

        return {
            "success": True,
            **result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/serial/connect")
async def connect_serial_port(req: SerialConnectRequest, db: AsyncSession = Depends(get_db)):
    """
    Explicitly connects a designated ESP32 role (CAN Receiver or Vehicle Simulator)
    to a specific host COM port with single ownership.
    """
    success, msg = serial_manager.connect_device(
        port=req.port,
        target_role=req.target_role,
        baudrate=req.baudrate
    )
    if success:
        now = datetime.now(timezone.utc)
        dev_id = "apex-gateway-001" if req.target_role == "can_receiver" else "apex-vehicle-simulator-01"
        dev_role = "GATEWAY" if req.target_role == "can_receiver" else "SIMULATOR"
        res = await db.execute(select(Device).where(Device.device_identifier == dev_id))
        dev = res.scalar_one_or_none()
        if dev:
            dev.status = "ONLINE"
            dev.last_seen_at = now
        else:
            db.add(Device(
                device_identifier=dev_id,
                device_role=dev_role,
                hardware_model="ESP32",
                firmware_version="v1.0.0",
                status="ONLINE",
                last_seen_at=now
            ))
        await db.commit()

    return {
        "success": success,
        "port": req.port,
        "role": req.target_role,
        "message": msg
    }

@router.post("/serial/disconnect")
async def disconnect_serial_port(req: SerialDisconnectRequest, db: AsyncSession = Depends(get_db)):
    """
    Cleanly disconnects the serial handle for a specified port or role without resetting hardware.
    """
    success = serial_manager.disconnect_device(
        port=req.port,
        target_role=req.target_role
    )
    if success and req.target_role == "can_receiver":
        res = await db.execute(select(Device).where(Device.device_identifier == "apex-gateway-001"))
        dev = res.scalar_one_or_none()
        if dev:
            dev.status = "OFFLINE"
            await db.commit()

    return {
        "success": success,
        "port": req.port,
        "role": req.target_role,
        "message": "Disconnected cleanly." if success else "Port or role was not actively open."
    }

@router.get("/can", response_model=SubsystemDiagnostic)
async def get_can_bus_diagnostics():
    """
    Returns specific diagnostics for the CAN bus subsystem (TWAI controller, traffic, frame stats).
    """
    return await diagnostics_service.evaluate_can_bus()

@router.get("/logger", response_model=SubsystemDiagnostic)
async def get_logger_diagnostics():
    """
    Returns specific identity and heartbeat diagnostics for ESP32 Logger #1.
    """
    return await diagnostics_service.evaluate_esp32_logger_identity()

@router.get("/gateway", response_model=SubsystemDiagnostic)
async def get_gateway_diagnostics():
    """
    Returns specific diagnostics for ESP32 Gateway #2.
    """
    return await diagnostics_service.evaluate_esp32_gateway_identity()

@router.post("/run", response_model=OverallDiagnosticsResponse)
async def run_diagnostics():
    """
    Triggers an immediate fresh evaluation of all diagnostic subsystems.
    """
    return await diagnostics_service.get_full_diagnostics()
