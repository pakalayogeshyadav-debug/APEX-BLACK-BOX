import asyncio
import logging
import os
import time
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from sqlalchemy import select, text

from app.core.database import AsyncSessionLocal
from app.models.models import Device, TelemetrySession
from app.services.ingestion import ingestion_service
from app.services.device_adapter import device_adapter
from app.schemas.schemas import (
    DiagnosticStatusType,
    SubsystemDiagnostic,
    SerialPortInfo,
    SerialProbeResponse,
    OverallDiagnosticsResponse
)

logger = logging.getLogger(__name__)

# Known ESP32 USB-UART Bridge Vendor/Product IDs
KNOWN_ESP32_VID_PIDS = {
    (0x10C4, 0xEA60): "Silicon Labs CP210x",
    (0x1A86, 0x7523): "WCH CH340",
    (0x1A86, 0x55D4): "WCH CH9102",
    (0x0403, 0x6001): "FTDI FT232R",
    (0x0403, 0x6010): "FTDI FT2232",
    (0x0403, 0x6015): "FTDI FT-X",
    (0x303A, 0x1001): "Espressif USB JTAG/serial",
    (0x303A, 0x1002): "Espressif USB Bridge",
    (0x303A, 0x0002): "Espressif ESP32-S2 USB",
    (0x303A, 0x0003): "Espressif ESP32-S3 USB",
}

from app.services.serial_manager import serial_manager

