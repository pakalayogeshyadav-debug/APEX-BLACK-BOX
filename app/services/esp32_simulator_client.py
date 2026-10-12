import logging
import time
from typing import Dict, Any, Optional
import httpx
from pydantic import BaseModel, Field, field_validator
from app.core.config import settings

logger = logging.getLogger(__name__)

class ESP32SimulatorControls(BaseModel):
    accelerator: float = Field(0.0, ge=0.0, le=100.0)
    brake: float = Field(0.0, ge=0.0, le=100.0)
    steering: float = Field(0.0, ge=-100.0, le=100.0)
    gear: str = Field("P")
    ignition: bool = Field(False)
    parking_brake: bool = Field(True)
    headlights: bool = Field(False)
    turn_indicators: str = Field("OFF")
    hazard_lights: bool = Field(False)

    @field_validator("gear")
    @classmethod
    def validate_gear(cls, v: str) -> str:
        upper = v.upper()
        if upper not in ("P", "R", "N", "D"):
            raise ValueError(f"Invalid gear: '{v}'. Must be P, R, N, or D.")
        return upper

    @field_validator("turn_indicators")
    @classmethod
    def validate_indicators(cls, v: str) -> str:
        upper = v.upper()
        if upper not in ("OFF", "LEFT", "RIGHT"):
            raise ValueError(f"Invalid turn indicator: '{v}'. Must be OFF, LEFT, or RIGHT.")
        return upper


