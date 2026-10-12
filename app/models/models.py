import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, BigInteger, Float, Boolean, DateTime, ForeignKey, Text, JSON, Uuid, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base

def utc_now():
    return datetime.now(timezone.utc)

class Device(Base):
    __tablename__ = 'devices'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    device_identifier = Column(String(255), unique=True, index=True, nullable=False)
    device_role = Column(String(255), nullable=False) # LOGGER or GATEWAY
    hardware_model = Column(String(255), nullable=False)
    firmware_version = Column(String(255), nullable=True)
    status = Column(String(255), nullable=False, default="OFFLINE")
    last_seen_at = Column(DateTime(timezone=True), default=utc_now)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

class TelemetrySession(Base):
    __tablename__ = 'telemetry_sessions'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    device_id = Column(Uuid, ForeignKey('devices.id'), nullable=False)
    source_mode = Column(String(255), nullable=False) # SIMULATION or LIVE
    started_at = Column(DateTime(timezone=True), default=utc_now)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(255), nullable=False, default="ACTIVE")
    created_at = Column(DateTime(timezone=True), default=utc_now)
    
    device = relationship("Device")

class TelemetrySample(Base):
    __tablename__ = 'telemetry_samples'
    __table_args__ = (UniqueConstraint('session_id', 'sequence_number', name='uix_session_seq'),)
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id = Column(Uuid, ForeignKey('telemetry_sessions.id'), nullable=False, index=True)
    device_id = Column(Uuid, ForeignKey('devices.id'), nullable=False)
    device_timestamp_ms = Column(BigInteger, nullable=False)
    received_at = Column(DateTime(timezone=True), default=utc_now)
    vehicle_speed_kmh = Column(Float, nullable=True)
    engine_rpm = Column(Integer, nullable=True)
    throttle_percent = Column(Float, nullable=True)
    deceleration_mps2 = Column(Float, nullable=True)
    can_frame_count = Column(Integer, nullable=True)
    dropped_frame_count = Column(Integer, nullable=True)
    source_mode = Column(String(255), nullable=False)
    sequence_number = Column(Integer, nullable=True)

class CANFrame(Base):
    __tablename__ = 'can_frames'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id = Column(Uuid, ForeignKey('telemetry_sessions.id'), nullable=False, index=True)
    device_id = Column(Uuid, ForeignKey('devices.id'), nullable=False)
    device_timestamp_ms = Column(BigInteger, nullable=False)
    received_at = Column(DateTime(timezone=True), default=utc_now)
    can_identifier = Column(Integer, nullable=False)
    frame_format = Column(String(255), nullable=False) # STD or EXT
    dlc = Column(Integer, nullable=False)
    payload_bytes = Column(String(255), nullable=False) # Hex string
    source_mode = Column(String(255), nullable=False)

class Event(Base):
    __tablename__ = 'events'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    device_id = Column(Uuid, ForeignKey('devices.id'), nullable=False)
    session_id = Column(Uuid, ForeignKey('telemetry_sessions.id'), nullable=False)
    event_type = Column(String(255), nullable=False, index=True)
    severity = Column(String(255), nullable=True)
    trigger_timestamp_ms = Column(BigInteger, nullable=False)
    detected_at = Column(DateTime(timezone=True), default=utc_now)
    description = Column(String(255), nullable=False)
    trigger_metadata = Column(JSON, nullable=True)
    source_mode = Column(String(255), nullable=False)
    recording_id = Column(Uuid, nullable=True) # Linked after upload

class Recording(Base):
    __tablename__ = 'recordings'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    device_id = Column(Uuid, ForeignKey('devices.id'), nullable=False)
    session_id = Column(Uuid, ForeignKey('telemetry_sessions.id'), nullable=True)
    recording_type = Column(String(255), nullable=False)
    source_mode = Column(String(255), nullable=False)
    requested_at = Column(DateTime(timezone=True), default=utc_now)
    recording_start_at = Column(DateTime(timezone=True), nullable=True)
    recording_end_at = Column(DateTime(timezone=True), nullable=True)
    requested_duration_sec = Column(Integer, nullable=False, default=300)
    actual_duration_sec = Column(Float, nullable=True)
    sample_count = Column(Integer, nullable=False, default=0)
    missing_data_info = Column(JSON, nullable=True)
    retrieval_request_id = Column(Uuid, nullable=False, index=True)
    transfer_status = Column(String(255), nullable=False, default="PENDING")
    integrity_status = Column(String(255), nullable=False, default="UNVERIFIED")
    checksum_algorithm = Column(String(255), nullable=True)
    checksum_value = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

class RecordingSample(Base):
    __tablename__ = 'recording_samples'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    recording_id = Column(Uuid, ForeignKey('recordings.id'), nullable=False, index=True)
    original_timestamp_ms = Column(BigInteger, nullable=False)
    original_sequence_number = Column(Integer, nullable=True)
    telemetry_data = Column(JSON, nullable=True)
    can_frames = Column(JSON, nullable=True)

class DeviceHealthHistory(Base):
    __tablename__ = 'device_health_history'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    device_id = Column(Uuid, ForeignKey('devices.id'), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=utc_now)
    status = Column(String(255), nullable=False)
    metrics = Column(JSON, nullable=True)

class AuditEvent(Base):
    __tablename__ = 'audit_events'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime(timezone=True), default=utc_now)
    action = Column(String(255), nullable=False)
    resource_type = Column(String(255), nullable=False)
    resource_id = Column(String(255), nullable=True)
    outcome = Column(String(255), nullable=False)
    details = Column(JSON, nullable=True)