class DiagnosticsService:
    def __init__(self):
        self.heartbeat_timeout_sec: float = 10.0
        self.telemetry_stale_sec: float = 4.0
        self.telemetry_offline_sec: float = 15.0
        self.serial_probe_timeout_sec: float = 1.0

    def enumerate_serial_ports(self) -> List[SerialPortInfo]:
        """
        Discovers serial/COM ports available on the host system without opening them.
        Uses serial_manager for passive discovery and busy status tracking.
        """
        return serial_manager.enumerate_serial_ports()

    def probe_serial_port(self, port: str, baudrate: int = 115200, timeout_sec: float = 1.0) -> SerialProbeResponse:
        """
        Safely probes a specific selected port with an identity query.
        Ensures port handle is unconditionally closed upon completion.
        """
        res = serial_manager.probe_port(port, baudrate=baudrate, timeout_sec=timeout_sec)
        return SerialProbeResponse(
            port=res["port"],
            status=res["status"],
            device_verified=res["device_verified"],
            device_info=res.get("device_info"),
            message=res["message"]
        )

    async def evaluate_backend_health(self) -> SubsystemDiagnostic:
        now = datetime.now(timezone.utc)
        return SubsystemDiagnostic(
            name="Backend Process",
            status="CONNECTED",
            last_checked=now,
            details={
                "service": "APEX_BLACKBOX_BACKEND",
                "framework": "FastAPI",
                "python_pid": os.getpid(),
                "queue_pending_items": ingestion_service.queue.qsize(),
                "total_packets_ingested": ingestion_service.latest_stats["total_received_packets"]
            }
        )

    async def evaluate_database_health(self) -> SubsystemDiagnostic:
        now = datetime.now(timezone.utc)
        status_val: DiagnosticStatusType = "DISCONNECTED"
        error_msg = None
        details: Dict[str, Any] = {"engine": "MySQL", "port": 3306}

        try:
            async with asyncio.timeout(2.0):
                async with AsyncSessionLocal() as session:
                    res = await session.execute(text("SELECT 1"))
                    if res.scalar() == 1:
                        status_val = "CONNECTED"
                        details["query_status"] = "OK"
                        
                        # Count registered devices
                        dev_count_res = await session.execute(text("SELECT COUNT(1) FROM devices"))
                        details["registered_devices"] = dev_count_res.scalar()
        except asyncio.TimeoutError:
            status_val = "ERROR"
            error_msg = "Database query timed out (> 2.0s)"
        except Exception as e:
            status_val = "ERROR"
            error_msg = "Database connectivity or query failure"

        return SubsystemDiagnostic(
            name="MySQL Database",
            status=status_val,
            last_checked=now,
            details=details,
            error=error_msg
        )

    async def evaluate_serial_diagnostics(self) -> SubsystemDiagnostic:
        now = datetime.now(timezone.utc)
        ports = self.enumerate_serial_ports()
        
        if not ports:
            return SubsystemDiagnostic(
                name="USB / Serial Interface",
                status="NOT_CONFIGURED",
                last_checked=now,
                details={
                    "available_ports_count": 0,
                    "ports": []
                },
                error="No host COM/serial ports detected."
            )

        esp_ports = [p.port for p in ports if p.is_probable_esp32]
        status_val: DiagnosticStatusType = "DEGRADED" if esp_ports else "DISCONNECTED"

        return SubsystemDiagnostic(
            name="USB / Serial Interface",
            status=status_val,
            last_checked=now,
            details={
                "pyserial_available": True,
                "available_ports_count": len(ports),
                "ports": [p.model_dump() for p in ports],
                "probable_esp32_ports": esp_ports,
                "verified_active_port": None
            },
            error=None if esp_ports else "Detected serial ports, but none have verified ESP32 VID/PID."
        )

    async def evaluate_esp32_logger_identity(self) -> SubsystemDiagnostic:
        now = datetime.now(timezone.utc)
        stats = ingestion_service.latest_stats
        is_sim_mode = stats["last_source_mode"] == "SIMULATION"

        async with AsyncSessionLocal() as session:
            res = await session.execute(
                select(Device).where(Device.device_role == "LOGGER").order_by(Device.last_seen_at.desc()).limit(1)
            )
            logger_dev = res.scalar_one_or_none()

        if not logger_dev:
            return SubsystemDiagnostic(
                name="ESP32 Logger",
                status="UNKNOWN",
                last_checked=now,
                details={"configured": False},
                error="No Logger device registered in database."
            )

        details = {
            "device_identifier": logger_dev.device_identifier,
            "hardware_model": logger_dev.hardware_model,
            "firmware_version": logger_dev.firmware_version or "v1.2",
            "last_seen_db": logger_dev.last_seen_at.isoformat() if logger_dev.last_seen_at else None,
            "source_mode": stats["last_source_mode"] or "NONE",
            "is_simulated": is_sim_mode
        }

        # Freshness evaluation
        last_pkt_time = stats["last_packet_time"]
        if last_pkt_time:
            age_sec = (now - last_pkt_time).total_seconds()
            details["packet_age_sec"] = round(age_sec, 2)
            if age_sec < self.telemetry_stale_sec:
                status_val: DiagnosticStatusType = "SIMULATED" if is_sim_mode else "CONNECTED"
            elif age_sec < self.telemetry_offline_sec:
                status_val = "DEGRADED"
            else:
                status_val = "DISCONNECTED"
        else:
            status_val = "DISCONNECTED"

        return SubsystemDiagnostic(
            name="ESP32 Logger",
            status=status_val,
            last_checked=now,
            details=details,
            error="Operating under simulation adapter; physical hardware not attached." if is_sim_mode else None
        )

    async def evaluate_esp32_gateway_identity(self) -> SubsystemDiagnostic:
        now = datetime.now(timezone.utc)
        from app.services.serial_manager import serial_manager
        rx_diag = serial_manager.get_role_diagnostic("can_receiver", "ESP32 Gateway / Receiver")

        async with AsyncSessionLocal() as session:
            res = await session.execute(
                select(Device).where(Device.device_role == "GATEWAY").order_by(Device.last_seen_at.desc()).limit(1)
            )
            gw_dev = res.scalar_one_or_none()

            details = {
                "device_identifier": gw_dev.device_identifier if gw_dev else "apex-gateway-001",
                "hardware_model": gw_dev.hardware_model if gw_dev else "ESP32",
                "serial_port": rx_diag.port,
                "serial_status": rx_diag.status,
                "device_verified": rx_diag.device_verified,
                "can_frames_received": rx_diag.can_frames_received,
                "last_message_at": rx_diag.last_message_at.isoformat() if rx_diag.last_message_at else None
            }

            if rx_diag.status == "CONNECTED":
                if rx_diag.last_message_at and (now - rx_diag.last_message_at).total_seconds() < self.telemetry_offline_sec:
                    status_val = "CONNECTED"
                    error_msg = None
                    if gw_dev:
                        gw_dev.status = "ONLINE"
                        gw_dev.last_seen_at = now
                        await session.commit()
                else:
                    status_val = "DEGRADED"
                    error_msg = "Gateway serial connection active but no frames received recently (>10s)."
            elif rx_diag.status == "BUSY":
                status_val = "BUSY"
                error_msg = rx_diag.last_error or "Gateway serial port is busy."
            elif rx_diag.status == "ERROR":
                status_val = "ERROR"
                error_msg = rx_diag.last_error or "Gateway serial connection error."
            elif rx_diag.status == "NOT_CONFIGURED":
                status_val = "NOT_CONFIGURED"
                error_msg = "Gateway / CAN receiver serial port not selected or configured."
            else:
                status_val = "DISCONNECTED"
                error_msg = "Gateway disconnected. Select COM port and connect to begin ingestion."
                if gw_dev and gw_dev.status != "OFFLINE":
                    gw_dev.status = "OFFLINE"
                    await session.commit()

            return SubsystemDiagnostic(
                name="ESP32 Gateway",
                status=status_val,
                last_checked=now,
                details=details,
                error=error_msg
            )

    async def evaluate_logger_to_gateway_link(self) -> SubsystemDiagnostic:
        now = datetime.now(timezone.utc)
        stats = ingestion_service.latest_stats

        # In current repository, inter-ESP32 link physical transport is pending
        is_sim_adapter = "Simulator" in device_adapter.__class__.__name__

        details = {
            "protocol": "UART / ESP-NOW (Architecture Planned)",
            "adapter": device_adapter.__class__.__name__,
            "packet_drops": stats["last_dropped_frame_count"] or 0,
            "last_sequence_number": stats["last_sequence_number"]
        }

        if is_sim_adapter and stats["last_packet_time"]:
            age_sec = (now - stats["last_packet_time"]).total_seconds()
            if age_sec < self.telemetry_offline_sec:
                return SubsystemDiagnostic(
                    name="Logger-to-Gateway Link",
                    status="SIMULATED",
                    last_checked=now,
                    details=details,
                    error="Link synthesized via SimulatorDeviceAdapter; physical wire protocol unverified."
                )

        return SubsystemDiagnostic(
            name="Logger-to-Gateway Link",
            status="NOT_CONFIGURED",
            last_checked=now,
            details=details,
            error="Inter-ESP32 physical link (UART/ESP-NOW) not detected or firmware absent."
        )

    async def evaluate_can_bus(self) -> SubsystemDiagnostic:
        now = datetime.now(timezone.utc)
        stats = ingestion_service.latest_stats
        from app.services.can_decoder import can_decoder_service
        can_cfg = can_decoder_service.config
        can_stats = can_decoder_service.stats

        details = {
            "controller_architecture": "ESP32 TWAI (Two-Wire Automotive Interface)",
            "transceiver_profile": can_cfg.transceiver_profile,
            "bitrate_kbps": can_cfg.bitrate // 1000,
            "mode": can_cfg.mode,
            "tx_gpio": can_cfg.tx_gpio,
            "rx_gpio": can_cfg.rx_gpio,
            "total_frames_received": can_stats["total_frames_received"] or stats["last_can_frame_count"] or 0,
            "standard_frames": can_stats["standard_frames_count"],
            "extended_frames": can_stats["extended_frames_count"],
            "dropped_frames": stats["last_dropped_frame_count"] or 0,
            "supply_voltage": "3.3V" if can_cfg.transceiver_profile == "SN65HVD230" else "5.0V",
            "level_shifter_warning": "CRITICAL: 5V RXD output requires level divider to avoid 3.3V GPIO damage!" if can_cfg.transceiver_profile == "TJA1050" else None
        }

        # Distinguish:
        # 1. CAN hardware configured -> True
        # 2. CAN controller initialized -> Known from model
        # 3. CAN traffic observed -> Requires frames > 0 and fresh timestamp
        last_pkt_time = can_stats["last_received_utc"] or stats["last_packet_time"]
        if last_pkt_time:
            age_sec = (now - last_pkt_time).total_seconds()
            details["traffic_age_sec"] = round(age_sec, 2)
            
            if stats["last_source_mode"] == "SIMULATION" and can_stats["total_frames_received"] == 0:
                return SubsystemDiagnostic(
                    name="CAN Bus Subsystem",
                    status="SIMULATED",
                    last_checked=now,
                    details=details,
                    error="Traffic synthesized by simulation service, physical CAN transceiver unverified."
                )
            elif details["total_frames_received"] > 0 and age_sec < self.telemetry_offline_sec:
                return SubsystemDiagnostic(
                    name="CAN Bus Subsystem",
                    status="CONNECTED",
                    last_checked=now,
                    details=details
                )
            else:
                return SubsystemDiagnostic(
                    name="CAN Bus Subsystem",
                    status="DEGRADED",
                    last_checked=now,
                    details=details,
                    error="No CAN traffic observed on bus within the monitoring interval (bus quiet or cable disconnected)."
                )

        return SubsystemDiagnostic(
            name="CAN Bus Subsystem",
            status="DISCONNECTED",
            last_checked=now,
            details=details,
            error="No CAN telemetry frames have been ingested (CAN bus quiet or awaiting traffic)."
        )

    async def evaluate_gateway_to_backend_link(self) -> SubsystemDiagnostic:
        now = datetime.now(timezone.utc)
        stats = ingestion_service.latest_stats
        
        details = {
            "transport_protocol": "HTTP REST (port 8000) & WebSocket (/ws/telemetry)",
            "packets_received": stats["total_received_packets"]
        }

        last_pkt_time = stats["last_packet_time"]
        if last_pkt_time:
            age_sec = (now - last_pkt_time).total_seconds()
            details["last_ingress_age_sec"] = round(age_sec, 2)
            
            if stats["last_source_mode"] == "SIMULATION":
                return SubsystemDiagnostic(
                    name="Gateway-to-Backend Link",
                    status="SIMULATED",
                    last_checked=now,
                    details=details
                )
            elif age_sec < self.telemetry_stale_sec:
                return SubsystemDiagnostic(
                    name="Gateway-to-Backend Link",
                    status="CONNECTED",
                    last_checked=now,
                    details=details
                )
            elif age_sec < self.telemetry_offline_sec:
                return SubsystemDiagnostic(
                    name="Gateway-to-Backend Link",
                    status="DEGRADED",
                    last_checked=now,
                    details=details,
                    error="Gateway telemetry ingress is stalling."
                )

        return SubsystemDiagnostic(
            name="Gateway-to-Backend Link",
            status="DISCONNECTED",
            last_checked=now,
            details=details,
            error="No active ingress stream from gateway."
        )

    async def evaluate_telemetry_reception(self) -> SubsystemDiagnostic:
        now = datetime.now(timezone.utc)
        stats = ingestion_service.latest_stats

        last_pkt_time = stats["last_packet_time"]
        details = {
            "total_packets": stats["total_received_packets"],
            "last_sequence_number": stats["last_sequence_number"],
            "last_packet_time": last_pkt_time.isoformat() if last_pkt_time else None
        }

        if not last_pkt_time:
            return SubsystemDiagnostic(
                name="Telemetry Reception",
                status="DISCONNECTED",
                last_checked=now,
                details=details,
                error="Waiting for incoming telemetry packets."
            )

        age_sec = (now - last_pkt_time).total_seconds()
        details["stream_age_sec"] = round(age_sec, 2)

        if age_sec < self.telemetry_stale_sec:
            status_val: DiagnosticStatusType = "SIMULATED" if stats["last_source_mode"] == "SIMULATION" else "CONNECTED"
            err = None
        elif age_sec < self.telemetry_offline_sec:
            status_val = "DEGRADED"
            err = f"Telemetry stream paused ({age_sec:.1f}s since last packet)."
        else:
            status_val = "DISCONNECTED"
            err = f"Telemetry stream offline ({age_sec:.1f}s elapsed)."

        return SubsystemDiagnostic(
            name="Telemetry Reception",
            status=status_val,
            last_checked=now,
            details=details,
            error=err
        )

    async def get_full_diagnostics(self) -> OverallDiagnosticsResponse:
        now = datetime.now(timezone.utc)

        can_receiver_diag = serial_manager.get_role_diagnostic("can_receiver", "CAN Receiver ESP32")
        simulator_diag = serial_manager.get_role_diagnostic("vehicle_simulator", "Vehicle Simulator ESP32")
        
        backend_diag = await self.evaluate_backend_health()
        db_diag = await self.evaluate_database_health()
        serial_diag = await self.evaluate_serial_diagnostics()

        # If any physical device is connected, reflect in serial diagnostic
        active_ports = []
        if can_receiver_diag.status == "CONNECTED" and can_receiver_diag.port:
            active_ports.append(can_receiver_diag.port)
        if simulator_diag.status == "CONNECTED" and simulator_diag.port:
            active_ports.append(simulator_diag.port)
        if active_ports:
            serial_diag.status = "CONNECTED"
            serial_diag.details["verified_active_port"] = active_ports

        logger_diag = await self.evaluate_esp32_logger_identity()
        if can_receiver_diag.status == "CONNECTED":
            logger_diag.status = "CONNECTED"
            if can_receiver_diag.device_id:
                logger_diag.details["device_identifier"] = can_receiver_diag.device_id

        gw_diag = await self.evaluate_esp32_gateway_identity()
        if simulator_diag.status == "CONNECTED":
            gw_diag.status = "CONNECTED"
            if simulator_diag.device_id:
                gw_diag.details["device_identifier"] = simulator_diag.device_id

        link_diag = await self.evaluate_logger_to_gateway_link()
        can_diag = await self.evaluate_can_bus()
        gw_back_diag = await self.evaluate_gateway_to_backend_link()
        telem_diag = await self.evaluate_telemetry_reception()

        detected_ports = self.enumerate_serial_ports()

        return OverallDiagnosticsResponse(
            timestamp=now,
            backend=backend_diag,
            database=db_diag,
            serial_interface=serial_diag,
            esp32_logger=logger_diag,
            esp32_gateway=gw_diag,
            logger_to_gateway=link_diag,
            can_bus=can_diag,
            gateway_to_backend=gw_back_diag,
            telemetry_reception=telem_diag,
            detected_serial_ports=detected_ports,
            can_receiver=can_receiver_diag,
            vehicle_simulator=simulator_diag
        )

diagnostics_service = DiagnosticsService()
