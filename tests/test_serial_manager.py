import pytest
import json
import time
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

from app.services.serial_manager import (
    SerialManager,
    ManagedSerialConnection,
    KNOWN_ESP32_VID_PIDS
)
from app.schemas.schemas import SerialPortInfo

# ============================================================================
# PHASE 7 AUTOMATED VALIDATION TEST SUITE (MOCKED)
# ============================================================================

def test_port_enumeration_and_classification():
    """
    Test 1: Port enumeration distinguishing ESP32, Bluetooth, and ordinary serial
    """
    manager = SerialManager()

    mock_cp210x = MagicMock()
    mock_cp210x.device = "COM6"
    mock_cp210x.description = "Silicon Labs CP210x USB to UART Bridge"
    mock_cp210x.hwid = "USB\\VID_10C4&PID_EA60"
    mock_cp210x.vid = 0x10C4
    mock_cp210x.pid = 0xEA60
    mock_cp210x.manufacturer = "Silicon Labs"

    mock_bt = MagicMock()
    mock_bt.device = "COM4"
    mock_bt.description = "Standard Serial over Bluetooth link (COM4)"
    mock_bt.hwid = "BTHENUM\\{00001101-0000-1000-8000-00805F9B34FB}"
    mock_bt.vid = None
    mock_bt.pid = None
    mock_bt.manufacturer = "Microsoft"

    mock_generic = MagicMock()
    mock_generic.device = "COM1"
    mock_generic.description = "Communications Port (COM1)"
    mock_generic.hwid = "ACPI\\PNP0501"
    mock_generic.vid = None
    mock_generic.pid = None
    mock_generic.manufacturer = "Microsoft"

    with patch("serial.tools.list_ports.comports", return_value=[mock_cp210x, mock_bt, mock_generic]):
        ports = manager.enumerate_serial_ports()

        assert len(ports) == 3
        # ESP32 Port
        p_esp = next(p for p in ports if p.port == "COM6")
        assert p_esp.is_probable_esp32 is True
        assert p_esp.is_bluetooth is False
        assert p_esp.device_type == "ESP32"

        # Bluetooth Port
        p_bt = next(p for p in ports if p.port == "COM4")
        assert p_bt.is_probable_esp32 is False
        assert p_bt.is_bluetooth is True
        assert p_bt.device_type == "Bluetooth"

        # Generic Port
        p_gen = next(p for p in ports if p.port == "COM1")
        assert p_gen.is_probable_esp32 is False
        assert p_gen.device_type == "Standard Serial"


def test_missing_device_connect_failure():
    """
    Test 2: Attempting to connect to a missing/unplugged port
    """
    manager = SerialManager()
    with patch("serial.Serial", side_effect=Exception("could not open port COM99: FileNotFoundError")):
        success, msg = manager.connect_device("COM99", "can_receiver")
        assert success is False
        diag = manager.get_role_diagnostic("can_receiver", "CAN Receiver ESP32")
        assert diag.status == "ERROR"
        assert "COM99" in diag.last_error


def test_busy_port_handling_without_spin_loop():
    """
    Test 3: Port occupied by another process (e.g. Arduino IDE) reports BUSY
    """
    import serial
    manager = SerialManager()
    with patch("serial.Serial", side_effect=serial.SerialException("PermissionError(13, 'Access is denied.', None, 5)")):
        success, msg = manager.connect_device("COM3", "vehicle_simulator")
        assert success is False
        assert "busy" in msg.lower() or "denied" in msg.lower()
        diag = manager.get_role_diagnostic("vehicle_simulator", "Vehicle Simulator ESP32")
        assert diag.status == "BUSY"
        assert "Arduino IDE" in diag.last_error or "busy" in diag.last_error.lower()


def test_invalid_json_and_malformed_lines():
    """
    Test 4: Receiving invalid JSON and debug noise increments malformed counter
    """
    conn = ManagedSerialConnection("COM6", "can_receiver")
    # Non-JSON debug output
    conn._process_message_line("[DEBUG] ESP32 boot completed, waiting for CAN transceiver...")
    assert conn.parsed_json_count == 0
    assert conn.malformed_message_count == 0
    assert "last_raw_line" in conn.details

    # Malformed JSON
    conn._process_message_line("{'type': 'broken_json', bad_syntax: true}")
    assert conn.malformed_message_count == 1
    assert conn.parsed_json_count == 0


