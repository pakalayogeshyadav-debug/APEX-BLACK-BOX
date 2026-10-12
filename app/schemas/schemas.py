from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
import uuid

class DeviceBase(BaseModel):
    device_identifier: str
    device_role: str
    hardware_model: str
    firmware_version: Optional[str] = None
    status: str

class DeviceCreate(DeviceBase):
    pass

class DeviceResponse(DeviceBase):
    id: uuid.UUID
    last_seen_at: datetime
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class TelemetryData(BaseModel):
    vehicle_speed_kmh: Optional[float] = Field(None, ge=0.0, le=400.0)
    engine_rpm: Optional[int] = Field(None, ge=0, le=20000)
    throttle_percent: Optional[float] = Field(None, ge=0.0, le=100.0)
    deceleration_mps2: Optional[float] = Field(None, ge=-50.0, le=50.0)

class CANStatistics(BaseModel):
    received_frames: Optional[int] = Field(None, ge=0)
    dropped_frames: Optional[int] = Field(None, ge=0)

class TelemetryPayload(BaseModel):
    schema_version: Literal[1]
    device_id: str
    session_id: str
    sequence_number: int = Field(..., ge=0)
    device_timestamp_ms: int = Field(..., ge=0)
    source_mode: Literal["SIMULATION", "LIVE"]
    telemetry: TelemetryData
    can_statistics: Optional[CANStatistics] = None

class EventBase(BaseModel):
    event_type: str
    severity: Optional[str] = None
    trigger_timestamp_ms: int
    description: str
    trigger_metadata: Optional[Dict[str, Any]] = None
    source_mode: str

class EventResponse(EventBase):
    id: uuid.UUID
    device_id: uuid.UUID
    session_id: uuid.UUID
    detected_at: datetime
    recording_id: Optional[uuid.UUID] = None
    model_config = ConfigDict(from_attributes=True)

class RecordingSampleBase(BaseModel):
    original_timestamp_ms: int
    original_sequence_number: Optional[int] = None
    telemetry_data: Optional[Dict[str, Any]] = None
    can_frames: Optional[List[Dict[str, Any]]] = None

class BlackboxRetrieveRequest(BaseModel):
    device_id: uuid.UUID
    session_id: Optional[uuid.UUID] = None
    recording_type: str
    source_mode: str
    recording_start_at: datetime
    recording_end_at: datetime
    checksum_algorithm: Optional[str] = None
    checksum_value: Optional[str] = None
    samples: List[RecordingSampleBase]

class RecordingResponse(BaseModel):
    id: uuid.UUID
    device_id: uuid.UUID
    session_id: Optional[uuid.UUID]
    recording_type: str
    source_mode: str
    requested_at: datetime
    recording_start_at: Optional[datetime]
    recording_end_at: Optional[datetime]
    requested_duration_sec: int
    actual_duration_sec: Optional[float]
    sample_count: int
    missing_data_info: Optional[Dict[str, Any]]
    retrieval_request_id: uuid.UUID
    transfer_status: str
    integrity_status: str
    checksum_algorithm: Optional[str]
    checksum_value: Optional[str]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class RetrievalRequest(BaseModel):
    device_id: str
    duration_sec: int = 300

class RecordingChunkPayload(BaseModel):
    retrieval_request_id: uuid.UUID
    chunk_index: int
    total_chunks: int
    samples: List[RecordingSampleBase]
    chunk_checksum: Optional[str] = None

# Hardware Diagnostics Schemas
DiagnosticStatusType = Literal[
    "CONNECTED",
    "DISCONNECTED",
    "DEGRADED",
    "UNKNOWN",
    "NOT_CONFIGURED",
    "SIMULATED",
    "ERROR",
    "BUSY",
    "STALE"
]

class SubsystemDiagnostic(BaseModel):
    name: str
    status: DiagnosticStatusType
    last_checked: datetime
    details: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None

class SerialPortInfo(BaseModel):
    port: str
    description: str
    hwid: str
    manufacturer: Optional[str] = None
    is_probable_esp32: bool = False
    is_busy: bool = False
    is_bluetooth: bool = False
    device_type: str = "Unknown"
    last_detected_at: Optional[datetime] = None

class SerialProbeRequest(BaseModel):
    port: str
    baudrate: int = 115200
    timeout_sec: float = 1.0

class SerialProbeResponse(BaseModel):
    port: str
    status: DiagnosticStatusType
    device_verified: bool
    device_info: Optional[Dict[str, Any]] = None
    message: str

class SerialConnectRequest(BaseModel):
    port: str
    target_role: Literal["can_receiver", "vehicle_simulator"]
    baudrate: int = 115200

class SerialDisconnectRequest(BaseModel):
    port: Optional[str] = None
    target_role: Optional[Literal["can_receiver", "vehicle_simulator"]] = None

class SerialRoleAssignRequest(BaseModel):
    receiver_port: Optional[str] = None
    simulator_port: Optional[str] = None
    auto_connect: bool = False

class ESP32DeviceDiagnostic(BaseModel):
    name: str
    role: str
    status: DiagnosticStatusType
    port: Optional[str] = None
    device_id: Optional[str] = None
    device_verified: bool = False
    firmware_version: Optional[str] = None
    protocol_version: Optional[int] = None
    uptime_ms: Optional[int] = None
    can_status: Optional[str] = None
    can_frames_received: int = 0
    last_heartbeat_at: Optional[datetime] = None
    last_message_at: Optional[datetime] = None
    last_successful_comm: Optional[datetime] = None
    last_error: Optional[str] = None
    received_line_count: int = 0
    parsed_json_count: int = 0
    malformed_message_count: int = 0
    connection_error_count: int = 0
    details: Dict[str, Any] = Field(default_factory=dict)

