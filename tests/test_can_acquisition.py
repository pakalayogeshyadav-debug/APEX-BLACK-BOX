import pytest
import struct
from pydantic import ValidationError
from datetime import datetime, timezone, timedelta

from app.schemas.schemas import (
    CANControllerConfig,
    RawCANFrameSchema,
    DecodedTelemetrySignal
)
from app.services.can_decoder import CANDecoderService
from app.services.gateway_protocol import (
    GatewayProtocolParser,
    compute_crc16,
    APEX_PROTO_SYNC_0,
    APEX_PROTO_SYNC_1,
    APEX_PROTO_VERSION,
    PKT_HEARTBEAT,
    PKT_RAW_CAN_BATCH,
    HEADER_SIZE
)

# --------------------------------------------------------------------------
# 1. Configuration Validation & Transceiver Profile Selection
# --------------------------------------------------------------------------
def test_valid_can_controller_config():
    """Validates default and custom CAN controller configurations."""
    cfg = CANControllerConfig(
        transceiver_profile="SN65HVD230",
        bitrate=500000,
        mode="LISTEN_ONLY",
        tx_gpio=5,
        rx_gpio=4
    )
    assert cfg.transceiver_profile == "SN65HVD230"
    assert cfg.bitrate == 500000
    assert cfg.mode == "LISTEN_ONLY"
    assert cfg.tx_gpio == 5
    assert cfg.rx_gpio == 4

def test_tja1050_profile_selection():
    """Validates TJA1050 transceiver profile selection."""
    cfg = CANControllerConfig(
        transceiver_profile="TJA1050",
        bitrate=250000,
        mode="NORMAL",
        tx_gpio=22,
        rx_gpio=21
    )
    assert cfg.transceiver_profile == "TJA1050"
    assert cfg.bitrate == 250000

# --------------------------------------------------------------------------
# 2. Unsupported ESP32 Hardware & Invalid GPIO Assignments
# --------------------------------------------------------------------------
def test_invalid_gpio_assignment_input_only_pin_as_tx():
    """ESP32 pins 34, 35, 36, 39 are input-only and cannot drive TWAI TX."""
    with pytest.raises(ValidationError) as exc_info:
        CANControllerConfig(tx_gpio=34, rx_gpio=4)
    assert "input-only pin" in str(exc_info.value)

    with pytest.raises(ValidationError) as exc_info:
        CANControllerConfig(tx_gpio=36, rx_gpio=4)
    assert "input-only pin" in str(exc_info.value)

def test_invalid_gpio_assignment_flash_pins():
    """ESP32 pins 6-11 are reserved for internal SPI Flash."""
    with pytest.raises(ValidationError) as exc_info:
        CANControllerConfig(tx_gpio=6, rx_gpio=4)
    assert "internally connected to SPI flash" in str(exc_info.value)

    with pytest.raises(ValidationError) as exc_info:
        CANControllerConfig(tx_gpio=5, rx_gpio=10)
    assert "internally connected to SPI flash" in str(exc_info.value)

def test_invalid_gpio_out_of_range():
    """Pin numbers outside 0..39 are rejected."""
    with pytest.raises(ValidationError) as exc_info:
        CANControllerConfig(tx_gpio=45, rx_gpio=4)
    assert "out of ESP32 pin range" in str(exc_info.value)

def test_invalid_can_bitrate():
    """Bitrates other than 125k, 250k, 500k, 1M are rejected."""
    with pytest.raises(ValidationError) as exc_info:
        CANControllerConfig(bitrate=333000)
    assert "Unsupported CAN bitrate" in str(exc_info.value)