class ESP32SimulatorClient:
    """
    Asynchronous Wi-Fi HTTP client communicating directly with
    ESP32 #1 (Hardware Vehicle Simulator) via LAN IP.
    """
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.simulator_esp32_base_url).rstrip("/")
        self.status: str = "DISCONNECTED"  # CONNECTED, CONNECTING, DISCONNECTED, ERROR
        self.last_connected_at: Optional[float] = None
        self.last_error: Optional[str] = None
        self.last_latency_ms: Optional[float] = None
        self.device_info: Dict[str, Any] = {}
        self.command_sequence: int = 0
        self._client: Optional[httpx.AsyncClient] = None

    def set_base_url(self, new_url: str):
        cleaned = new_url.strip().rstrip("/")
        if not cleaned.startswith("http://") and not cleaned.startswith("https://"):
            cleaned = f"http://{cleaned}"
        self.base_url = cleaned
        self.status = "DISCONNECTED"
        logger.info(f"Updated ESP32 Simulator Base URL: {self.base_url}")

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=1.5)
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def check_connectivity(self) -> Dict[str, Any]:
        """
        Polls the ESP32 status/ping endpoint over Wi-Fi.
        Measures round-trip latency and validates device identity.
        """
        self.status = "CONNECTING"
        start_time = time.time()
        client = await self._get_client()

        try:
            url = f"{self.base_url}/api/status"
            response = await client.get(url, timeout=1.5)
            latency_ms = round((time.time() - start_time) * 1000, 2)
            self.last_latency_ms = latency_ms

            if response.status_code == 200:
                data = response.json()
                self.status = "CONNECTED"
                self.last_connected_at = time.time()
                self.last_error = None
                self.device_info = data
                return {
                    "connected": True,
                    "status": "CONNECTED",
                    "base_url": self.base_url,
                    "latency_ms": latency_ms,
                    "device": data
                }
            else:
                self.status = "ERROR"
                err = f"ESP32 returned HTTP {response.status_code}: {response.text[:100]}"
                self.last_error = err
                return {
                    "connected": False,
                    "status": "ERROR",
                    "base_url": self.base_url,
                    "error": err
                }

        except httpx.TimeoutException:
            self.status = "DISCONNECTED"
            self.last_error = f"Connection timed out after 1.5s ({self.base_url})"
            return {
                "connected": False,
                "status": "DISCONNECTED",
                "base_url": self.base_url,
                "error": self.last_error
            }
        except httpx.ConnectError:
            self.status = "DISCONNECTED"
            self.last_error = f"Cannot connect to ESP32 at {self.base_url} (Host unreachable)"
            return {
                "connected": False,
                "status": "DISCONNECTED",
                "base_url": self.base_url,
                "error": self.last_error
            }
        except Exception as e:
            self.status = "DISCONNECTED"
            self.last_error = f"Network error: {str(e)}"
            return {
                "connected": False,
                "status": "DISCONNECTED",
                "base_url": self.base_url,
                "error": self.last_error
            }

    async def send_controls(self, controls: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates control inputs and forwards them via HTTP POST to ESP32 #1.
        Never reports success unless the hardware device explicitly acknowledges with 200 OK.
        """
        # Validate inputs via Pydantic model
        validated = ESP32SimulatorControls(**controls)
        self.command_sequence += 1

        client = await self._get_client()
        start_time = time.time()
        url = f"{self.base_url}/api/controls"
        payload = validated.model_dump()
        payload["seq"] = self.command_sequence

        try:
            response = await client.post(url, json=payload, timeout=1.5)
            latency_ms = round((time.time() - start_time) * 1000, 2)
            self.last_latency_ms = latency_ms

            if response.status_code == 200:
                self.status = "CONNECTED"
                self.last_connected_at = time.time()
                self.last_error = None
                ack_data = response.json()
                return {
                    "acknowledged": True,
                    "status": "SUCCESS",
                    "latency_ms": latency_ms,
                    "sequence": self.command_sequence,
                    "hardware_response": ack_data
                }
            else:
                self.status = "ERROR"
                err = f"ESP32 rejected control with HTTP {response.status_code}: {response.text[:100]}"
                self.last_error = err
                return {
                    "acknowledged": False,
                    "status": "FAILED",
                    "error": err,
                    "sequence": self.command_sequence
                }

        except httpx.TimeoutException:
            self.status = "DISCONNECTED"
            self.last_error = f"Command timed out after 1.5s ({self.base_url})"
            return {
                "acknowledged": False,
                "status": "TIMEOUT",
                "error": self.last_error,
                "sequence": self.command_sequence
            }
        except Exception as e:
            self.status = "DISCONNECTED"
            self.last_error = f"Failed to forward controls to ESP32: {str(e)}"
            return {
                "acknowledged": False,
                "status": "ERROR",
                "error": self.last_error,
                "sequence": self.command_sequence
            }

    async def start_simulation(self) -> Dict[str, Any]:
        """Sends command to start CAN frame transmission on ESP32."""
        client = await self._get_client()
        try:
            res = await client.post(f"{self.base_url}/api/start", timeout=1.5)
            if res.status_code == 200:
                self.status = "CONNECTED"
                return {"acknowledged": True, "data": res.json()}
            return {"acknowledged": False, "error": f"HTTP {res.status_code}: {res.text}"}
        except Exception as e:
            self.status = "DISCONNECTED"
            self.last_error = str(e)
            return {"acknowledged": False, "error": str(e)}

    async def stop_simulation(self) -> Dict[str, Any]:
        """Sends command to stop CAN frame transmission on ESP32."""
        client = await self._get_client()
        try:
            res = await client.post(f"{self.base_url}/api/stop", timeout=1.5)
            if res.status_code == 200:
                self.status = "CONNECTED"
                return {"acknowledged": True, "data": res.json()}
            return {"acknowledged": False, "error": f"HTTP {res.status_code}: {res.text}"}
        except Exception as e:
            self.status = "DISCONNECTED"
            self.last_error = str(e)
            return {"acknowledged": False, "error": str(e)}

    def get_summary(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "base_url": self.base_url,
            "last_connected_at": self.last_connected_at,
            "last_latency_ms": self.last_latency_ms,
            "last_error": self.last_error,
            "command_sequence": self.command_sequence,
            "device_info": self.device_info
        }

esp32_simulator_client = ESP32SimulatorClient()
