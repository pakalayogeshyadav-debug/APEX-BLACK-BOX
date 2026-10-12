import logging
from collections import deque
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from app.schemas.schemas import RawCANFrameSchema, DecodedTelemetrySignal, CANControllerConfig

logger = logging.getLogger(__name__)

class CANDecoderService:
    """
    Manages Raw CAN frame acquisition (Mode A) and Vehicle Signal Decoding (Mode B).
    Preserves raw frames independently of whether a signal decoder exists.
    """
    def __init__(self, max_buffer_size: int = 1000):
        self.raw_frames_buffer: deque[RawCANFrameSchema] = deque(maxlen=max_buffer_size)
        self.config = CANControllerConfig()
        self.stats = {
            "total_frames_received": 0,
            "standard_frames_count": 0,
            "extended_frames_count": 0,
            "dropped_frames_count": 0,
            "error_frames_count": 0,
            "last_frame_timestamp_us": None,
            "last_received_utc": None
        }
        # In-memory latest decoded values (Mode B)
        self.latest_signals: Dict[str, DecodedTelemetrySignal] = {
            "vehicle_speed": DecodedTelemetrySignal(
                signal_name="vehicle_speed",
                value=None,
                unit="km/h",
                is_valid=False,
                source_can_id=0,
                timestamp_us=0
            ),
            "engine_rpm": DecodedTelemetrySignal(
                signal_name="engine_rpm",
                value=None,
                unit="RPM",
                is_valid=False,
                source_can_id=0,
                timestamp_us=0
            ),
            "throttle_position": DecodedTelemetrySignal(
                signal_name="throttle_position",
                value=None,
                unit="%",
                is_valid=False,
                source_can_id=0,
                timestamp_us=0
            ),
            "engine_coolant_temp": DecodedTelemetrySignal(
                signal_name="engine_coolant_temp",
                value=None,
                unit="°C",
                is_valid=False,
                source_can_id=0,
                timestamp_us=0
            )
        }

    def update_config(self, new_config: CANControllerConfig):
        self.config = new_config
        logger.info(f"Updated CAN Controller Config: {new_config.transceiver_profile} @ {new_config.bitrate} bps, TX={new_config.tx_gpio}, RX={new_config.rx_gpio}")

    def ingest_raw_frame(self, frame: RawCANFrameSchema):
        """Mode A: Ingest raw CAN frame without requiring DBC."""
        self.raw_frames_buffer.append(frame)
        self.stats["total_frames_received"] += 1
        if frame.is_extended:
            self.stats["extended_frames_count"] += 1
        else:
            self.stats["standard_frames_count"] += 1
        self.stats["last_frame_timestamp_us"] = frame.timestamp_us
        self.stats["last_received_utc"] = datetime.now(timezone.utc)

        # Mode B: Attempt signal decoding if frame matches known protocol definitions
        self._decode_signals(frame)

    def _decode_signals(self, frame: RawCANFrameSchema):
        """Decode signals according to configured protocol (Standard OBD-II 0x7E8 and Simulated 0x100-0x103)."""
        payload_bytes = bytes.fromhex(frame.payload_bytes)

        # Standard OBD-II response ID 0x7E8 (Engine ECU)
        if frame.can_id == 0x7E8 and len(payload_bytes) >= 3:
            # Service 0x01 / 0x41 response
            service = payload_bytes[1]
            if service == 0x41:
                pid = payload_bytes[2]
                if pid == 0x0D and len(payload_bytes) >= 4:  # Speed in km/h: A
                    speed = float(payload_bytes[3])
                    self.latest_signals["vehicle_speed"] = DecodedTelemetrySignal(
                        signal_name="vehicle_speed",
                        value=speed,
                        unit="km/h",
                        is_valid=True,
                        source_can_id=frame.can_id,
                        timestamp_us=frame.timestamp_us
                    )
                elif pid == 0x0C and len(payload_bytes) >= 5:  # Engine RPM: (256*A + B)/4
                    rpm = float(((payload_bytes[3] * 256) + payload_bytes[4]) / 4.0)
                    self.latest_signals["engine_rpm"] = DecodedTelemetrySignal(
                        signal_name="engine_rpm",
                        value=rpm,
                        unit="RPM",
                        is_valid=True,
                        source_can_id=frame.can_id,
                        timestamp_us=frame.timestamp_us
                    )
                elif pid == 0x11 and len(payload_bytes) >= 4:  # Throttle %: A * 100 / 255
                    throttle = round((float(payload_bytes[3]) * 100.0) / 255.0, 1)
                    self.latest_signals["throttle_position"] = DecodedTelemetrySignal(
                        signal_name="throttle_position",
                        value=throttle,
                        unit="%",
                        is_valid=True,
                        source_can_id=frame.can_id,
                        timestamp_us=frame.timestamp_us
                    )
                elif pid == 0x05 and len(payload_bytes) >= 4:  # Coolant temp: A - 40
                    temp = float(payload_bytes[3] - 40)
                    self.latest_signals["engine_coolant_temp"] = DecodedTelemetrySignal(
                        signal_name="engine_coolant_temp",
                        value=temp,
                        unit="°C",
                        is_valid=True,
                        source_can_id=frame.can_id,
                        timestamp_us=frame.timestamp_us
                    )

        # Simulated CAN ID 0x100: Speed and Engine RPM
        elif frame.can_id == 0x100 and len(payload_bytes) >= 4:
            speed = float(payload_bytes[0])
            rpm = float((payload_bytes[2] << 8) | payload_bytes[3])
            self.latest_signals["vehicle_speed"] = DecodedTelemetrySignal(
                signal_name="vehicle_speed",
                value=speed,
                unit="km/h",
                is_valid=True,
                source_can_id=frame.can_id,
                timestamp_us=frame.timestamp_us
            )
            self.latest_signals["engine_rpm"] = DecodedTelemetrySignal(
                signal_name="engine_rpm",
                value=rpm,
                unit="RPM",
                is_valid=True,
                source_can_id=frame.can_id,
                timestamp_us=frame.timestamp_us
            )

        # Simulated CAN ID 0x101: Throttle and Coolant Temperature
        elif frame.can_id == 0x101 and len(payload_bytes) >= 2:
            throttle = float(payload_bytes[0])
            coolant = float(payload_bytes[1])
            self.latest_signals["throttle_position"] = DecodedTelemetrySignal(
                signal_name="throttle_position",
                value=throttle,
                unit="%",
                is_valid=True,
                source_can_id=frame.can_id,
                timestamp_us=frame.timestamp_us
            )
            self.latest_signals["engine_coolant_temp"] = DecodedTelemetrySignal(
                signal_name="engine_coolant_temp",
                value=coolant,
                unit="°C",
                is_valid=True,
                source_can_id=frame.can_id,
                timestamp_us=frame.timestamp_us
            )

    def get_raw_frames(self, limit: int = 100, filter_can_id: Optional[int] = None) -> List[RawCANFrameSchema]:
        """Returns frames as received (Mode A)."""
        frames = list(self.raw_frames_buffer)
        if filter_can_id is not None:
            frames = [f for f in frames if f.can_id == filter_can_id]
        return frames[-limit:]

    def update_signal(self, name: str, value: Optional[float], unit: str, source_can_id: int):
        """Allows direct signal updates from verified serial telemetry."""
        now_us = int(datetime.now(timezone.utc).timestamp() * 1000000)
        self.latest_signals[name] = DecodedTelemetrySignal(
            signal_name=name,
            value=value,
            unit=unit,
            is_valid=value is not None,
            source_can_id=source_can_id,
            timestamp_us=now_us
        )
        self.stats["last_received_utc"] = datetime.now(timezone.utc)

    def get_decoded_signals(self) -> Dict[str, DecodedTelemetrySignal]:
        """Returns current signal states (Mode B)."""
        return self.latest_signals

    def get_stats(self) -> Dict[str, Any]:
        return {
            **self.stats,
            "buffer_depth": len(self.raw_frames_buffer),
            "transceiver_profile": self.config.transceiver_profile,
            "bitrate": self.config.bitrate,
            "mode": self.config.mode,
            "tx_gpio": self.config.tx_gpio,
            "rx_gpio": self.config.rx_gpio,
            "enabled": self.config.enabled
        }

can_decoder_service = CANDecoderService()
