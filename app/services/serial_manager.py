import threading
import time
import json
import logging
import re
import uuid
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from app.schemas.schemas import (
    DiagnosticStatusType,
    ESP32DeviceDiagnostic,
    SerialPortInfo,
    RawCANFrameSchema,
    TelemetryPayload,
    TelemetryData,
    CANStatistics
)
from app.services.ingestion import ingestion_service
from app.services.can_decoder import can_decoder_service

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

STALE_TIMEOUT_SEC = 10.0

# Human-readable CAN frame regex patterns matching real firmware output
RE_ENGINE = re.compile(r'\[ENGINE\s+(?:0x)?100\]\s*Speed=([0-9.]+)\s*km/h\s*\|\s*RPM=([0-9.]+)', re.IGNORECASE)
RE_VEHICLE = re.compile(r'\[VEHICLE\s+(?:0x)?101\]\s*Throttle=([0-9.]+)%\s*\|\s*Coolant=([0-9.-]+)\s*C', re.IGNORECASE)
RE_STATUS = re.compile(r'\[STATUS\s+(?:0x)?102\]\s*Engine\s*load=([0-9.]+)%\s*\|\s*Battery=([0-9.]+)\s*V', re.IGNORECASE)
RE_STATE = re.compile(r'\[STATE\s+(?:0x)?103\]\s*Vehicle=(\w+)\s*\|\s*Brake=([0-9.]+)%', re.IGNORECASE)
RE_SIM_TX = re.compile(r'TX\s*OK\s*\|\s*Speed=([0-9.]+)\s*km/h\s*RPM=([0-9.]+)\s*Throttle=([0-9.]+)%', re.IGNORECASE)

