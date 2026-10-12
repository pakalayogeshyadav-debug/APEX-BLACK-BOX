import pytest
import httpx
from unittest.mock import patch, AsyncMock, MagicMock
from pydantic import ValidationError

from app.services.esp32_simulator_client import (
    ESP32SimulatorClient,
    ESP32SimulatorControls
)
from app.schemas.schemas import RawCANFrameSchema
from app.services.can_decoder import can_decoder_service
from app.services.serial_manager import ManagedSerialConnection

# ============================================================================
# PHASE 6: ESP32 WI-FI BRIDGE UNIT TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_esp32_client_validation_valid_controls():
    """Test 1: Valid controls pass Pydantic validation."""
    valid_data = {
        "accelerator": 75.5,
        "brake": 0.0,
        "steering": -15.0,
        "gear": "D",
        "ignition": True,
        "parking_brake": False,
        "headlights": True,
        "turn_indicators": "LEFT",
        "hazard_lights": False
    }
    controls = ESP32SimulatorControls(**valid_data)
    assert controls.accelerator == 75.5
    assert controls.gear == "D"
    assert controls.ignition is True
    assert controls.turn_indicators == "LEFT"

@pytest.mark.asyncio
async def test_esp32_client_validation_invalid_controls():
    """Test 2: Invalid values (out of range / invalid gear) are strictly rejected."""
    # Invalid accelerator > 100
    with pytest.raises(ValidationError):
        ESP32SimulatorControls(accelerator=150.0)

    # Invalid brake < 0
    with pytest.raises(ValidationError):
        ESP32SimulatorControls(brake=-10.0)

    # Invalid gear
    with pytest.raises(ValidationError):
        ESP32SimulatorControls(gear="X")

    # Invalid turn indicator
    with pytest.raises(ValidationError):
        ESP32SimulatorControls(turn_indicators="UP")

@pytest.mark.asyncio
async def test_esp32_client_disconnected_when_unreachable():
    """Test 3: Unreachable ESP32 IP returns DISCONNECTED status and does not falsely report connected."""
    client = ESP32SimulatorClient(base_url="http://192.0.2.1:80")  # TEST-NET unroutable IP

    with patch("httpx.AsyncClient.get", side_effect=httpx.ConnectError("Connection refused")):
        res = await client.check_connectivity()
        assert res["connected"] is False
        assert res["status"] == "DISCONNECTED"
        assert "Cannot connect" in res["error"]
        assert client.status == "DISCONNECTED"

@pytest.mark.asyncio
async def test_esp32_client_timeout_handling():
    """Test 4: HTTP timeout is handled gracefully and returns TIMEOUT status."""
    client = ESP32SimulatorClient(base_url="http://192.168.1.100")

    with patch("httpx.AsyncClient.post", side_effect=httpx.TimeoutException("Timed out")):
        res = await client.send_controls({"accelerator": 50.0, "gear": "D", "ignition": True})
        assert res["acknowledged"] is False
        assert res["status"] == "TIMEOUT"
        assert "timed out" in res["error"].lower()
        assert client.status == "DISCONNECTED"

@pytest.mark.asyncio
async def test_esp32_client_successful_command_forwarding():
    """Test 5: Valid command acknowledged with 200 OK by ESP32 reports SUCCESS and latency."""
    client = ESP32SimulatorClient(base_url="http://192.168.1.100")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "status": "OK",
        "acknowledged": True,
        "command_seq": 1,
        "speed": 42.5,
        "rpm": 1850
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        res = await client.send_controls({"accelerator": 60.0, "gear": "D", "ignition": True})
        assert res["acknowledged"] is True
        assert res["status"] == "SUCCESS"
        assert res["hardware_response"]["speed"] == 42.5
        assert client.status == "CONNECTED"
        assert client.last_error is None

@pytest.mark.asyncio
async def test_esp32_client_rejection_not_reported_as_success():
    """Test 6: If ESP32 returns 400 or 500, command is reported as FAILED."""
    client = ESP32SimulatorClient(base_url="http://192.168.1.100")

    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = '{"error": "Invalid checksum"}'

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        res = await client.send_controls({"accelerator": 30.0})
        assert res["acknowledged"] is False
        assert res["status"] == "FAILED"
        assert "rejected" in res["error"]
        assert client.status == "ERROR"

def test_serial_manager_ingests_can_frame_payload():
    """Test 7: Receiver serial manager decodes JSON raw CAN frame hex into live telemetry."""
    conn = ManagedSerialConnection(port="COM7", target_role="can_receiver")

    # Emulate incoming CAN frame JSON from ESP32 #2 for Frame 0x100 (speed 65 km/h, RPM 2200 = 0x0898)
    # 0x100 payload: Byte 0 = 65 (0x41), Byte 1 = 0, Byte 2 = 0x08, Byte 3 = 0x98, ...
    payload_hex = "4100089844010000"
    json_line = f'{{"type":"can_frame","can_id":256,"dlc":8,"data":"{payload_hex}","timestamp_ms":1000}}'

    conn._process_message_line(json_line)

    assert conn.can_frames_received >= 1
    assert conn.can_status == "OK"
    assert conn.current_telemetry_state["speed"] == 65.0
    assert conn.current_telemetry_state["rpm"] == 2200

def test_serial_manager_ingests_obd2_can_frame():
    """Test 8: Receiver serial manager decodes OBD-II Frame 0x7E8 RPM PID."""
    conn = ManagedSerialConnection(port="COM7", target_role="can_receiver")

    # OBD-II 0x7E8 PID 0x0C: (256*A + B)/4. If A=0x20 (32), B=0x00, RPM = (32*256)/4 = 2048 RPM
    payload_hex = "04410C2000000000"
    json_line = f'{{"type":"can_frame","can_id":2024,"dlc":8,"data":"{payload_hex}","timestamp_ms":2000}}'

    conn._process_message_line(json_line)

    assert conn.can_frames_received >= 1
    assert conn.current_telemetry_state["rpm"] == 2048