def test_valid_device_identity_can_receiver():
    """
    Test 5: Valid device_hello message for CAN receiver correctly identifies device
    """
    conn = ManagedSerialConnection("COM6", "can_receiver")
    hello_msg = json.dumps({
        "type": "device_hello",
        "device_id": "apex-can-receiver-01",
        "role": "can_receiver",
        "firmware_version": "1.0.0",
        "protocol_version": 1,
        "uptime_ms": 12345
    })

    conn._process_message_line(hello_msg)
    assert conn.status == "CONNECTED"
    assert conn.device_verified is True
    assert conn.device_id == "apex-can-receiver-01"
    assert conn.firmware_version == "1.0.0"
    assert conn.uptime_ms == 12345

    diag = conn.get_diagnostic("CAN Receiver ESP32")
    assert diag.status == "CONNECTED"
    assert diag.device_id == "apex-can-receiver-01"


def test_valid_device_identity_vehicle_simulator():
    """
    Test 6: Valid device_hello message for Vehicle Simulator identifies simulator role
    """
    conn = ManagedSerialConnection("COM3", "vehicle_simulator")
    sim_hello = json.dumps({
        "type": "device_hello",
        "device_id": "apex-vehicle-sim-01",
        "role": "vehicle_simulator",
        "firmware_version": "1.0.0",
        "protocol_version": 1,
        "uptime_ms": 54321
    })

    conn._process_message_line(sim_hello)
    assert conn.status == "CONNECTED"
    assert conn.device_verified is True
    assert conn.device_id == "apex-vehicle-sim-01"
    assert conn.target_role == "vehicle_simulator"

    diag = conn.get_diagnostic("Vehicle Simulator ESP32")
    assert diag.can_status == "SIMULATOR_TRANSMITTING"


def test_stale_heartbeat_transition():
    """
    Test 7: Stale heartbeat timeout marks device STALE after 10s of silence
    """
    conn = ManagedSerialConnection("COM6", "can_receiver")
    conn.status = "CONNECTED"
    conn.device_verified = True
    conn.device_id = "apex-can-receiver-01"
    # Set last message to 15 seconds ago
    conn.last_message_at = datetime.now(timezone.utc) - timedelta(seconds=15)

    diag = conn.get_diagnostic("CAN Receiver ESP32")
    assert diag.status == "STALE"


def test_disconnect_and_reconnect():
    """
    Test 8: Disconnect closes port cleanly and allows subsequent reconnect
    """
    manager = SerialManager()
    mock_serial_instance = MagicMock()
    mock_serial_instance.is_open = True

    with patch("serial.Serial", return_value=mock_serial_instance):
        # 1. Connect
        success, _ = manager.connect_device("COM6", "can_receiver")
        assert success is True
        assert "COM6" in manager.active_connections

        # 2. Disconnect
        disc_ok = manager.disconnect_device("COM6")
        assert disc_ok is True
        assert "COM6" not in manager.active_connections
        mock_serial_instance.close.assert_called()

        # 3. Reconnect on another port
        success2, _ = manager.connect_device("COM7", "can_receiver")
        assert success2 is True
        assert "COM7" in manager.active_connections
        manager.disconnect_device("COM7")


def test_can_traffic_quiet_vs_active():
    """
    Test 9: Receiver with 0 frames reports QUIET / NO_TRAFFIC rather than broken
    """
    conn = ManagedSerialConnection("COM6", "can_receiver")
    conn.status = "CONNECTED"
    conn.last_message_at = datetime.now(timezone.utc)

    # Initially quiet
    diag_quiet = conn.get_diagnostic("CAN Receiver ESP32")
    assert "QUIET" in diag_quiet.can_status

    # Frame arrives
    conn._process_message_line(json.dumps({
        "type": "can_frame",
        "can_id": 0x7E8,
        "dlc": 8,
        "data": "03410D3200000000"
    }))
    diag_active = conn.get_diagnostic("CAN Receiver ESP32")
    assert diag_active.can_status == "OK"
    assert diag_active.can_frames_received == 1


def test_docker_host_serial_access_limitation():
    """
    Test 10: Docker vs Host serial limitation validation
    Verifies that native Windows paths and ports are documented and handled gracefully.
    """
    manager = SerialManager()
    # In a Linux Docker container on Windows, COM ports do not exist at /dev/ttyUSB without usbipd
    with patch("serial.tools.list_ports.comports", return_value=[]):
        ports = manager.enumerate_serial_ports()
        assert len(ports) == 0
        diag = manager.get_role_diagnostic("can_receiver", "CAN Receiver ESP32")
        assert diag.status == "NOT_CONFIGURED"
