import pytest
import httpx
from httpx import ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_simulation_api_lifecycle():
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Start simulation
        start_res = await client.post("/api/v1/simulator/start")
        assert start_res.status_code == 200
        data = start_res.json()
        assert data["status"] == "Simulator started"
        assert data["state"]["is_running"] is True

        # 2. Get state
        state_res = await client.get("/api/v1/simulator/state")
        assert state_res.status_code == 200
        state = state_res.json()
        assert state["source_mode"] == "SIMULATION"
        assert "vehicle_speed_kmh" in state
        assert "engine_rpm" in state

        # 3. Pause
        pause_res = await client.post("/api/v1/simulator/pause")
        assert pause_res.status_code == 200
        assert pause_res.json()["state"]["is_paused"] is True

        # 4. Resume
        resume_res = await client.post("/api/v1/simulator/resume")
        assert resume_res.status_code == 200
        assert resume_res.json()["state"]["is_paused"] is False

        # 5. Stop
        stop_res = await client.post("/api/v1/simulator/stop")
        assert stop_res.status_code == 200
        assert stop_res.json()["state"]["is_running"] is False

@pytest.mark.asyncio
async def test_simulation_controls_validation():
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Valid controls
        res = await client.post("/api/v1/simulator/controls", json={
            "accelerator": 75.0,
            "brake": 0.0,
            "steering": 25.0,
            "gear": "D",
            "ignition": True,
            "parking_brake": False,
            "headlights": True,
            "turn_indicators": "LEFT"
        })
        assert res.status_code == 200
        state = res.json()["state"]
        assert state["accelerator_percent"] == 75.0
        assert state["current_gear"] == "D"
        assert state["headlights"] is True
        assert state["turn_indicators"] == "LEFT"

        # Invalid controls (accelerator > 100)
        invalid_res = await client.post("/api/v1/simulator/controls", json={
            "accelerator": 150.0
        })
        assert invalid_res.status_code == 422 # Pydantic validation error

        # Invalid gear
        invalid_gear_res = await client.post("/api/v1/simulator/controls", json={
            "gear": "X"
        })
        assert invalid_gear_res.status_code == 422

@pytest.mark.asyncio
async def test_simulation_scenarios():
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Start valid scenario
        scen_res = await client.post("/api/v1/simulator/scenario/start", json={
            "scenario_name": "City Driving"
        })
        assert scen_res.status_code == 200
        assert scen_res.json()["scenario"] == "City Driving"
        assert scen_res.json()["state"]["active_scenario"] == "City Driving"

        # Stop scenario
        stop_scen = await client.post("/api/v1/simulator/scenario/stop")
        assert stop_scen.status_code == 200
        assert stop_scen.json()["state"]["active_scenario"] is None

        # Invalid scenario
        bad_scen = await client.post("/api/v1/simulator/scenario/start", json={
            "scenario_name": "Rocket Launch"
        })
        assert bad_scen.status_code == 400

@pytest.mark.asyncio
async def test_simulation_trigger_event():
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/simulator/trigger-event", json={
            "event_type": "HARD_BRAKING",
            "severity": "high",
            "description": "Simulated panic stop at intersection"
        })
        assert res.status_code == 200
        evt = res.json()["event"]
        assert evt["event_type"] == "HARD_BRAKING"
        assert evt["severity"] == "high"
        assert evt["source_mode"] == "SIMULATION"

@pytest.mark.asyncio
async def test_simulation_recording_lifecycle():
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Start recording
        start_rec = await client.post("/api/v1/simulator/recording/start", json={
            "duration_sec": 60
        })
        assert start_rec.status_code == 200
        assert start_rec.json()["status"] == "RECORDING"
        assert start_rec.json()["source_mode"] == "SIMULATION"

        # Stop recording
        stop_rec = await client.post("/api/v1/simulator/recording/stop")
        assert stop_rec.status_code == 200
        assert stop_rec.json()["status"] == "COMPLETED"
        assert stop_rec.json()["source_mode"] == "SIMULATION"
