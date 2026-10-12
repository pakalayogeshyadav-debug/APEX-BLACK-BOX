#include "../include/twai_can.h"
#include <string.h>

#if defined(ESP_PLATFORM)
#include "driver/twai.h"
#include "driver/gpio.h"
#include "esp_timer.h"
#endif

static apex_can_config_t s_config = {0};
static apex_can_stats_t  s_stats  = {0};
static bool              s_initialized = false;

int apex_twai_init(const apex_can_config_t *config) {
    if (!config) return -1;
    if (apex_twai_validate_gpios(config->tx_gpio, config->rx_gpio) != 0) {
        return -2;
    }

    s_config = *config;
    memset(&s_stats, 0, sizeof(s_stats));
    s_stats.state = APEX_CAN_STATE_STOPPED;

#if defined(ESP_PLATFORM)
    // Optional hardware transceiver mode control pin (Rs / S)
    if (config->mode_control_gpio >= 0) {
        gpio_config_t io_conf = {
            .pin_bit_mask = (1ULL << config->mode_control_gpio),
            .mode = GPIO_MODE_OUTPUT,
            .pull_up_en = GPIO_PULLUP_DISABLE,
            .pull_down_en = GPIO_PULLDOWN_ENABLE,
            .intr_type = GPIO_INTR_DISABLE
        };
        gpio_config(&io_conf);
        // Pull LOW for normal/high-speed operation on both SN65HVD230 (Rs=0) and TJA1050 (S=0)
        gpio_set_level((gpio_num_t)config->mode_control_gpio, 0);
    }

    twai_mode_t twai_mode = (config->mode == APEX_CAN_MODE_NORMAL) ? 
                            TWAI_MODE_NORMAL : TWAI_MODE_LISTEN_ONLY;

    twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT(
        (gpio_num_t)config->tx_gpio,
        (gpio_num_t)config->rx_gpio,
        twai_mode
    );
    g_config.rx_queue_len = 64;
    g_config.tx_queue_len = (twai_mode == TWAI_MODE_NORMAL) ? 16 : 0;

    twai_timing_config_t t_config;
    switch (config->bitrate) {
        case APEX_CAN_BITRATE_125K:
            t_config = (twai_timing_config_t)TWAI_TIMING_CONFIG_125KBITS();
            break;
        case APEX_CAN_BITRATE_250K:
            t_config = (twai_timing_config_t)TWAI_TIMING_CONFIG_250KBITS();
            break;
        case APEX_CAN_BITRATE_1000K:
            t_config = (twai_timing_config_t)TWAI_TIMING_CONFIG_1MBITS();
            break;
        case APEX_CAN_BITRATE_500K:
        default:
            t_config = (twai_timing_config_t)TWAI_TIMING_CONFIG_500KBITS();
            break;
    }

    twai_filter_config_t f_config = {
        .acceptance_code = config->acceptance_code,
        .acceptance_mask = config->acceptance_mask,
        .single_filter = false
    };

    esp_err_t err = twai_driver_install(&g_config, &t_config, &f_config);
    if (err != ESP_OK) return -3;

#endif

    s_initialized = true;
    return 0;
}

int apex_twai_start(void) {
    if (!s_initialized) return -1;
#if defined(ESP_PLATFORM)
    esp_err_t err = twai_start();
    if (err != ESP_OK) return -2;
#endif
    s_stats.state = APEX_CAN_STATE_RUNNING;
    return 0;
}

int apex_twai_stop(void) {
    if (!s_initialized) return -1;
#if defined(ESP_PLATFORM)
    twai_stop();
    twai_driver_uninstall();
#endif
    s_stats.state = APEX_CAN_STATE_STOPPED;
    s_initialized = false;
    return 0;
}

int apex_twai_receive(apex_can_frame_t *frame, uint32_t timeout_ms) {
    if (!s_initialized || !frame) return -1;

#if defined(ESP_PLATFORM)
    twai_message_t rx_msg;
    TickType_t ticks = (timeout_ms == 0) ? 0 : pdMS_TO_TICKS(timeout_ms);
    esp_err_t err = twai_receive(&rx_msg, ticks);
    if (err != ESP_OK) return -2;

    frame->timestamp_us = (uint64_t)esp_timer_get_time();
    frame->sequence_number = s_stats.rx_frames_total + 1;
    frame->can_id = rx_msg.identifier;
    frame->is_extended = rx_msg.extd ? 1 : 0;
    frame->is_remote = rx_msg.rtr ? 1 : 0;
    frame->dlc = rx_msg.data_length_code;
    frame->channel_id = 0;
    memcpy(frame->data, rx_msg.data, rx_msg.data_length_code);

    s_stats.rx_frames_total++;
    if (frame->is_extended) s_stats.rx_extended_frames++;
    else s_stats.rx_standard_frames++;
    s_stats.last_frame_timestamp_us = frame->timestamp_us;

    return 0;
#else
    // Desktop simulation stub
    return -2; // No physical hardware
#endif
}

void apex_twai_get_stats(apex_can_stats_t *stats) {
    if (stats) {
#if defined(ESP_PLATFORM)
        twai_status_info_t info;
        if (twai_get_status_info(&info) == ESP_OK) {
            s_stats.tx_error_counter = info.tx_error_counter;
            s_stats.rx_error_counter = info.rx_error_counter;
            s_stats.bus_error_counter = info.bus_error_count;
            if (info.state == TWAI_STATE_BUS_OFF) s_stats.state = APEX_CAN_STATE_BUS_OFF;
            else if (info.state == TWAI_STATE_RECOVERING) s_stats.state = APEX_CAN_STATE_RECOVERING;
            else if (info.state == TWAI_STATE_RUNNING) s_stats.state = APEX_CAN_STATE_RUNNING;
            else s_stats.state = APEX_CAN_STATE_STOPPED;
        }
#endif
        *stats = s_stats;
    }
}
