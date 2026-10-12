#ifndef APEX_PROTOCOL_H
#define APEX_PROTOCOL_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define APEX_PROTO_SYNC_0 0xAA
#define APEX_PROTO_SYNC_1 0x55
#define APEX_PROTO_VERSION 0x01
#define APEX_PROTO_MAX_PAYLOAD 1024

typedef enum {
    APEX_PKT_HEARTBEAT          = 0x01,
    APEX_PKT_RAW_CAN_BATCH      = 0x02,
    APEX_PKT_DECODED_TELEMETRY  = 0x03,
    APEX_PKT_CAN_STATUS         = 0x04,
    APEX_PKT_BUFFER_STATUS      = 0x05,
    APEX_PKT_RETRIEVE_REQUEST   = 0x10,
    APEX_PKT_RETRIEVE_CHUNK     = 0x11,
    APEX_PKT_RETRIEVE_COMPLETE  = 0x12,
    APEX_PKT_ERROR_REPORT       = 0xFF
} apex_packet_type_t;

typedef enum {
    APEX_ROLE_LOGGER  = 0x01,
    APEX_ROLE_GATEWAY = 0x02,
    APEX_ROLE_HOST    = 0x03
} apex_device_role_t;

/**
 * @brief Binary Packet Header (18 bytes).
 */
typedef struct __attribute__((packed)) {
    uint8_t  sync[2];          /**< 0xAA, 0x55 */
    uint8_t  version;          /**< 0x01 */
    uint8_t  packet_type;      /**< apex_packet_type_t */
    uint8_t  source_role;      /**< apex_device_role_t */
    uint8_t  reserved;         /**< Alignment padding */
    uint32_t sequence_number;  /**< Monotonic packet sequence counter */
    uint64_t timestamp_ms;     /**< Uptime or epoch timestamp in milliseconds */
    uint16_t payload_len;      /**< Length of payload bytes following header */
} apex_packet_header_t;

/**
 * @brief Standard CRC16-CCITT calculation (Polynomial 0x1021, Init 0xFFFF).
 */
static inline uint16_t apex_crc16(const uint8_t *data, size_t len) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < len; i++) {
        crc ^= (uint16_t)data[i] << 8;
        for (int j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
        }
    }
    return crc;
}

/**
 * @brief Build a framed packet into dest_buffer.
 * Total size = sizeof(apex_packet_header_t) + payload_len + 2 (CRC16).
 * @return Total bytes written, or -1 on error.
 */
int apex_protocol_encode(
    uint8_t packet_type,
    uint8_t source_role,
    uint32_t sequence_number,
    uint64_t timestamp_ms,
    const uint8_t *payload,
    uint16_t payload_len,
    uint8_t *dest_buffer,
    size_t dest_capacity
);

#ifdef __cplusplus
}
#endif

#endif // APEX_PROTOCOL_H
