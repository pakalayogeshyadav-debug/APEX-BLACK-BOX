#include <stdio.h>
#include <string.h>
#include "../../logger/include/protocol.h"

#define GATEWAY_DEVICE_ID "apex-gateway-001"
#define GATEWAY_FIRMWARE_VER "v1.2.0"
#define LOGGER_UART_NUM 1
#define LOGGER_TX_PIN 17
#define LOGGER_RX_PIN 16
#define HOST_UART_NUM 0
#define UART_BAUDRATE 115200

#if defined(ESP_PLATFORM)
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/uart.h"
#include "esp_timer.h"
#include "esp_log.h"

static const char *TAG = "APEX_GATEWAY";

static void forward_logger_to_host_task(void *pvParameters) {
    uint8_t rx_buffer[1024];

    while (1) {
        int rx_len = uart_read_bytes(LOGGER_UART_NUM, rx_buffer, sizeof(rx_buffer), pdMS_TO_TICKS(20));
        if (rx_len > 0) {
            // Forward validated stream to Host USB UART
            uart_write_bytes(HOST_UART_NUM, (const char *)rx_buffer, rx_len);
        }
    }
}

static void host_command_task(void *pvParameters) {
    uint8_t cmd_buffer[256];

    while (1) {
        int rx_len = uart_read_bytes(HOST_UART_NUM, cmd_buffer, sizeof(cmd_buffer) - 1, pdMS_TO_TICKS(50));
        if (rx_len > 0) {
            cmd_buffer[rx_len] = '\0';
            // Check for diagnostic JSON ping
            if (strstr((const char *)cmd_buffer, "DIAG_PING") != NULL) {
                const char *diag_resp = 
                    "{\"status\":\"OK\",\"device_id\":\"" GATEWAY_DEVICE_ID "\","
                    "\"role\":\"GATEWAY\",\"firmware_version\":\"" GATEWAY_FIRMWARE_VER "\","
                    "\"logger_link\":\"ACTIVE\"}\n";
                uart_write_bytes(HOST_UART_NUM, diag_resp, strlen(diag_resp));
            } else {
                // Forward binary command from host to Logger UART
                uart_write_bytes(LOGGER_UART_NUM, (const char *)cmd_buffer, rx_len);
            }
        }
    }
}

void app_main(void) {
    ESP_LOGI(TAG, "Starting APEX BLACKBOX Gateway (%s, FW %s)", GATEWAY_DEVICE_ID, GATEWAY_FIRMWARE_VER);

    // Host USB-UART (UART0)
    uart_config_t host_uart_cfg = {
        .baud_rate = UART_BAUDRATE,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE
    };
    uart_param_config(HOST_UART_NUM, &host_uart_cfg);
    uart_driver_install(HOST_UART_NUM, 2048, 2048, 0, NULL, 0);

    // Inter-ESP32 Logger UART (UART1)
    uart_config_t logger_uart_cfg = {
        .baud_rate = UART_BAUDRATE,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE
    };
    uart_param_config(LOGGER_UART_NUM, &logger_uart_cfg);
    uart_set_pin(LOGGER_UART_NUM, LOGGER_TX_PIN, LOGGER_RX_PIN, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
    uart_driver_install(LOGGER_UART_NUM, 2048, 2048, 0, NULL, 0);

    xTaskCreate(forward_logger_to_host_task, "fwd_to_host", 4096, NULL, 10, NULL);
    xTaskCreate(host_command_task, "host_cmd", 4096, NULL, 8, NULL);
}
#else
int main(void) {
    printf("APEX BLACKBOX Gateway Firmware target for ESP-IDF.\n");
    return 0;
}
#endif
