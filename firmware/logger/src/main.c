#include <stdio.h>
#include <string.h>
#include "../include/can_frame.h"
#include "../include/twai_can.h"
#include "../include/rolling_buffer.h"
#include "../include/protocol.h"

#define LOGGER_DEVICE_ID "apex-logger-001"
#define LOGGER_FIRMWARE_VER "v1.2.0"
#define UART_TX_PIN 17
#define UART_RX_PIN 16
#define UART_BAUDRATE 115200

#if defined(ESP_PLATFORM)
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/uart.h"
#include "esp_timer.h"
#include "esp_log.h"

static const char *TAG = "APEX_LOGGER";

// Basic OBD-II signal extractor (Mode B)
static void process_frame_for_telemetry(const apex_can_frame_t *frame, apex_telemetry_sample_t *sample) {
    sample->timestamp_us = frame->timestamp_us;
    sample->sequence_number = frame->sequence_number;

    // Check for standard OBD-II response ID (0x7E8)
    if (frame->can_id == 0x7E8 && frame->dlc >= 3) {
        uint8_t pid = frame->data[2];
        if (pid == 0x0D && frame->dlc >= 4) { // Speed in km/h
            sample->speed_kmh = (float)frame->data[3];
            sample->speed_valid = 1;
        } else if (pid == 0x0C && frame->dlc >= 5) { // Engine RPM
            sample->engine_rpm = ((uint16_t)frame->data[3] * 256 + frame->data[4]) / 4;
            sample->rpm_valid = 1;
        } else if (pid == 0x11 && frame->dlc >= 4) { // Throttle %
            sample->throttle_pct = ((float)frame->data[3] * 100.0f) / 255.0f;
            sample->throttle_valid = 1;
        }
    }
}

static void can_rx_task(void *pvParameters) {
    apex_can_frame_t frame;
    apex_telemetry_sample_t sample;
    memset(&sample, 0, sizeof(sample));

    while (1) {
        if (apex_twai_receive(&frame, 100) == 0) {
            // Process optional vehicle telemetry
            process_frame_for_telemetry(&frame, &sample);

            // Push sample into 5-minute rolling buffer
            apex_rolling_buffer_push(&sample);
        }
        vTaskDelay(pdMS_TO_TICKS(1));
    }
}

static void heartbeat_task(void *pvParameters) {
    uint8_t tx_buf[128];
    uint32_t seq = 0;

    while (1) {
        uint64_t now_ms = (uint64_t)(esp_timer_get_time() / 1000);
        apex_buffer_status_t b_stat;
        apex_rolling_buffer_get_status(&b_stat);

        int len = apex_protocol_encode(
            APEX_PKT_HEARTBEAT,
            APEX_ROLE_LOGGER,
            seq++,
            now_ms,
            (const uint8_t *)&b_stat,
            sizeof(b_stat),
            tx_buf,
            sizeof(tx_buf)
        );

        if (len > 0) {
            uart_write_bytes(UART_NUM_1, (const char *)tx_buf, len);
        }
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void app_main(void) {
    ESP_LOGI(TAG, "Starting APEX BLACKBOX Logger (%s, FW %s)", LOGGER_DEVICE_ID, LOGGER_FIRMWARE_VER);

    // 1. Initialize Rolling Buffer (Target 50 Hz, 300s capacity)
    apex_rolling_buffer_init(50);

    // 2. Configure CAN Controller with safe default profile (SN65HVD230 on GPIO 5/4, Listen-Only)
    apex_can_config_t can_cfg = {
        .transceiver_profile = APEX_TRANSCEIVER_SN65HVD230,
        .bitrate = APEX_CAN_BITRATE_500K,
        .mode = APEX_CAN_MODE_LISTEN_ONLY,
        .tx_gpio = 5,
        .rx_gpio = 4,
        .mode_control_gpio = -1,
        .acceptance_code = 0,
        .acceptance_mask = 0xFFFFFFFF,
        .enabled = true
    };
    apex_twai_init(&can_cfg);
    apex_twai_start();

    // 3. Initialize Inter-ESP32 UART Link (UART1)
    uart_config_t uart_cfg = {
        .baud_rate = UART_BAUDRATE,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE
    };
    uart_param_config(UART_NUM_1, &uart_cfg);
    uart_set_pin(UART_NUM_1, UART_TX_PIN, UART_RX_PIN, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
    uart_driver_install(UART_NUM_1, 1024, 1024, 0, NULL, 0);

    // 4. Start FreeRTOS Tasks
    xTaskCreate(can_rx_task, "can_rx", 4096, NULL, 10, NULL);
    xTaskCreate(heartbeat_task, "heartbeat", 3072, NULL, 5, NULL);
}
#else
int main(void) {
    printf("APEX BLACKBOX Logger Firmware target for ESP-IDF.\n");
    return 0;
}
#endif
