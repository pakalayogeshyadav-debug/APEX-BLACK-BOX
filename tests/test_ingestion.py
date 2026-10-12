import pytest
from app.schemas.schemas import TelemetryPayload
import uuid

def test_valid_telemetry_schema():
    payload = {
        "schema_version": 1,
        "device_id": "logger-001",
        "session_id": str(uuid.uuid4()),
        "sequence_number": 1001,
        "device_timestamp_ms": 123456789,
        "source_mode": "SIMULATION",
        "telemetry": {
            "vehicle_speed_kmh": 62.5,
            "engine_rpm": 2400,
            "throttle_percent": 32.0,
            "deceleration_mps2": -1.2
        },
        "can_statistics": {
            "received_frames": 1001,
            "dropped_frames": 0
        }
    }
    obj = TelemetryPayload(**payload)
    assert obj.telemetry.vehicle_speed_kmh == 62.5
    assert obj.source_mode == "SIMULATION"

def test_missing_optional_fields():
    payload = {
        "schema_version": 1,
        "device_id": "logger-001",
        "session_id": str(uuid.uuid4()),
        "sequence_number": 1002,
        "device_timestamp_ms": 123456790,
        "source_mode": "LIVE",
        "telemetry": {
            "vehicle_speed_kmh": None,
            "engine_rpm": 2400
            # throttle and decel omitted
        }
    }
    obj = TelemetryPayload(**payload)
    assert obj.telemetry.vehicle_speed_kmh is None
    assert obj.telemetry.throttle_percent is None
    assert obj.can_statistics is None

def test_invalid_schema_version():
    payload = {
        "schema_version": 2, # Invalid, must be 1
        "device_id": "logger-001",
        "session_id": str(uuid.uuid4()),
        "sequence_number": 1001,
        "device_timestamp_ms": 123456789,
        "source_mode": "SIMULATION",
        "telemetry": {}
    }
    with pytest.raises(ValueError):
        TelemetryPayload(**payload)

def test_invalid_ranges():
    payload = {
        "schema_version": 1,
        "device_id": "logger-001",
        "session_id": str(uuid.uuid4()),
        "sequence_number": 1001,
        "device_timestamp_ms": 123456789,
        "source_mode": "SIMULATION",
        "telemetry": {
            "vehicle_speed_kmh": -10.0, # Cannot be negative
        }
    }
    with pytest.raises(ValueError):
        TelemetryPayload(**payload)