class OverallDiagnosticsResponse(BaseModel):
    timestamp: datetime
    backend: SubsystemDiagnostic
    database: SubsystemDiagnostic
    serial_interface: SubsystemDiagnostic
    esp32_logger: SubsystemDiagnostic
    esp32_gateway: SubsystemDiagnostic
    logger_to_gateway: SubsystemDiagnostic
    can_bus: SubsystemDiagnostic
    gateway_to_backend: SubsystemDiagnostic
    telemetry_reception: SubsystemDiagnostic
    detected_serial_ports: List[SerialPortInfo] = Field(default_factory=list)
    can_receiver: Optional[ESP32DeviceDiagnostic] = None
    vehicle_simulator: Optional[ESP32DeviceDiagnostic] = None

# Configurable CAN Acquisition Schemas
CANTransceiverProfile = Literal["SN65HVD230", "TJA1050"]
CANMode = Literal["LISTEN_ONLY", "NORMAL"]

class CANControllerConfig(BaseModel):
    transceiver_profile: CANTransceiverProfile = "SN65HVD230"
    controller_interface: str = "ESP32_TWAI"
    tx_gpio: int = 5
    rx_gpio: int = 4
    mode_control_gpio: Optional[int] = None
    bitrate: int = 500000
    mode: CANMode = "LISTEN_ONLY"
    standard_frame_support: bool = True
    extended_frame_support: bool = True
    identifier_filters: Optional[List[int]] = None
    enabled: bool = True

    @field_validator("tx_gpio")
    @classmethod
    def validate_tx_gpio(cls, v: int) -> int:
        if v < 0 or v > 39:
            raise ValueError(f"TX GPIO {v} is out of ESP32 pin range (0..39)")
        if 6 <= v <= 11:
            raise ValueError(f"GPIO {v} is internally connected to SPI flash and cannot be used")
        if v in (34, 35, 36, 39):
            raise ValueError(f"GPIO {v} is an input-only pin and cannot be used as TWAI TX")
        return v

    @field_validator("rx_gpio")
    @classmethod
    def validate_rx_gpio(cls, v: int) -> int:
        if v < 0 or v > 39:
            raise ValueError(f"RX GPIO {v} is out of ESP32 pin range (0..39)")
        if 6 <= v <= 11:
            raise ValueError(f"GPIO {v} is internally connected to SPI flash and cannot be used")
        return v

    @field_validator("bitrate")
    @classmethod
    def validate_bitrate(cls, v: int) -> int:
        if v not in (125000, 250000, 500000, 1000000):
            raise ValueError(f"Unsupported CAN bitrate {v}. Must be 125000, 250000, 500000, or 1000000")
        return v

class RawCANFrameSchema(BaseModel):
    timestamp_us: int = Field(..., ge=0)
    sequence_number: int = Field(..., ge=0)
    is_extended: bool = False
    is_remote: bool = False
    can_id: int = Field(..., ge=0)
    dlc: int = Field(..., ge=0, le=8)
    payload_bytes: str = Field(..., description="Hex string of payload data")
    channel_id: int = 0
    status: str = "VALID"

    @field_validator("can_id")
    @classmethod
    def validate_can_id(cls, v: int, info) -> int:
        is_ext = info.data.get("is_extended", False)
        if is_ext:
            if v > 0x1FFFFFFF:
                raise ValueError(f"Extended CAN ID 0x{v:X} exceeds 29-bit limit (0x1FFFFFFF)")
        else:
            if v > 0x7FF:
                raise ValueError(f"Standard CAN ID 0x{v:X} exceeds 11-bit limit (0x7FF)")
        return v

    @field_validator("payload_bytes")
    @classmethod
    def validate_payload(cls, v: str, info) -> str:
        dlc = info.data.get("dlc", 0)
        # Normalize hex string
        clean = v.strip().replace(" ", "").upper()
        if len(clean) != dlc * 2:
            raise ValueError(f"Payload hex length ({len(clean)}) does not match DLC {dlc} (expected {dlc * 2} chars)")
        try:
            bytes.fromhex(clean)
        except ValueError:
            raise ValueError(f"Invalid hexadecimal string: '{v}'")
        return clean

class DecodedTelemetrySignal(BaseModel):
    signal_name: str
    value: Optional[float] = None
    unit: str
    is_valid: bool
    source_can_id: int
    timestamp_us: int

class SimulatorControlsRequest(BaseModel):
    accelerator: Optional[float] = Field(None, ge=0.0, le=100.0)
    brake: Optional[float] = Field(None, ge=0.0, le=100.0)
    steering: Optional[float] = Field(None, ge=-100.0, le=100.0)
    gear: Optional[str] = Field(None, pattern=r"^[PRNDprnd]$")
    ignition: Optional[bool] = None
    parking_brake: Optional[bool] = None
    headlights: Optional[bool] = None
    turn_indicators: Optional[str] = Field(None, pattern=r"^(LEFT|RIGHT|OFF|left|right|off)$")
    hazard_lights: Optional[bool] = None

class SimulatorScenarioRequest(BaseModel):
    scenario_name: str

class SimulatorEventTriggerRequest(BaseModel):
    event_type: str = "HARD_BRAKING"
    severity: str = "medium"
    description: Optional[str] = None

class SimulatorRecordingStartRequest(BaseModel):
    duration_sec: int = 300

class HardwareSimulatorConfigRequest(BaseModel):
    base_url: str = Field(..., description="ESP32 Simulator LAN base URL, e.g. http://192.168.1.100")


