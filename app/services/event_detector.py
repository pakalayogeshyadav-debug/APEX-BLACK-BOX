import uuid
import logging
from typing import List, Dict, Any
from datetime import datetime, timezone

from sqlalchemy.future import select
from sqlalchemy import insert
from app.core.database import AsyncSessionLocal
from app.models.models import Event
from app.services.websocket import ws_manager

logger = logging.getLogger(__name__)

class EventDetector:
    def __init__(self):
        # device_id -> { last_speed: float, last_ts: int }
        self._state: Dict[uuid.UUID, Dict[str, Any]] = {}
        self.DECEL_THRESHOLD_G = 0.8
        self.G_TO_MPS2 = 9.81
        
    async def process_samples(self, samples: List[Dict[str, Any]]):
        if not samples:
            return
            
        events_to_create = []
        
        # Sort samples to ensure chronological order for detection
        samples.sort(key=lambda s: s["device_timestamp_ms"])
        
        for sample in samples:
            device_id = sample["device_id"]
            current_speed_kmh = sample["vehicle_speed_kmh"]
            current_ts = sample["device_timestamp_ms"]
            
            if current_speed_kmh is None:
                continue
                
            if device_id not in self._state:
                self._state[device_id] = {"last_speed": current_speed_kmh, "last_ts": current_ts, "cooldown_until": 0}
                continue
                
            state = self._state[device_id]
            
            # Skip if in cooldown
            if current_ts < state.get("cooldown_until", 0):
                state["last_speed"] = current_speed_kmh
                state["last_ts"] = current_ts
                continue
            
            dt_s = (current_ts - state["last_ts"]) / 1000.0
            
            if 0 < dt_s < 2.0: # Valid consecutive readings within 2 seconds
                # Calculate deceleration
                dv_kmh = current_speed_kmh - state["last_speed"]
                dv_mps = dv_kmh / 3.6
                decel_mps2 = -dv_mps / dt_s
                
                # If deceleration > threshold G
                if decel_mps2 > (self.DECEL_THRESHOLD_G * self.G_TO_MPS2):
                    sess_id_val = sample["session_id"]
                    if isinstance(sess_id_val, str):
                        try:
                            sess_id_val = uuid.UUID(sess_id_val)
                        except ValueError:
                            sess_id_val = uuid.uuid5(uuid.NAMESPACE_OID, sess_id_val)
                    
                    dev_id_val = device_id
                    if isinstance(dev_id_val, str):
                        try:
                            dev_id_val = uuid.UUID(dev_id_val)
                        except ValueError:
                            dev_id_val = uuid.uuid5(uuid.NAMESPACE_OID, dev_id_val)

                    events_to_create.append({
                        "id": uuid.uuid4(),
                        "device_id": dev_id_val,
                        "session_id": sess_id_val,
                        "event_type": "HARD_BRAKING",
                        "severity": "medium",
                        "trigger_timestamp_ms": current_ts,
                        "detected_at": datetime.now(timezone.utc),
                        "description": f"Deceleration {decel_mps2/self.G_TO_MPS2:.2f}G detected",
                        "trigger_metadata": {
                            "deceleration_mps2": decel_mps2,
                            "speed_before_kmh": state["last_speed"],
                            "speed_after_kmh": current_speed_kmh,
                            "dt_s": dt_s
                        },
                        "source_mode": sample["source_mode"]
                    })
                    # 5 second cooldown
                    state["cooldown_until"] = current_ts + 5000
                    
            state["last_speed"] = current_speed_kmh
            state["last_ts"] = current_ts
            
        if events_to_create:
            async with AsyncSessionLocal() as session:
                stmt = insert(Event).values(events_to_create)
                await session.execute(stmt)
                await session.commit()
                
            # Broadcast events
            for evt in events_to_create:
                await ws_manager.broadcast({
                    "type": "event.new",
                    "data": {
                        "id": str(evt["id"]),
                        "event_type": evt["event_type"],
                        "description": evt["description"],
                        "severity": evt["severity"],
                        "timestamp": evt["detected_at"].isoformat()
                    }
                })

event_detector = EventDetector()
