#include "../include/protocol.h"
#include <string.h>

int apex_protocol_encode(
    uint8_t packet_type,
    uint8_t source_role,
    uint32_t sequence_number,
    uint64_t timestamp_ms,
    const uint8_t *payload,
    uint16_t payload_len,
    uint8_t *dest_buffer,
    size_t dest_capacity
) {
    if (!dest_buffer) return -1;
    if (payload_len > APEX_PROTO_MAX_PAYLOAD) return -2;

    size_t total_size = sizeof(apex_packet_header_t) + payload_len + 2;
    if (total_size > dest_capacity) return -3;

    apex_packet_header_t header;
    header.sync[0] = APEX_PROTO_SYNC_0;
    header.sync[1] = APEX_PROTO_SYNC_1;
    header.version = APEX_PROTO_VERSION;
    header.packet_type = packet_type;
    header.source_role = source_role;
    header.reserved = 0;
    header.sequence_number = sequence_number;
    header.timestamp_ms = timestamp_ms;
    header.payload_len = payload_len;

    // Copy header
    memcpy(dest_buffer, &header, sizeof(header));

    // Copy payload if present
    if (payload && payload_len > 0) {
        memcpy(dest_buffer + sizeof(header), payload, payload_len);
    }

    // Calculate CRC16 over Header + Payload
    uint16_t crc = apex_crc16(dest_buffer, sizeof(header) + payload_len);
    dest_buffer[sizeof(header) + payload_len] = (uint8_t)(crc & 0xFF);
    dest_buffer[sizeof(header) + payload_len + 1] = (uint8_t)((crc >> 8) & 0xFF);

    return (int)total_size;
}