class ManagedSerialConnection:
    """
    Encapsulates a single open serial port and background line reader.
    Ensures safe, single-ownership of the COM port without auto-resetting the ESP32.
    """
    def __init__(self, port: str, target_role: str, baudrate: int = 115200, loop: Optional[asyncio.AbstractEventLoop] = None):
        self.port = port
        self.target_role = target_role
        self.baudrate = baudrate
        self.loop = loop
        self.serial_handle = None
        self.is_running = False
        self.thread: Optional[threading.Thread] = None

        # Device State Tracking
        self.status: DiagnosticStatusType = "DISCONNECTED"
        self.device_id: Optional[str] = None
        self.device_verified: bool = False
        self.firmware_version: Optional[str] = None
        self.protocol_version: Optional[int] = None
        self.uptime_ms: Optional[int] = None
        self.can_status: Optional[str] = "UNVERIFIED"
        self.can_frames_received: int = 0
        self.last_heartbeat_at: Optional[datetime] = None
        self.last_message_at: Optional[datetime] = None
        self.last_successful_comm: Optional[datetime] = None
        self.last_error: Optional[str] = None
        self.received_line_count: int = 0
        self.parsed_json_count: int = 0
        self.malformed_message_count: int = 0
        self.connection_error_count: int = 0
        self.details: Dict[str, Any] = {}

        # Telemetry ingestion coordination
        self.session_id: str = str(uuid.uuid4())
        self.sequence_number: int = 0
        self._last_ingest_time_ms: int = 0
        self.current_telemetry_state: Dict[str, Any] = {
            "speed": None,
            "rpm": None,
            "throttle": None,
            "coolant": None,
            "engine_load": None,
            "battery": None,
            "vehicle_state": None,
            "brake": None
        }

    def open_and_start(self) -> Tuple[bool, str]:
        """
        Safely opens the COM port with DTR/RTS disabled to prevent hardware auto-reset.
        """
        try:
            import serial
        except ImportError:
            self.status = "NOT_CONFIGURED"
            self.last_error = "pyserial library not installed"
            return False, self.last_error

        try:
            # dtr=False, rts=False prevents triggering the ESP32 Auto-Reset circuit
            self.serial_handle = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=1.0,
                write_timeout=1.0,
                dsrdtr=False,
                rtscts=False
            )
            self.serial_handle.dtr = False
            self.serial_handle.rts = False

            self.is_running = True
            self.status = "CONNECTED"
            self.last_successful_comm = datetime.now(timezone.utc)
            self.last_error = None

            # Launch reader thread
            self.thread = threading.Thread(
                target=self._reader_loop,
                name=f"SerialReader-{self.port}",
                daemon=True
            )
            self.thread.start()

            # Transmit identification handshake query
            self.send_identity_query()
            return True, f"Successfully opened {self.port} for {self.target_role}"

        except serial.SerialException as e:
            err_msg = str(e)
            self.connection_error_count += 1
            if "permission" in err_msg.lower() or "access is denied" in err_msg.lower():
                self.status = "BUSY"
                self.last_error = f"Port {self.port} is busy or locked by another process (e.g. Arduino IDE serial monitor)."
            else:
                self.status = "ERROR"
                self.last_error = f"Serial connection error: {err_msg}"
            return False, self.last_error

        except Exception as e:
            self.status = "ERROR"
            self.last_error = f"Unexpected error opening port {self.port}: {e}"
            self.connection_error_count += 1
            return False, self.last_error

    def send_identity_query(self) -> bool:
        """
        Sends safe structured handshake queries without toggling reset lines.
        """
        if not self.serial_handle or not self.serial_handle.is_open:
            return False
        try:
            # Send structured JSON handshake query + legacy DIAG_PING
            query = b'{"cmd":"IDENTIFY","type":"device_query"}\n{"cmd":"DIAG_PING"}\n'
            self.serial_handle.write(query)
            self.serial_handle.flush()
            return True
        except Exception as e:
            self.last_error = f"Failed to send identity query: {e}"
            return False

    def close(self):
        """Cleanly terminates worker thread and closes serial port handle."""
        self.is_running = False
        if self.serial_handle:
            try:
                self.serial_handle.close()
            except Exception:
                pass
            self.serial_handle = None
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.5)
        self.status = "DISCONNECTED"

    def _reader_loop(self):
        """Worker loop reading lines and dispatching JSON message handlers."""
        while self.is_running and self.serial_handle and self.serial_handle.is_open:
            try:
                line_bytes = self.serial_handle.readline()
                if not line_bytes:
                    continue

                line_str = line_bytes.decode('utf-8', errors='replace').strip()
                if not line_str:
                    continue

                self.received_line_count += 1
                self.last_message_at = datetime.now(timezone.utc)
                self.last_successful_comm = datetime.now(timezone.utc)

                self._process_message_line(line_str)

            except Exception as e:
                if self.is_running:
                    self.connection_error_count += 1
                    self.last_error = f"Read error on {self.port}: {e}"
                    logger.warning(f"Error reading from {self.port}: {e}")
                    time.sleep(0.1)

    def _dispatch_telemetry(self):
        """Dispatches verified telemetry to the existing ingestion service and live WebSocket."""
        if self.target_role != "can_receiver":
            return
        now_ms = int(time.time() * 1000)
        # Throttle dispatch to max ~20 Hz (50ms interval) for silky smooth frontend rendering
        if now_ms - self._last_ingest_time_ms < 50:
            return
        self._last_ingest_time_ms = now_ms
        self.sequence_number += 1

        speed = self.current_telemetry_state.get("speed")
        rpm = self.current_telemetry_state.get("rpm")
        throttle = self.current_telemetry_state.get("throttle")

        # Do not dispatch empty payloads
        if speed is None and rpm is None and throttle is None:
            return

        payload = TelemetryPayload(
            schema_version=1,
            device_id=self.device_id or "apex-gateway-001",
            session_id=self.session_id,
            sequence_number=self.sequence_number,
            device_timestamp_ms=now_ms,
            source_mode="LIVE",
            telemetry=TelemetryData(
                vehicle_speed_kmh=speed,
                engine_rpm=rpm,
                throttle_percent=throttle,
                deceleration_mps2=None  # Explicitly None - never fabricated!
            ),
            can_statistics=CANStatistics(
                received_frames=self.can_frames_received,
                dropped_frames=0
            )
        )

        loop = self.loop or getattr(serial_manager, "loop", None)
        if loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(ingestion_service.ingest(payload), loop)

    def _process_message_line(self, line: str):
        """Parses messages emitted by the ESP32 firmware (both JSON and real CAN frame lines)."""
        now = datetime.now(timezone.utc)
        self.last_message_at = now
        self.last_successful_comm = now

        # Case 1: Structured JSON message
        if line.startswith('{') and line.endswith('}'):
            try:
                data = json.loads(line)
                if not isinstance(data, dict):
                    return
                self.parsed_json_count += 1
            except json.JSONDecodeError:
                self.malformed_message_count += 1
                self.details["last_malformed_sample"] = line[:100]
                return

            msg_type = data.get("type", "").lower()

            # 1. Device Hello / Identity Message
            if msg_type == "device_hello" or "device_id" in data or "role" in data:
                self.device_id = data.get("device_id") or self.device_id
                self.firmware_version = str(data.get("firmware_version", "")) or self.firmware_version
                self.protocol_version = data.get("protocol_version") or self.protocol_version
                self.uptime_ms = data.get("uptime_ms") or self.uptime_ms
                reported_role = data.get("role", "").lower()

                if reported_role:
                    self.details["reported_role"] = reported_role
                self.device_verified = True
                self.status = "CONNECTED"
                self.last_heartbeat_at = now
                self.details["identity_payload"] = data

            # 2. Heartbeat Message
            elif msg_type == "heartbeat":
                self.last_heartbeat_at = now
                self.uptime_ms = data.get("uptime_ms") or self.uptime_ms
                if "can_status" in data:
                    self.can_status = str(data.get("can_status")).upper()
                if "frames_received" in data:
                    self.can_frames_received = int(data.get("frames_received", 0))

            # 3. CAN Telemetry / Frame Message
            elif msg_type in ["can_frame", "telemetry"] or "can_id" in data:
                self.can_frames_received += 1
                self.can_status = "OK"
                can_id_val = int(data.get("can_id", 0))
                self.details["last_can_id"] = can_id_val

                # Ingest raw hex payload if present (from esp32_can_receiver)
                raw_hex = data.get("data")
                if isinstance(raw_hex, str) and raw_hex:
                    clean_hex = raw_hex.strip().replace(" ", "").upper()
                    dlc_val = int(data.get("dlc", len(clean_hex) // 2))
                    try:
                        raw_frame = RawCANFrameSchema(
                            timestamp_us=int(now.timestamp() * 1000000),
                            sequence_number=self.can_frames_received,
                            is_extended=can_id_val > 0x7FF,
                            is_remote=False,
                            can_id=can_id_val,
                            dlc=dlc_val,
                            payload_bytes=clean_hex,
                            channel_id=0,
                            status="VALID"
                        )
                        can_decoder_service.ingest_raw_frame(raw_frame)
                        signals = can_decoder_service.latest_signals
                        if signals["vehicle_speed"].is_valid and signals["vehicle_speed"].value is not None:
                            self.current_telemetry_state["speed"] = signals["vehicle_speed"].value
                        if signals["engine_rpm"].is_valid and signals["engine_rpm"].value is not None:
                            self.current_telemetry_state["rpm"] = int(signals["engine_rpm"].value)
                        if signals["throttle_position"].is_valid and signals["throttle_position"].value is not None:
                            self.current_telemetry_state["throttle"] = signals["throttle_position"].value
                        if signals["engine_coolant_temp"].is_valid and signals["engine_coolant_temp"].value is not None:
                            self.current_telemetry_state["coolant"] = signals["engine_coolant_temp"].value
                    except Exception as ex:
                        logger.debug(f"Could not parse CAN frame payload: {ex}")

                # Direct telemetry values if emitted as top-level fields
                if "speed" in data or "vehicle_speed_kmh" in data:
                    self.current_telemetry_state["speed"] = float(data.get("speed") or data.get("vehicle_speed_kmh"))
                if "rpm" in data or "engine_rpm" in data:
                    self.current_telemetry_state["rpm"] = int(float(data.get("rpm") or data.get("engine_rpm")))
                if "throttle" in data or "throttle_percent" in data:
                    self.current_telemetry_state["throttle"] = float(data.get("throttle") or data.get("throttle_percent"))
                self._dispatch_telemetry()

            return

        # Case 2: Human-readable line output from physical firmware
        self.details["last_raw_line"] = line[:120]

        # 2A. Banner Identification
        low_line = line.lower()
        if "receiver" in low_line or "esp32 #2" in low_line:
            self.device_id = self.device_id or "apex-gateway-001"
            self.firmware_version = self.firmware_version or "v1.0.0"
            self.device_verified = True
            self.status = "CONNECTED"
            self.details["identified_banner"] = line[:80]
        elif "simulator" in low_line or "esp32 #1" in low_line:
            self.device_id = self.device_id or "apex-vehicle-simulator-01"
            self.firmware_version = self.firmware_version or "v1.0.0"
            self.device_verified = True
            self.status = "CONNECTED"
            self.details["identified_banner"] = line[:80]

        # 2B. Frame 0x100: Speed and RPM
        m_eng = RE_ENGINE.search(line)
        if m_eng:
            speed = float(m_eng.group(1))
            rpm = int(float(m_eng.group(2)))
            self.current_telemetry_state["speed"] = speed
            self.current_telemetry_state["rpm"] = rpm
            self.can_frames_received += 1
            self.can_status = "OK"
            self.parsed_json_count += 1
            self.device_verified = True

            can_decoder_service.update_signal("vehicle_speed", speed, "km/h", 0x100)
            can_decoder_service.update_signal("engine_rpm", float(rpm), "RPM", 0x100)

            # Ingest into Mode A raw CAN buffer
            sp_b = int(speed) & 0xFF
            r_b1 = (rpm >> 8) & 0xFF
            r_b2 = rpm & 0xFF
            can_decoder_service.ingest_raw_frame(RawCANFrameSchema(
                timestamp_us=int(now.timestamp() * 1000000),
                sequence_number=self.can_frames_received,
                can_id=0x100,
                is_extended=False,
                dlc=8,
                payload_bytes=f"{sp_b:02X}00{r_b1:02X}{r_b2:02X}00000000"
            ))
            self._dispatch_telemetry()
            return

        # 2C. Frame 0x101: Throttle and Coolant
        m_veh = RE_VEHICLE.search(line)
        if m_veh:
            throttle = float(m_veh.group(1))
            coolant = float(m_veh.group(2))
            self.current_telemetry_state["throttle"] = throttle
            self.current_telemetry_state["coolant"] = coolant
            self.can_frames_received += 1
            self.can_status = "OK"
            self.parsed_json_count += 1
            self.device_verified = True

            can_decoder_service.update_signal("throttle_position", throttle, "%", 0x101)
            can_decoder_service.update_signal("engine_coolant_temp", coolant, "°C", 0x101)

            th_b = int(throttle) & 0xFF
            co_b = int(coolant) & 0xFF
            can_decoder_service.ingest_raw_frame(RawCANFrameSchema(
                timestamp_us=int(now.timestamp() * 1000000),
                sequence_number=self.can_frames_received,
                can_id=0x101,
                is_extended=False,
                dlc=8,
                payload_bytes=f"{th_b:02X}{co_b:02X}000000000000"
            ))
            self._dispatch_telemetry()
            return

        # 2D. Frame 0x102: Engine Load and Battery Voltage
        m_stat = RE_STATUS.search(line)
        if m_stat:
            load = float(m_stat.group(1))
            batt = float(m_stat.group(2))
            self.current_telemetry_state["engine_load"] = load
            self.current_telemetry_state["battery"] = batt
            self.can_frames_received += 1
            self.parsed_json_count += 1
            self.device_verified = True

            ld_b = int(load) & 0xFF
            bv_int = int(batt * 100)
            b_b1 = (bv_int >> 8) & 0xFF
            b_b2 = bv_int & 0xFF
            can_decoder_service.ingest_raw_frame(RawCANFrameSchema(
                timestamp_us=int(now.timestamp() * 1000000),
                sequence_number=self.can_frames_received,
                can_id=0x102,
                is_extended=False,
                dlc=8,
                payload_bytes=f"{ld_b:02X}{b_b1:02X}{b_b2:02X}0000000000"
            ))
            return

        # 2E. Frame 0x103: Vehicle State and Brake
        m_state = RE_STATE.search(line)
        if m_state:
            v_state = m_state.group(1)
            brake = float(m_state.group(2))
            self.current_telemetry_state["vehicle_state"] = v_state
            self.current_telemetry_state["brake"] = brake
            self.can_frames_received += 1
            self.parsed_json_count += 1
            self.device_verified = True

            br_b = int(brake) & 0xFF
            can_decoder_service.ingest_raw_frame(RawCANFrameSchema(
                timestamp_us=int(now.timestamp() * 1000000),
                sequence_number=self.can_frames_received,
                can_id=0x103,
                is_extended=False,
                dlc=8,
                payload_bytes=f"01{br_b:02X}000000000000"
            ))
            return

        # 2F. Simulator Transmission Confirmation
        m_sim = RE_SIM_TX.search(line)
        if m_sim:
            if self.target_role == "vehicle_simulator":
                self.can_status = "SIMULATOR_TRANSMITTING"
                self.can_frames_received += 1
                self.parsed_json_count += 1
                self.device_verified = True

    def get_diagnostic(self, display_name: str) -> ESP32DeviceDiagnostic:
        """Constructs an accurate snapshot of the device's diagnostic state."""
        now = datetime.now(timezone.utc)
        current_status = self.status

        # Freshness Check: mark STALE if connected but silent for > STALE_TIMEOUT_SEC
        if current_status == "CONNECTED":
            if self.last_message_at:
                silent_sec = (now - self.last_message_at).total_seconds()
                if silent_sec > STALE_TIMEOUT_SEC:
                    current_status = "STALE"
            else:
                current_status = "UNKNOWN"

        can_state = self.can_status
        if self.target_role == "vehicle_simulator":
            can_state = "SIMULATOR_TRANSMITTING" if self.status == "CONNECTED" else "STOPPED"
        elif self.target_role == "can_receiver":
            if current_status == "CONNECTED" and self.can_frames_received == 0 and can_state in ["UNVERIFIED", None]:
                can_state = "QUIET / NO_TRAFFIC"

        return ESP32DeviceDiagnostic(
            name=display_name,
            role=self.target_role,
            status=current_status,
            port=self.port,
            device_id=self.device_id if self.device_verified else None,
            device_verified=self.device_verified,
            firmware_version=self.firmware_version,
            protocol_version=self.protocol_version,
            uptime_ms=self.uptime_ms,
            can_status=can_state,
            can_frames_received=self.can_frames_received,
            last_heartbeat_at=self.last_heartbeat_at,
            last_message_at=self.last_message_at,
            last_successful_comm=self.last_successful_comm,
            last_error=self.last_error,
            received_line_count=self.received_line_count,
            parsed_json_count=self.parsed_json_count,
            malformed_message_count=self.malformed_message_count,
            connection_error_count=self.connection_error_count,
            details=self.details
        )


class SerialManager:
    """
    Central manager for USB-Serial ports and ESP32 device lifecycles.
    Enforces single-ownership, prevents double opens, and coordinates diagnostics.
    """
    def __init__(self):
        self.lock = threading.RLock()
        self.active_connections: Dict[str, ManagedSerialConnection] = {}
        # Track persistent port associations for the two target roles
        self.assigned_ports: Dict[str, Optional[str]] = {
            "can_receiver": None,
            "vehicle_simulator": None
        }
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        # Last known port busy states to avoid aggressive repeated probing
        self._port_busy_cache: Dict[str, Tuple[bool, float]] = {}

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        """Registers the main FastAPI asyncio event loop for threadsafe telemetry ingestion."""
        self.loop = loop
        with self.lock:
            for conn in self.active_connections.values():
                conn.loop = loop

    def assign_roles(
        self,
        receiver_port: Optional[str] = None,
        simulator_port: Optional[str] = None,
        auto_connect: bool = False
    ) -> Dict[str, Any]:
        """
        Configures COM port assignments for CAN receiver and Vehicle Simulator.
        Enforces single ownership, prevents port collision, and excludes Bluetooth ports.
        """
        with self.lock:
            if receiver_port and simulator_port and receiver_port == simulator_port:
                raise ValueError(f"Cannot assign the same port {receiver_port} to both receiver and simulator.")

            ports_info = {p.port: p for p in self.enumerate_serial_ports()}
            for p, name in [(receiver_port, "CAN Receiver"), (simulator_port, "Vehicle Simulator")]:
                if p and p in ports_info and ports_info[p].is_bluetooth:
                    raise ValueError(f"Port {p} is a Bluetooth serial link and cannot be selected as {name}.")

            if receiver_port is not None:
                self.assigned_ports["can_receiver"] = receiver_port
            if simulator_port is not None:
                self.assigned_ports["vehicle_simulator"] = simulator_port

        res_conn = {}
        if auto_connect:
            if receiver_port:
                ok, msg = self.connect_device(receiver_port, "can_receiver")
                res_conn["can_receiver"] = {"success": ok, "message": msg}
            if simulator_port:
                ok, msg = self.connect_device(simulator_port, "vehicle_simulator")
                res_conn["vehicle_simulator"] = {"success": ok, "message": msg}

        return {
            "assigned_ports": dict(self.assigned_ports),
            "connections": res_conn
        }

    def enumerate_serial_ports(self) -> List[SerialPortInfo]:
        """
        Passive discovery of host COM ports using pyserial.
        Distinguishes ESP32 bridges, Bluetooth links, and busy ports without resetting hardware.
        """
        detected: List[SerialPortInfo] = []
        now = datetime.now(timezone.utc)
        now_ts = time.time()

        try:
            import serial.tools.list_ports
            ports = serial.tools.list_ports.comports()
            for p in ports:
                port_name = p.device
                desc = p.description or "Unknown Serial Port"
                hwid = p.hwid or "N/A"
                mfg = p.manufacturer
                vid = p.vid
                pid = p.pid

                is_esp = False
                device_type = "Standard Serial"

                # Check known ESP32 USB Bridge VID/PID
                if vid is not None and pid is not None and (vid, pid) in KNOWN_ESP32_VID_PIDS:
                    is_esp = True
                    desc = f"{desc} [{KNOWN_ESP32_VID_PIDS[(vid, pid)]}]"
                    device_type = "ESP32"

                low_desc = desc.lower()
                low_hwid = hwid.lower()

                if "cp210" in low_desc or "ch340" in low_desc or "espressif" in low_desc or "wch" in low_desc:
                    is_esp = True
                    device_type = "ESP32"

                is_bt = "bthenum" in low_hwid or "bluetooth" in low_desc
                if is_bt:
                    device_type = "Bluetooth"
                    is_esp = False

                # Check if port is currently marked busy
                is_busy = False
                with self.lock:
                    if port_name in self.active_connections:
                        is_busy = True
                    elif port_name in self._port_busy_cache:
                        cached_busy, cached_time = self._port_busy_cache[port_name]
                        if now_ts - cached_time < 5.0:
                            is_busy = cached_busy

                detected.append(
                    SerialPortInfo(
                        port=port_name,
                        description=desc,
                        hwid=hwid,
                        manufacturer=mfg,
                        is_probable_esp32=is_esp,
                        is_busy=is_busy,
                        is_bluetooth=is_bt,
                        device_type=device_type,
                        last_detected_at=now
                    )
                )

        except Exception as e:
            logger.error(f"Failed to enumerate serial ports: {e}")

        return detected

    def connect_device(self, port: str, target_role: str, baudrate: int = 115200) -> Tuple[bool, str]:
        """
        Connects an ESP32 role to a specific COM port with single ownership.
        """
        with self.lock:
            # Check if another connection owns this port
            if port in self.active_connections:
                existing = self.active_connections[port]
                if existing.target_role == target_role and existing.is_running:
                    return True, f"Port {port} is already actively managed for {target_role}."
                # Close previous connection on this port
                existing.close()
                del self.active_connections[port]

            # If this role was already connected on another port, close the previous port
            old_port = self.assigned_ports.get(target_role)
            if old_port and old_port in self.active_connections and old_port != port:
                self.active_connections[old_port].close()
                del self.active_connections[old_port]

            conn = ManagedSerialConnection(port=port, target_role=target_role, baudrate=baudrate, loop=self.loop)
            success, msg = conn.open_and_start()

            if success:
                self.active_connections[port] = conn
                self.assigned_ports[target_role] = port
                self._port_busy_cache[port] = (True, time.time())
                return True, msg
            else:
                self._port_busy_cache[port] = (True if conn.status == "BUSY" else False, time.time())
                # Still record connection object so diagnostics can display BUSY / ERROR state
                self.active_connections[port] = conn
                self.assigned_ports[target_role] = port
                return False, msg

    def disconnect_device(self, port: Optional[str] = None, target_role: Optional[str] = None) -> bool:
        """
        Cleanly closes serial port connection and removes ownership.
        """
        with self.lock:
            port_to_close = port
            if not port_to_close and target_role:
                port_to_close = self.assigned_ports.get(target_role)

            if port_to_close and port_to_close in self.active_connections:
                conn = self.active_connections[port_to_close]
                conn.close()
                del self.active_connections[port_to_close]
                self._port_busy_cache.pop(port_to_close, None)
                if target_role:
                    self.assigned_ports[target_role] = None
                return True
        return False

    def get_role_diagnostic(self, role: str, display_name: str) -> ESP32DeviceDiagnostic:
        """
        Retrieves current diagnostics for a designated ESP32 role.
        """
        with self.lock:
            assigned_port = self.assigned_ports.get(role)
            if assigned_port and assigned_port in self.active_connections:
                return self.active_connections[assigned_port].get_diagnostic(display_name)

        # Unconfigured / Not Connected state
        return ESP32DeviceDiagnostic(
            name=display_name,
            role=role,
            status="NOT_CONFIGURED",
            port=assigned_port,
            device_id=None,
            device_verified=False,
            can_status="UNVERIFIED",
            details={"configured": False, "port": assigned_port}
        )

    def probe_port(self, port: str, baudrate: int = 115200, timeout_sec: float = 1.0) -> Dict[str, Any]:
        """
        Safe on-demand diagnostic probe without toggling DTR/RTS reset lines.
        """
        # If port is already actively managed by us, return verified data directly
        with self.lock:
            if port in self.active_connections and self.active_connections[port].is_running:
                conn = self.active_connections[port]
                conn.send_identity_query()
                return {
                    "port": port,
                    "status": conn.status,
                    "device_verified": conn.device_verified,
                    "device_info": {
                        "device_id": conn.device_id,
                        "role": conn.target_role,
                        "firmware_version": conn.firmware_version
                    },
                    "message": f"Port {port} is active and managed for role {conn.target_role}."
                }

        try:
            import serial
        except ImportError:
            return {
                "port": port,
                "status": "NOT_CONFIGURED",
                "device_verified": False,
                "device_info": None,
                "message": "pyserial library not installed."
            }

        ser = None
        try:
            ser = serial.Serial(
                port=port,
                baudrate=baudrate,
                timeout=timeout_sec,
                write_timeout=timeout_sec,
                dsrdtr=False,
                rtscts=False
            )
            ser.dtr = False
            ser.rts = False

            probe_cmd = b'{"cmd":"IDENTIFY","type":"device_query"}\n{"cmd":"DIAG_PING"}\n'
            ser.write(probe_cmd)
            ser.flush()

            response_line = ser.readline().decode('utf-8', errors='replace').strip()

            if not response_line:
                return {
                    "port": port,
                    "status": "DISCONNECTED",
                    "device_verified": False,
                    "device_info": None,
                    "message": f"Port {port} opened, but device timed out without responding."
                }

            # 1. JSON response check
            try:
                data = json.loads(response_line)
                if isinstance(data, dict) and ("device_id" in data or "role" in data or "type" in data):
                    role = data.get("role", "can_receiver")
                    dev_id = data.get("device_id", "apex-esp32")
                    return {
                        "port": port,
                        "status": "CONNECTED",
                        "device_verified": True,
                        "device_info": data,
                        "message": f"Verified APEX device ({dev_id}, role: {role}) on {port}."
                    }
            except json.JSONDecodeError:
                pass

            # 2. Human-readable banner or CAN frame detection
            low_resp = response_line.lower()
            if "receiver" in low_resp or "esp32 #2" in low_resp or "[engine" in low_resp or "[vehicle" in low_resp:
                return {
                    "port": port,
                    "status": "CONNECTED",
                    "device_verified": True,
                    "device_info": {
                        "device_id": "apex-gateway-001",
                        "role": "can_receiver",
                        "firmware_version": "v1.0.0",
                        "raw_sample": response_line[:80]
                    },
                    "message": f"Verified APEX CAN Receiver on {port} (firmware banner detected)."
                }
            elif "simulator" in low_resp or "esp32 #1" in low_resp or "tx ok" in low_resp:
                return {
                    "port": port,
                    "status": "CONNECTED",
                    "device_verified": True,
                    "device_info": {
                        "device_id": "apex-vehicle-simulator-01",
                        "role": "vehicle_simulator",
                        "firmware_version": "v1.0.0",
                        "raw_sample": response_line[:80]
                    },
                    "message": f"Verified APEX Vehicle Simulator on {port} (firmware banner detected)."
                }

            return {
                "port": port,
                "status": "DEGRADED",
                "device_verified": False,
                "device_info": {"raw_preview": response_line[:80]},
                "message": f"Port {port} responded, but message did not match APEX JSON protocol."
            }

        except serial.SerialException as se:
            err = str(se).lower()
            if "permission" in err or "access is denied" in err:
                self._port_busy_cache[port] = (True, time.time())
                return {
                    "port": port,
                    "status": "BUSY",
                    "device_verified": False,
                    "device_info": None,
                    "message": f"Access denied to {port}. Port is busy or occupied by another serial monitor or process."
                }
            return {
                "port": port,
                "status": "ERROR",
                "device_verified": False,
                "device_info": None,
                "message": f"Serial communication error: {se}"
            }

        finally:
            if ser:
                try:
                    ser.close()
                except Exception:
                    pass

    def shutdown(self):
        """Clean shutdown of all managed serial connections."""
        with self.lock:
            for port, conn in list(self.active_connections.items()):
                try:
                    conn.close()
                except Exception:
                    pass
            self.active_connections.clear()
            logger.info("All managed serial connections closed cleanly.")

# Global singleton instance
serial_manager = SerialManager()