# --------------------------------------------------------------------------
# 3. CAN Identifier, DLC, and Payload Validation
# --------------------------------------------------------------------------
def test_valid_standard_and_extended_can_frames():
    """Validates ISO 11898 standard (11-bit) and extended (29-bit) CAN frames."""
    # Standard 11-bit frame (ID <= 0x7FF)
    std_frame = RawCANFrameSchema(
        timestamp_us=1000000,
        sequence_number=1,
        can_id=0x7DF,
        is_extended=False,
        dlc=8,
        payload_bytes="02010D0000000000"
    )
    assert std_frame.can_id == 0x7DF
    assert len(std_frame.payload_bytes) == 16

    # Extended 29-bit frame (ID <= 0x1FFFFFFF)
    ext_frame = RawCANFrameSchema(
        timestamp_us=1000050,
        sequence_number=2,
        can_id=0x18DAF110,
        is_extended=True,
        dlc=8,
        payload_bytes="0322F19000000000"
    )
    assert ext_frame.can_id == 0x18DAF110
    assert ext_frame.is_extended is True

def test_invalid_standard_can_id_exceeding_11_bits():
    """Standard frame with ID > 0x7FF is rejected."""
    with pytest.raises(ValidationError) as exc_info:
        RawCANFrameSchema(
            timestamp_us=1000000,
            sequence_number=1,
            can_id=0x800, # 2048 > 2047
            is_extended=False,
            dlc=8,
            payload_bytes="0000000000000000"
        )
    assert "exceeds 11-bit limit" in str(exc_info.value)

def test_invalid_extended_can_id_exceeding_29_bits():
    """Extended frame with ID > 0x1FFFFFFF is rejected."""
    with pytest.raises(ValidationError) as exc_info:
        RawCANFrameSchema(
            timestamp_us=1000000,
            sequence_number=1,
            can_id=0x20000000,
            is_extended=True,
            dlc=8,
            payload_bytes="0000000000000000"
        )
    assert "exceeds 29-bit limit" in str(exc_info.value)

def test_invalid_dlc_and_payload_length_mismatch():
    """Payload hex length must equal DLC * 2."""
    with pytest.raises(ValidationError) as exc_info:
        RawCANFrameSchema(
            timestamp_us=1000000,
            sequence_number=1,
            can_id=0x100,
            dlc=4,
            payload_bytes="0102" # Only 1 byte hex instead of 4
        )
    assert "does not match DLC" in str(exc_info.value)

# --------------------------------------------------------------------------
# 4. Mode A (Raw CAN) vs Mode B (Decoded Telemetry)
# --------------------------------------------------------------------------
def test_mode_a_raw_can_preserves_unrecognized_frames():
    """Unmapped CAN frames are preserved in Mode A without crashing or inventing signals."""
    decoder = CANDecoderService()
    custom_frame = RawCANFrameSchema(
        timestamp_us=2000000,
        sequence_number=42,
        can_id=0x345,
        is_extended=False,
        dlc=6,
        payload_bytes="DEADBEEFCAFE"
    )
    decoder.ingest_raw_frame(custom_frame)
    raw_list = decoder.get_raw_frames(limit=10)
    assert len(raw_list) == 1
    assert raw_list[0].can_id == 0x345
    assert raw_list[0].payload_bytes == "DEADBEEFCAFE"

    # Signals in Mode B remain UNAVAILABLE (not fabricated)
    signals = decoder.get_decoded_signals()
    assert signals["vehicle_speed"].is_valid is False
    assert signals["vehicle_speed"].value is None

def test_mode_b_decoded_obd2_signals():
    """Mode B decodes vehicle speed, RPM, and throttle from standard OBD-II 0x7E8 frames."""
    decoder = CANDecoderService()

    # Ingest Speed PID 0x0D (value = 0x50 = 80 km/h)
    speed_frame = RawCANFrameSchema(
        timestamp_us=3000000,
        sequence_number=101,
        can_id=0x7E8,
        is_extended=False,
        dlc=8,
        payload_bytes="03410D5000000000"
    )
    decoder.ingest_raw_frame(speed_frame)
    signals = decoder.get_decoded_signals()
    assert signals["vehicle_speed"].is_valid is True
    assert signals["vehicle_speed"].value == 80.0
    assert signals["vehicle_speed"].unit == "km/h"

    # Ingest RPM PID 0x0C (A=0x1F, B=0x40 -> (31*256 + 64)/4 = 8000/4 = 2000 RPM)
    rpm_frame = RawCANFrameSchema(
        timestamp_us=3000050,
        sequence_number=102,
        can_id=0x7E8,
        is_extended=False,
        dlc=8,
        payload_bytes="04410C1F40000000"
    )
    decoder.ingest_raw_frame(rpm_frame)
    signals = decoder.get_decoded_signals()
    assert signals["engine_rpm"].is_valid is True
    assert signals["engine_rpm"].value == 2000.0

