#ifndef APEX_CAN_FRAME_H
#define APEX_CAN_FRAME_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CAN_MAX_DLC 8
#define CAN_STD_ID_MAX 0x7FF
#define CAN_EXT_ID_MAX 0x1FFFFFFF

/**
 * @brief Standardized Raw CAN Frame Structure used across APEX BLACKBOX.
 * Byte size is packed and deterministic (24 bytes).
 */
typedef struct __attribute__((packed)) {
    uint64_t timestamp_us;     /**< Microsecond timestamp since boot or synchronized epoch */
    uint32_t sequence_number;  /**< Monotonically increasing frame sequence counter */
    uint32_t can_id;           /**< 11-bit standard or 29-bit extended identifier */
    uint8_t  is_extended;      /**< 1 = Extended (29-bit), 0 = Standard (11-bit) */
    uint8_t  is_remote;        /**< 1 = Remote Transmission Request (RTR), 0 = Data frame */
    uint8_t  dlc;              /**< Data Length Code (0 to 8) */
    uint8_t  channel_id;       /**< Hardware CAN channel ID (0 = primary TWAI) */
    uint8_t  data[CAN_MAX_DLC];/**< Payload bytes (up to 8 bytes for Classical CAN) */
} apex_can_frame_t;

/**
 * @brief Decoded Telemetry Values (Mode B)
 */
typedef struct __attribute__((packed)) {
    uint64_t timestamp_us;
    uint32_t sequence_number;
    float    speed_kmh;
    uint16_t engine_rpm;
    float    throttle_pct;
    float    deceleration_mps2;
    uint8_t  speed_valid;
    uint8_t  rpm_valid;
    uint8_t  throttle_valid;
    uint8_t  decel_valid;
} apex_telemetry_sample_t;

/**
 * @brief Validate standard or extended CAN frame parameters.
 * @return true if ID and DLC are within valid ISO 11898 specifications.
 */
static inline bool apex_can_frame_validate(const apex_can_frame_t *frame) {
    if (!frame) return false;
    if (frame->dlc > CAN_MAX_DLC) return false;
    if (frame->is_extended) {
        if (frame->can_id > CAN_EXT_ID_MAX) return false;
    } else {
        if (frame->can_id > CAN_STD_ID_MAX) return false;
    }
    return true;
}

#ifdef __cplusplus
}
#endif

#endif // APEX_CAN_FRAME_H
