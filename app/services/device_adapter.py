import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List
import uuid

logger = logging.getLogger(__name__)

class DeviceAdapterInterface(ABC):
    """
    Interface for integrating with the actual ESP32 gateway.
    Because the specific hardware protocol (UART, CAN, ESP-NOW, HTTP) is pending,
    this interface encapsulates the commands sent to the hardware layer.
    """
    
    @abstractmethod
    async def send_retrieval_command(self, device_id: str, request_id: uuid.UUID, duration_sec: int) -> bool:
        """
        Sends a command to the ESP32 gateway instructing it to ask the logger 
        for the past N seconds of telemetry.
        """
        pass
        
    @abstractmethod
    async def check_device_connectivity(self, device_id: str) -> bool:
        """
        Returns True if the device is confirmed online via heartbeat or active connection.
        """
        pass

class SimulatorDeviceAdapter(DeviceAdapterInterface):
    """
    Deterministic simulated logger that supports the retrieval interface.
    """
    def __init__(self):
        self.connected = True
        
    async def send_retrieval_command(self, device_id: str, request_id: uuid.UUID, duration_sec: int) -> bool:
        logger.info(f"[SIMULATOR] Sending retrieval command to {device_id} for {duration_sec}s (Req: {request_id})")
        if not self.connected:
            return False
            
        # In a real system, the ESP32 would receive this command, dump its buffer, 
        # and POST chunks back to the API. 
        # We will simulate the device POSTing chunks back by scheduling a background task.
        import asyncio
        asyncio.create_task(self._simulate_device_upload(device_id, request_id, duration_sec))
        return True
        
    async def check_device_connectivity(self, device_id: str) -> bool:
        return self.connected

    async def _simulate_device_upload(self, device_id: str, request_id: uuid.UUID, duration_sec: int):
        import asyncio
        import httpx
        import time
        from datetime import datetime, timezone, timedelta
        
        # Simulate delay
        await asyncio.sleep(1)
        
        # We simulate that the logger has 50 seconds of data (10hz) -> 500 samples
        available_sec = min(duration_sec, 50)
        total_samples = available_sec * 10
        chunks = 5
        samples_per_chunk = total_samples // chunks
        
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(seconds=available_sec)
        
        current_time_ms = int(start_time.timestamp() * 1000)
        
        async with httpx.AsyncClient() as client:
            for chunk_idx in range(chunks):
                samples = []
                for s in range(samples_per_chunk):
                    samples.append({
                        "original_timestamp_ms": current_time_ms,
                        "original_sequence_number": (chunk_idx * samples_per_chunk) + s,
                        "telemetry_data": {
                            "vehicle_speed_kmh": 50.0 + chunk_idx,
                            "engine_rpm": 3000 + (chunk_idx * 100)
                        }
                    })
                    current_time_ms += 100
                
                payload = {
                    "retrieval_request_id": str(request_id),
                    "chunk_index": chunk_idx,
                    "total_chunks": chunks,
                    "samples": samples,
                    "chunk_checksum": "simulated_hash"
                }
                
                try:
                    await client.post(
                        "http://localhost:8000/api/v1/blackbox/chunk",
                        json=payload,
                        headers={"X-API-Key": "ApexESP32SecretKey_2097!"}
                    )
                except Exception as e:
                    logger.error(f"Simulator upload failed: {e}")
                
                await asyncio.sleep(0.5)

device_adapter = SimulatorDeviceAdapter()
