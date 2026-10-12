#ifndef APEX_TWAI_CAN_H
#define APEX_TWAI_CAN_H

#include <stdint.h>
#include <stdbool.h>
#include "can_frame.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    APEX_TRANSCEIVER_SN65HVD230 = 0, /**< 3.3V native transceiver */
    APEX_TRANSCEIVER_TJA1050    = 1  /**< 5.0V transceiver (Requires RX level shifting!) */
} apex_transceiver_profile_t;

typedef enum {
    APEX_CAN_BITRATE_125K  = 125000,
    APEX_CAN_BITRATE_250K  = 250000,
    APEX_CAN_BITRATE_500K  = 500000, /**< Automotive OBD-II standard */
    APEX_CAN_BITRATE_1000K = 1000000
} apex_can_bitrate_t;

typedef enum {
    APEX_CAN_MODE_LISTEN_ONLY = 0, /**< Silent mode: safe for in-vehicle diagnosis (no ACK/errors) */
    APEX_CAN_MODE_NORMAL      = 1  /**< Active mode: sends ACKs and transmits frames */
} apex_can_mode_t;

typedef enum {
    APEX_CAN_STATE_UNINITIALIZED = 0,
    APEX_CAN_STATE_STOPPED       = 1,
    APEX_CAN_STATE_RUNNING       = 2,
    APEX_CAN_STATE_BUS_OFF       = 3,
    APEX_CAN_STATE_RECOVERING    = 4,
    APEX_CAN_STATE_ERROR_PASSIVE = 5
} apex_can_controller_state_t;

typedef struct {
    apex_transceiver_profile_t transceiver_profile;
    apex_can_bitrate_t         bitrate;
    apex_can_mode_t            mode;
    int                        tx_gpio;
    int                        rx_gpio;
    int                        mode_control_gpio; /**< -1 if unused (Rs or S pin) */
    uint32_t                   acceptance_code;   /**< Dual filter acceptance code */
    uint32_t                   acceptance_mask;   /**< Dual filter acceptance mask (0xFFFFFFFF = accept all) */
    bool                       enabled;
} apex_can_config_t;

typedef struct {
    apex_can_controller_state_t state;
    uint32_t                    rx_frames_total;
    uint32_t                    rx_standard_frames;
    uint32_t                    rx_extended_frames;
    uint32_t                    rx_dropped_frames;
    uint32_t                    tx_error_counter;
    uint32_t                    rx_error_counter;
    uint32_t                    bus_error_counter;
    uint64_t                    last_frame_timestamp_us;
} apex_can_stats_t;

/**
 * @brief Validate whether a GPIO pair is electrically and architecturally safe for ESP32 TWAI.
 * @return 0 if valid; negative error code if invalid.
 */
static inline int apex_twai_validate_gpios(int tx_pin, int rx_pin) {
    // Check pin ranges (ESP32 Classic 0..39)
    if (tx_pin < 0 || tx_pin > 39 || rx_pin < 0 || rx_pin > 39) {
        return -1; // Out of range
    }
    if (tx_pin == rx_pin) {
        return -2; // Cannot share same pin
    }
    // Prohibited flash pins: GPIO 6, 7, 8, 9, 10, 11
    if ((tx_pin >= 6 && tx_pin <= 11) || (rx_pin >= 6 && rx_pin <= 11)) {
        return -3; // Conflict with internal SPI Flash
    }
    // Input-only pins on ESP32: GPIO 34, 35, 36, 39
    if (tx_pin == 34 || tx_pin == 35 || tx_pin == 36 || tx_pin == 39) {
        return -4; // Input-only pin cannot be used as TWAI TX
    }
    return 0; // Valid
}

// Function declarations for TWAI subsystem
int apex_twai_init(const apex_can_config_t *config);
int apex_twai_start(void);
int apex_twai_stop(void);
int apex_twai_receive(apex_can_frame_t *frame, uint32_t timeout_ms);
void apex_twai_get_stats(apex_can_stats_t *stats);

#ifdef __cplusplus
}
#endif

#endif // APEX_TWAI_CAN_H
