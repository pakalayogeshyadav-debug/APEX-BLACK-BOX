import asyncio
import time
import uuid
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

from sqlalchemy.future import select
from sqlalchemy import insert
from app.core.database import AsyncSessionLocal
from app.models.models import Device, Event, Recording, RecordingSample, TelemetrySession
from app.schemas.schemas import TelemetryPayload, TelemetryData, CANStatistics
from app.services.vehicle_dynamics import VehicleDynamicsModel
from app.services.ingestion import ingestion_service
from app.services.websocket import ws_manager

logger = logging.getLogger(__name__)

class SimulatorService:
    """
    Authoritative backend simulation engine for APEX BLACKBOX.
    Executes a deterministic vehicle dynamics model at 10 Hz,
    coordinates preset scenarios, manages a 5-minute rolling buffer,
    and supports simulated black-box recording and test events.
    """

    def __init__(self):
        self.model = VehicleDynamicsModel()
        self.device_id = "apex-vehicle-simulator-01"
        self.session_id = str(uuid.uuid4())
        self.sequence_number = 0
        self.is_running = False
        self.is_paused = False
        self._task: Optional[asyncio.Task] = None

        # Scenario management
        self.active_scenario: Optional[str] = None
        self.scenario_start_time: float = 0.0
        self.scenario_elapsed_sec: float = 0.0

        # 5-minute rolling buffer (3000 samples at 10 Hz)
        self.rolling_buffer = deque(maxlen=3000)

        # Simulation recording state
        self.active_recording_id: Optional[uuid.UUID] = None
        self.recording_start_time: Optional[float] = None
        self.recording_samples: List[Dict[str, Any]] = []

        # Last loop tick tracking
        self.last_tick_time: float = time.time()
        self.db_persist_interval: float = 0.5 # Persist to DB at 2 Hz to avoid overloading MySQL
        self.last_db_persist_time: float = 0.0

    def start(self):
        """Start or restart the simulation."""
        if not self.is_running:
            self.is_running = True
            self.is_paused = False
            self.session_id = str(uuid.uuid4())
            self.sequence_number = 0
            self.last_tick_time = time.time()
            self.last_db_persist_time = 0.0
            # Initialize model with ignition on in Drive by default for immediate responsiveness
            self.model.set_controls(ignition=True, gear="D", parking_brake=False)
            self._task = asyncio.create_task(self._run())
            logger.info("SimulatorService started with session %s", self.session_id)

    def pause(self):
        """Pause simulation physics updates."""
        self.is_paused = True
        logger.info("SimulatorService paused")

    def resume(self):
        """Resume simulation physics updates."""
        self.is_paused = False
        self.last_tick_time = time.time()
        logger.info("SimulatorService resumed")

    async def stop(self):
        """Stop simulation and cancel background worker."""
        self.is_running = False
        self.is_paused = False
        self.active_scenario = None
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("SimulatorService stopped")

    def reset(self):
        """Reset vehicle physics, driver controls, and rolling buffer."""
        self.model.reset()
        self.active_scenario = None
        self.scenario_elapsed_sec = 0.0
        self.rolling_buffer.clear()
        self.sequence_number = 0
        logger.info("SimulatorService reset")

    def set_controls(
        self,
        accelerator: Optional[float] = None,
        brake: Optional[float] = None,
        steering: Optional[float] = None,
        gear: Optional[str] = None,
        ignition: Optional[bool] = None,
        parking_brake: Optional[bool] = None,
        headlights: Optional[bool] = None,
        turn_indicators: Optional[str] = None,
        hazard_lights: Optional[bool] = None
    ):
        """Apply manual controls. Overrides active scenario if user manually drives."""
        if accelerator is not None or brake is not None or steering is not None or gear is not None:
            if self.active_scenario and self.active_scenario != "Custom Drive":
                # Manual intervention stops automated preset scenario
                self.active_scenario = None
        self.model.set_controls(
            accelerator=accelerator,
            brake=brake,
            steering=steering,
            gear=gear,
            ignition=ignition,
            parking_brake=parking_brake,
            headlights=headlights,
            turn_indicators=turn_indicators,
            hazard_lights=hazard_lights
        )

    def start_scenario(self, scenario_name: str):
        """Activate one of the 9 preset simulation scenarios."""
        valid_scenarios = [
            "Idle", "City Driving", "Highway Cruising", "Hard Braking",
            "Sudden Acceleration", "Engine Overheating", "Low Battery",
            "Ignition Off", "Custom Drive"
        ]
        if scenario_name not in valid_scenarios:
            raise ValueError(f"Unknown scenario: {scenario_name}. Valid: {valid_scenarios}")

        self.active_scenario = scenario_name
        self.scenario_start_time = time.time()
        self.scenario_elapsed_sec = 0.0

        # Scenario initial state setup
        if scenario_name == "Idle":
            self.model.reset()
            self.model.set_controls(ignition=True, gear="P", parking_brake=True, accelerator=0.0, brake=0.0)
        elif scenario_name == "City Driving":
            self.model.reset()
            self.model.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.25, brake=0.0)
        elif scenario_name == "Highway Cruising":
            self.model.reset()
            self.model.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.7, brake=0.0)
        elif scenario_name == "Hard Braking":
            self.model.reset()
            # Accelerate up to speed before hard braking
            self.model.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.85, brake=0.0)
        elif scenario_name == "Sudden Acceleration":
            self.model.reset()
            self.model.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=1.0, brake=0.0)
        elif scenario_name == "Engine Overheating":
            self.model.overheating_failure = True
            self.model.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.65, brake=0.0)
        elif scenario_name == "Low Battery":
            self.model.low_battery_failure = True
            self.model.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.4, brake=0.0)
        elif scenario_name == "Ignition Off":
            # Simulate cruising at speed then ignition switch off
            self.model.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.6)
            for _ in range(40):
                self.model.step(0.1)
            self.model.set_controls(ignition=False, accelerator=0.0)
        elif scenario_name == "Custom Drive":
            self.model.set_controls(ignition=True, gear="D", parking_brake=False)

        if not self.is_running:
            self.start()

        logger.info("Scenario started: %s", scenario_name)

    def stop_scenario(self):
        """Stop the currently running scenario without stopping vehicle simulation."""
        self.active_scenario = None
        self.scenario_elapsed_sec = 0.0
        self.model.overheating_failure = False
        self.model.low_battery_failure = False
        logger.info("Scenario stopped")

    def _update_scenario(self, dt: float):
        """Advance the active preset scenario timeline."""
        if not self.active_scenario:
            return

        self.scenario_elapsed_sec += dt
        t = self.scenario_elapsed_sec

        if self.active_scenario == "Idle":
            self.model.set_controls(ignition=True, gear="P", parking_brake=True, accelerator=0.0, brake=0.0)

        elif self.active_scenario == "City Driving":
            cycle_time = t % 24.0 # 24 second stop-and-go cycle
            if cycle_time < 6.0:
                # Accelerate to ~40 km/h
                self.model.set_controls(gear="D", accelerator=0.35, brake=0.0, steering=0.0)
            elif cycle_time < 11.0:
                # Cruise with gentle turn
                self.model.set_controls(accelerator=0.18, brake=0.0, steering=0.2)
            elif cycle_time < 16.0:
                # Brake to a stop
                self.model.set_controls(accelerator=0.0, brake=0.45, steering=0.0)
            elif cycle_time < 19.0:
                # Hold at stoplight
                self.model.set_controls(accelerator=0.0, brake=0.8, steering=0.0)
            else:
                # Accelerate away with slight right turn
                self.model.set_controls(accelerator=0.4, brake=0.0, steering=-0.15)

        elif self.active_scenario == "Highway Cruising":
            current_spd = self.model.get_state()["vehicle_speed_kmh"]
            if current_spd < 110.0:
                self.model.set_controls(gear="D", accelerator=0.6, brake=0.0)
            else:
                # Maintain ~115 km/h smoothly
                throttle = 0.28 if current_spd < 115.0 else 0.20
                self.model.set_controls(accelerator=throttle, brake=0.0, steering=0.02)

        elif self.active_scenario == "Hard Braking":
            if t < 4.0:
                # Build speed to ~90 km/h
                self.model.set_controls(gear="D", accelerator=0.85, brake=0.0)
            elif t < 7.5:
                # Hard emergency brake! 100% brake pedal
                self.model.set_controls(accelerator=0.0, brake=1.0)
            else:
                # Vehicle stationary
                self.model.set_controls(accelerator=0.0, brake=0.6, parking_brake=True)

        elif self.active_scenario == "Sudden Acceleration":
            if t < 8.0:
                # Wide open throttle 0-100+ km/h
                self.model.set_controls(gear="D", accelerator=1.0, brake=0.0)
            else:
                # Level off
                self.model.set_controls(accelerator=0.3, brake=0.0)

        elif self.active_scenario == "Engine Overheating":
            self.model.overheating_failure = True
            self.model.set_controls(gear="D", accelerator=0.55, brake=0.0)

        elif self.active_scenario == "Low Battery":
            self.model.low_battery_failure = True
            self.model.set_controls(gear="D", accelerator=0.35, brake=0.0, headlights=True)

        elif self.active_scenario == "Ignition Off":
            self.model.set_controls(ignition=False, accelerator=0.0, brake=0.0)

    async def trigger_event(self, event_type: str, severity: str = "medium", description: str = "") -> Dict[str, Any]:
        """Trigger and record a simulated event (Phase 9 & 10)."""
        current_time_ms = int(time.time() * 1000)
        state = self.model.get_state()
        desc = description or f"Simulated {event_type} event triggered from Vehicle Simulator Console"

        event_id = uuid.uuid4()
        async with AsyncSessionLocal() as session:
            # Find simulator device
            dev_result = await session.execute(
                select(Device).where(Device.device_identifier == self.device_id)
            )
            device = dev_result.scalar_one_or_none()
            if not device:
                # Fallback to first available device or create
                all_devs = await session.execute(select(Device))
                device = all_devs.scalars().first()

            dev_uuid = device.id if device else uuid.uuid4()

            try:
                sess_uuid = uuid.UUID(self.session_id)
            except ValueError:
                sess_uuid = uuid.uuid5(uuid.NAMESPACE_OID, self.session_id)

            # Ensure session in db
            t_sess = await session.execute(select(TelemetrySession).where(TelemetrySession.id == sess_uuid))
            if not t_sess.scalar_one_or_none():
                session.add(TelemetrySession(
                    id=sess_uuid,
                    device_id=dev_uuid,
                    source_mode="SIMULATION",
                    status="ACTIVE"
                ))
                await session.commit()

            evt = Event(
                id=event_id,
                device_id=dev_uuid,
                session_id=sess_uuid,
                event_type=event_type,
                severity=severity,
                trigger_timestamp_ms=current_time_ms,
                detected_at=datetime.now(timezone.utc),
                description=desc,
                trigger_metadata={
                    "vehicle_speed_kmh": state["vehicle_speed_kmh"],
                    "engine_rpm": state["engine_rpm"],
                    "coolant_temp_c": state["coolant_temp_c"],
                    "battery_voltage_v": state["battery_voltage_v"],
                    "deceleration_mps2": state["deceleration_mps2"],
                    "simulated": True
                },
                source_mode="SIMULATION",
                recording_id=self.active_recording_id
            )
            session.add(evt)
            await session.commit()

        # Broadcast event via WS
        await ws_manager.broadcast({
            "type": "event.new",
            "data": {
                "id": str(event_id),
                "event_type": event_type,
                "description": desc,
                "severity": severity,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "source_mode": "SIMULATION"
            }
        })

        logger.info("Simulated event triggered: %s (id: %s)", event_type, event_id)
        return {
            "id": str(event_id),
            "event_type": event_type,
            "severity": severity,
            "description": desc,
            "source_mode": "SIMULATION"
        }

    async def start_recording(self, requested_duration_sec: int = 300) -> Dict[str, Any]:
        """Start a simulation blackbox recording session."""
        rec_id = uuid.uuid4()
        req_id = uuid.uuid4()
        self.active_recording_id = rec_id
        self.recording_start_time = time.time()
        self.recording_samples = []

        async with AsyncSessionLocal() as session:
            dev_result = await session.execute(
                select(Device).where(Device.device_identifier == self.device_id)
            )
            device = dev_result.scalar_one_or_none()
            dev_uuid = device.id if device else uuid.uuid4()

            try:
                sess_uuid = uuid.UUID(self.session_id)
            except ValueError:
                sess_uuid = uuid.uuid5(uuid.NAMESPACE_OID, self.session_id)

            rec = Recording(
                id=rec_id,
                device_id=dev_uuid,
                session_id=sess_uuid,
                recording_type="SIMULATED_BLACKBOX",
                source_mode="SIMULATION",
                requested_duration_sec=requested_duration_sec,
                transfer_status="RECORDING",
                retrieval_request_id=req_id,
                sample_count=0
            )
            session.add(rec)
            await session.commit()

        await ws_manager.broadcast({
            "type": "recording.status",
            "data": {
                "recording_id": str(rec_id),
                "status": "RECORDING",
                "progress": 0.0,
                "source_mode": "SIMULATION"
            }
        })

        return {
            "recording_id": str(rec_id),
            "status": "RECORDING",
            "source_mode": "SIMULATION"
        }

    async def stop_recording(self) -> Dict[str, Any]:
        """Stop and finalize current simulation blackbox recording using rolling buffer samples."""
        if not self.active_recording_id:
            return {"status": "no_active_recording"}

        rec_id = self.active_recording_id
        self.active_recording_id = None
        duration_sec = 0.0
        if self.recording_start_time:
            duration_sec = round(time.time() - self.recording_start_time, 2)

        # Grab captured samples or recent rolling buffer samples
        samples_to_save = list(self.recording_samples)
        if not samples_to_save and self.rolling_buffer:
            # Export up to 3000 samples from rolling buffer
            samples_to_save = list(self.rolling_buffer)

        async with AsyncSessionLocal() as session:
            rec_result = await session.execute(select(Recording).where(Recording.id == rec_id))
            rec = rec_result.scalar_one_or_none()
            if rec:
                rec.transfer_status = "COMPLETED"
                rec.integrity_status = "VERIFIED"
                rec.sample_count = len(samples_to_save)
                rec.actual_duration_sec = duration_sec

                if samples_to_save:
                    first_ts = samples_to_save[0].get("timestamp_ms", int(time.time() * 1000))
                    last_ts = samples_to_save[-1].get("timestamp_ms", int(time.time() * 1000))
                    if first_ts >= 946684800000:
                        rec.recording_start_at = datetime.fromtimestamp(first_ts / 1000.0, tz=timezone.utc)
                        rec.recording_end_at = datetime.fromtimestamp(last_ts / 1000.0, tz=timezone.utc)

                    # Bulk insert up to 300 samples to keep DB fast
                    chunk_to_insert = samples_to_save[-300:]
                    rec_samples = [
                        RecordingSample(
                            recording_id=rec_id,
                            original_timestamp_ms=s.get("timestamp_ms", 0),
                            original_sequence_number=s.get("sequence_number", 0),
                            telemetry_data={
                                "vehicle_speed_kmh": s.get("speed_kmh"),
                                "engine_rpm": s.get("rpm"),
                                "throttle_percent": s.get("throttle"),
                                "deceleration_mps2": s.get("deceleration")
                            }
                        )
                        for s in chunk_to_insert
                    ]
                    session.add_all(rec_samples)

                await session.commit()

        await ws_manager.broadcast({
            "type": "recording.status",
            "data": {
                "recording_id": str(rec_id),
                "status": "COMPLETED",
                "progress": 1.0,
                "sample_count": len(samples_to_save),
                "source_mode": "SIMULATION"
            }
        })

        return {
            "recording_id": str(rec_id),
            "status": "COMPLETED",
            "sample_count": len(samples_to_save),
            "actual_duration_sec": duration_sec,
            "source_mode": "SIMULATION"
        }

    def get_full_state(self) -> Dict[str, Any]:
        """Get comprehensive authoritative vehicle and simulation state."""
        state = self.model.get_state()
        state.update({
            "is_running": self.is_running,
            "is_paused": self.is_paused,
            "session_id": self.session_id,
            "device_id": self.device_id,
            "sequence_number": self.sequence_number,
            "active_scenario": self.active_scenario,
            "scenario_elapsed_sec": round(self.scenario_elapsed_sec, 1),
            "rolling_buffer_samples": len(self.rolling_buffer),
            "is_recording": self.active_recording_id is not None,
            "active_recording_id": str(self.active_recording_id) if self.active_recording_id else None
        })
        return state

    async def _run(self):
        """Simulation physics worker running at 10 Hz."""
        while self.is_running:
            now = time.time()
            dt = now - self.last_tick_time
            self.last_tick_time = now

            if not self.is_paused:
                # 1. Update scenario if active
                self._update_scenario(dt)

                # 2. Physics integration step
                self.model.step(dt)

                # 3. Read current state
                state = self.model.get_state()
                current_time_ms = int(now * 1000)

                # 4. Save to rolling buffer
                sample_item = {
                    "timestamp_ms": current_time_ms,
                    "sequence_number": self.sequence_number,
                    "speed_kmh": state["vehicle_speed_kmh"],
                    "rpm": state["engine_rpm"],
                    "throttle": state["accelerator_percent"],
                    "deceleration": state["deceleration_mps2"],
                    "gear": state["current_gear"],
                    "heading": state["heading_deg"],
                    "coolant": state["coolant_temp_c"],
                    "battery": state["battery_voltage_v"]
                }
                self.rolling_buffer.append(sample_item)

                if self.active_recording_id is not None:
                    self.recording_samples.append(sample_item)

                # 5. Broadcast complete state directly to WS clients for zero-latency instrumentation
                full_state = self.get_full_state()
                await ws_manager.broadcast({
                    "schema_version": 1,
                    "type": "simulator.state",
                    "source_mode": "SIMULATION",
                    "sequence_number": self.sequence_number,
                    "server_timestamp": datetime.now(timezone.utc).isoformat(),
                    "data": full_state
                })

                # 6. Periodic ingestion to existing pipeline (for telemetry history & event detection)
                # Persist at 2 Hz or when significant deceleration occurs
                if (now - self.last_db_persist_time >= self.db_persist_interval) or (state["deceleration_mps2"] > 4.0):
                    self.last_db_persist_time = now
                    payload = TelemetryPayload(
                        schema_version=1,
                        device_id=self.device_id,
                        session_id=self.session_id,
                        sequence_number=self.sequence_number,
                        device_timestamp_ms=current_time_ms,
                        source_mode="SIMULATION",
                        telemetry=TelemetryData(
                            vehicle_speed_kmh=state["vehicle_speed_kmh"],
                            engine_rpm=state["engine_rpm"],
                            throttle_percent=state["accelerator_percent"],
                            deceleration_mps2=state["deceleration_mps2"]
                        ),
                        can_statistics=CANStatistics(
                            received_frames=self.sequence_number * 8,
                            dropped_frames=0
                        )
                    )
                    try:
                        await ingestion_service.ingest(payload)
                    except Exception as e:
                        logger.debug("Ingestion during simulation skipped: %s", e)

                self.sequence_number += 1

            await asyncio.sleep(0.1)  # 10 Hz loop

simulator_service = SimulatorService()