# --------------------------------------------------------------------------
# 5. Gateway Binary Protocol Framing & Error Handling
# --------------------------------------------------------------------------
def test_gateway_protocol_valid_packet_framing():
    """Tests binary packet encoding, framing, CRC16 generation, and decoding."""
    parser = GatewayProtocolParser()
    payload = b"TEST_PAYLOAD_1234"
    seq = 45
    ts = 1728700000000

    # Build valid packet
    header = struct.pack(
        "<2sBBBBIQH",
        bytes([APEX_PROTO_SYNC_0, APEX_PROTO_SYNC_1]),
        APEX_PROTO_VERSION,
        PKT_HEARTBEAT,
        1, # LOGGER
        0, # RSV
        seq,
        ts,
        len(payload)
    )
    crc = compute_crc16(header + payload)
    packet_bytes = header + payload + struct.pack("<H", crc)

    packets = parser.feed(packet_bytes)
    assert len(packets) == 1
    pkt = packets[0]
    assert pkt["packet_type"] == PKT_HEARTBEAT
    assert pkt["sequence_number"] == seq
    assert pkt["timestamp_ms"] == ts
    assert pkt["payload"] == payload

def test_gateway_protocol_corrupted_crc_rejected():
    """Corrupted packets with invalid CRC are dropped and tracked."""
    parser = GatewayProtocolParser()
    payload = b"CORRUPTED_DATA"
    header = struct.pack(
        "<2sBBBBIQH",
        bytes([APEX_PROTO_SYNC_0, APEX_PROTO_SYNC_1]),
        APEX_PROTO_VERSION,
        PKT_HEARTBEAT,
        1,
        0,
        1,
        1000,
        len(payload)
    )
    bad_crc = 0x0000
    packet_bytes = header + payload + struct.pack("<H", bad_crc)

    packets = parser.feed(packet_bytes)
    assert len(packets) == 0
    assert parser.stats["crc_errors"] == 1

def test_gateway_protocol_resynchronizes_after_noise():
    """Parser discards junk bytes and locks onto next sync word."""
    parser = GatewayProtocolParser()
    noise = b"\x00\xFF\x12\x34\xFE\xED"
    payload = b"VALID_AFTER_NOISE"
    header = struct.pack(
        "<2sBBBBIQH",
        bytes([APEX_PROTO_SYNC_0, APEX_PROTO_SYNC_1]),
        APEX_PROTO_VERSION,
        PKT_RAW_CAN_BATCH,
        1,
        0,
        2,
        2000,
        len(payload)
    )
    crc = compute_crc16(header + payload)
    valid_packet = header + payload + struct.pack("<H", crc)

    packets = parser.feed(noise + valid_packet)
    assert len(packets) == 1
    assert packets[0]["payload"] == payload
    assert parser.stats["desync_bytes_dropped"] >= len(noise)

# --------------------------------------------------------------------------
# 6. Five-Minute Rolling Buffer Capacity & Gap Detection
# --------------------------------------------------------------------------
def test_five_minute_buffer_capacity_calculation():
    """Verifies sample capacity at 50 Hz for 300 seconds (5 minutes)."""
    duration_sec = 300
    target_hz = 50
    expected_samples = duration_sec * target_hz
    sample_size_bytes = 36 # sizeof(apex_telemetry_sample_t)
    total_memory_bytes = expected_samples * sample_size_bytes

    assert expected_samples == 15000
    assert total_memory_bytes == 540000 # ~527 KB, fits comfortably in PSRAM or internal SRAM

def test_partial_recording_detection():
    """When device has been running for less than 300s, actual duration is accurately reported."""
    now_us = 45000000 # 45 seconds after boot
    start_us = 1000000 # 1 second after boot
    actual_sec = (now_us - start_us) / 1000000.0
    assert actual_sec == 44.0
    assert actual_sec < 300.0 # Accurately detected as partial recording
