import struct
import asyncio
import logging
from typing import Optional, Tuple, List, Dict, Any
from datetime import datetime, timezone

from app.schemas.schemas import RawCANFrameSchema, TelemetryPayload, TelemetryData
from app.services.can_decoder import can_decoder_service
from app.services.ingestion import ingestion_service

logger = logging.getLogger(__name__)

# Protocol constants
APEX_PROTO_SYNC_0 = 0xAA
APEX_PROTO_SYNC_1 = 0x55
APEX_PROTO_VERSION = 0x01

# Packet Types
PKT_HEARTBEAT         = 0x01
PKT_RAW_CAN_BATCH     = 0x02
PKT_DECODED_TELEMETRY = 0x03
PKT_CAN_STATUS        = 0x04
PKT_BUFFER_STATUS     = 0x05
PKT_RETRIEVE_REQUEST  = 0x10
PKT_RETRIEVE_CHUNK    = 0x11
PKT_RETRIEVE_COMPLETE = 0x12
PKT_ERROR_REPORT      = 0xFF

HEADER_STRUCT = struct.Struct("<2sBBBBIQH") # sync(2), ver(1), type(1), role(1), rsv(1), seq(4), ts(8), len(2) -> 20 bytes
HEADER_SIZE = 20

def compute_crc16(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc

class GatewayProtocolParser:
    """
    Stream parser for APEX binary framed packets over UART/USB-Serial.
    Handles byte-by-byte streaming, resynchronization, and CRC verification.
    """
    def __init__(self):
        self.rx_buffer = bytearray()
        self.stats = {
            "packets_decoded": 0,
            "crc_errors": 0,
            "desync_bytes_dropped": 0
        }

    def feed(self, chunk: bytes) -> List[Dict[str, Any]]:
        self.rx_buffer.extend(chunk)
        packets: List[Dict[str, Any]] = []

        while len(self.rx_buffer) >= HEADER_SIZE + 2:
            # 1. Search for sync word
            sync_idx = -1
            for i in range(len(self.rx_buffer) - 1):
                if self.rx_buffer[i] == APEX_PROTO_SYNC_0 and self.rx_buffer[i+1] == APEX_PROTO_SYNC_1:
                    sync_idx = i
                    break

            if sync_idx == -1:
                # No sync word found in buffer; drop up to last byte
                self.stats["desync_bytes_dropped"] += max(0, len(self.rx_buffer) - 1)
                self.rx_buffer = self.rx_buffer[-1:]
                break

            if sync_idx > 0:
                # Discard leading junk bytes
                self.stats["desync_bytes_dropped"] += sync_idx
                self.rx_buffer = self.rx_buffer[sync_idx:]

            if len(self.rx_buffer) < HEADER_SIZE + 2:
                break

            # 2. Parse Header
            try:
                sync, ver, p_type, role, rsv, seq, ts_ms, p_len = HEADER_STRUCT.unpack(self.rx_buffer[:HEADER_SIZE])
            except Exception as e:
                self.rx_buffer = self.rx_buffer[2:]
                continue

            if ver != APEX_PROTO_VERSION:
                # Version mismatch; advance 2 bytes
                self.rx_buffer = self.rx_buffer[2:]
                self.stats["desync_bytes_dropped"] += 2
                continue

            total_pkt_len = HEADER_SIZE + p_len + 2
            if len(self.rx_buffer) < total_pkt_len:
                # Wait for more data
                break

            # 3. Extract payload and CRC
            payload = bytes(self.rx_buffer[HEADER_SIZE:HEADER_SIZE + p_len])
            received_crc = struct.unpack("<H", self.rx_buffer[HEADER_SIZE + p_len:total_pkt_len])[0]

            # 4. Verify CRC16 over Header + Payload
            calculated_crc = compute_crc16(self.rx_buffer[:HEADER_SIZE + p_len])
            if calculated_crc != received_crc:
                logger.warning(f"CRC mismatch: expected 0x{calculated_crc:04X}, got 0x{received_crc:04X}")
                self.stats["crc_errors"] += 1
                # Skip sync word and try to resynchronize
                self.rx_buffer = self.rx_buffer[2:]
                continue

            # Valid packet!
            packet_data = {
                "packet_type": p_type,
                "source_role": role,
                "sequence_number": seq,
                "timestamp_ms": ts_ms,
                "payload": payload,
                "payload_len": p_len
            }
            packets.append(packet_data)
            self.stats["packets_decoded"] += 1

            # Advance buffer past this packet
            self.rx_buffer = self.rx_buffer[total_pkt_len:]

        return packets

    @staticmethod
    def parse_raw_can_frame(payload_chunk: bytes) -> Optional[RawCANFrameSchema]:
        """
        Parses a 24-byte apex_can_frame_t struct:
        uint64 timestamp_us (8)
        uint32 sequence_number (4)
        uint32 can_id (4)
        uint8  is_extended (1)
        uint8  is_remote (1)
        uint8  dlc (1)
        uint8  channel_id (1)
        uint8  data[8] (8)
        Total: 28 bytes
        """
        if len(payload_chunk) < 28:
            return None
        ts_us, seq, can_id, is_ext, is_rtr, dlc, chan = struct.unpack("<QIIBBBB", payload_chunk[:20])
        data_bytes = payload_chunk[20:20 + min(dlc, 8)]
        hex_data = data_bytes.hex().upper()

        return RawCANFrameSchema(
            timestamp_us=ts_us,
            sequence_number=seq,
            can_id=can_id,
            is_extended=bool(is_ext),
            is_remote=bool(is_rtr),
            dlc=min(dlc, 8),
            payload_bytes=hex_data,
            channel_id=chan
        )
