import pytest
import json
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta

from app.services.diagnostics import diagnostics_service, DiagnosticsService
from app.services.ingestion import ingestion_service
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_diagnostics_database_available():
    diag = await diagnostics_service.evaluate_database_health()
    assert diag.name == "MySQL Database"
    assert diag.status == "CONNECTED"
    assert diag.details.get("query_status") == "OK"
    assert diag.error is None

@pytest.mark.asyncio
async def test_diagnostics_database_unavailable():
    with patch("app.services.diagnostics.AsyncSessionLocal") as mock_session_local:
        mock_session_local.side_effect = Exception("Connection refused to 3306")
        diag = await diagnostics_service.evaluate_database_health()
        assert diag.name == "MySQL Database"
        assert diag.status == "ERROR"
        assert "failure" in diag.error.lower() or "timed out" in diag.error.lower()

def test_diagnostics_no_serial_ports_detected():
    with patch("serial.tools.list_ports.comports", return_value=[]):
        ports = diagnostics_service.enumerate_serial_ports()
        assert len(ports) == 0

@pytest.mark.asyncio
async def test_diagnostics_serial_subsystem_not_configured():
    with patch.object(diagnostics_service, "enumerate_serial_ports", return_value=[]):
        diag = await diagnostics_service.evaluate_serial_diagnostics()
        assert diag.name == "USB / Serial Interface"
        assert diag.status == "NOT_CONFIGURED"

def test_diagnostics_serial_port_detected_no_response():
    mock_port = MagicMock()
    mock_port.device = "COM10"
    mock_port.description = "USB Serial"
    mock_port.hwid = "USB\\VID_1A86&PID_7523"
    mock_port.vid = 0x1A86
    mock_port.pid = 0x7523
    mock_port.manufacturer = "WCH"

    mock_serial_instance = MagicMock()
    mock_serial_instance.is_open = True
    mock_serial_instance.readline.return_value = b"" # Timeout, empty line

    with patch("serial.tools.list_ports.comports", return_value=[mock_port]), \
         patch("serial.Serial", return_value=mock_serial_instance):
        resp = diagnostics_service.probe_serial_port("COM10", timeout_sec=0.2)
        assert resp.port == "COM10"
        assert resp.status == "DISCONNECTED"
        assert resp.device_verified is False
        assert "timed out" in resp.message.lower()

def test_diagnostics_correct_serial_handshake_received():
    mock_port = MagicMock()
    mock_port.device = "COM10"
    mock_port.description = "Silicon Labs CP210x"
    mock_port.hwid = "USB\\VID_10C4&PID_EA60"
    mock_port.vid = 0x10C4
    mock_port.pid = 0xEA60
    mock_port.manufacturer = "Silicon Labs"

    mock_serial_instance = MagicMock()
    mock_serial_instance.is_open = True
    payload = json.dumps({
        "device_id": "logger-001",
        "role": "LOGGER",
        "firmware_version": "1.2.0",
        "status": "READY"
    }).encode("utf-8") + b"\n"
    mock_serial_instance.readline.return_value = payload

    with patch("serial.tools.list_ports.comports", return_value=[mock_port]), \
         patch("serial.Serial", return_value=mock_serial_instance):
        resp = diagnostics_service.probe_serial_port("COM10", timeout_sec=0.2)
        assert resp.port == "COM10"
        assert resp.status == "CONNECTED"
        assert resp.device_verified is True
        assert resp.device_info["device_id"] == "logger-001"
        assert resp.device_info["role"] == "LOGGER"

@pytest.mark.asyncio
async def test_diagnostics_telemetry_freshness_states():
    # 1. Stale state (between 4s and 15s)
    ingestion_service.latest_stats["last_packet_time"] = datetime.now(timezone.utc) - timedelta(seconds=6.0)
    ingestion_service.latest_stats["last_source_mode"] = "LIVE"
    ingestion_service.latest_stats["total_received_packets"] = 50
    ingestion_service.latest_stats["last_sequence_number"] = 123

    stale_diag = await diagnostics_service.evaluate_telemetry_reception()
    assert stale_diag.status == "DEGRADED"
    assert "paused" in stale_diag.error.lower()

    # 2. Offline state (> 15s)
    ingestion_service.latest_stats["last_packet_time"] = datetime.now(timezone.utc) - timedelta(seconds=20.0)
    offline_diag = await diagnostics_service.evaluate_telemetry_reception()
    assert offline_diag.status == "DISCONNECTED"
    assert "offline" in offline_diag.error.lower()

    # 3. Fresh simulated state (< 4s)
    ingestion_service.latest_stats["last_packet_time"] = datetime.now(timezone.utc) - timedelta(seconds=0.5)
    ingestion_service.latest_stats["last_source_mode"] = "SIMULATION"
    sim_diag = await diagnostics_service.evaluate_telemetry_reception()
    assert sim_diag.status == "SIMULATED"

    # Reset
    ingestion_service.latest_stats["last_packet_time"] = None
    ingestion_service.latest_stats["last_source_mode"] = None

@pytest.mark.asyncio
async def test_diagnostics_can_bus_states():
    # 1. No CAN frames observed
    ingestion_service.latest_stats["last_packet_time"] = datetime.now(timezone.utc) - timedelta(seconds=1.0)
    ingestion_service.latest_stats["last_source_mode"] = "LIVE"
    ingestion_service.latest_stats["last_can_frame_count"] = 0
    can_diag = await diagnostics_service.evaluate_can_bus()
    assert can_diag.status == "DEGRADED"
    assert "no can traffic" in can_diag.error.lower()

    # 2. Simulation mode CAN bus
    ingestion_service.latest_stats["last_source_mode"] = "SIMULATION"
    can_sim_diag = await diagnostics_service.evaluate_can_bus()
    assert can_sim_diag.status == "SIMULATED"

    # Reset
    ingestion_service.latest_stats["last_packet_time"] = None
    ingestion_service.latest_stats["last_source_mode"] = None

@pytest.mark.asyncio
async def test_diagnostics_full_api_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/api/v1/diagnostics")
        assert res.status_code == 200
        data = res.json()
        assert "backend" in data
        assert "database" in data
        assert "serial_interface" in data
        assert "esp32_logger" in data
        assert "esp32_gateway" in data
        assert "logger_to_gateway" in data
        assert "can_bus" in data
        assert "gateway_to_backend" in data
        assert "telemetry_reception" in data
        assert "detected_serial_ports" in data
        assert data["backend"]["status"] == "CONNECTED"
        assert data["database"]["status"] == "CONNECTED"

@pytest.mark.asyncio
async def test_diagnostics_serial_ports_api_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/api/v1/diagnostics/serial/ports")
        assert res.status_code == 200
        ports = res.json()
        assert isinstance(ports, list)
