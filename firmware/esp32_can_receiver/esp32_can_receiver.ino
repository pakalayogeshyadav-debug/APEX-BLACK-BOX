/*
 * APEX BLACKBOX - ESP32 #1: CAN Receiver / Logger
 * Hardware: Classic ESP32 Dev Module + SN65HVD230 3.3V CAN Transceiver
 * CAN Pins: TX=GPIO5 (CTX), RX=GPIO4 (CRX)
 * Serial: 115200 Baud (USB)
 */

#include "driver/twai.h"

#define DEVICE_ID "apex-can-receiver-01"
#define FIRMWARE_VER "1.0.0"
#define PROTOCOL_VER 1
#define CAN_TX_PIN GPIO_NUM_5
#define CAN_RX_PIN GPIO_NUM_4

static uint32_t total_frames_received = 0;
static unsigned long last_heartbeat = 0;

void send_hello() {
  Serial.print("{\"type\":\"device_hello\",\"device_id\":\"");
  Serial.print(DEVICE_ID);
  Serial.print("\",\"role\":\"can_receiver\",\"firmware_version\":\"");
  Serial.print(FIRMWARE_VER);
  Serial.print("\",\"protocol_version\":");
  Serial.print(PROTOCOL_VER);
  Serial.print(",\"uptime_ms\":");
  Serial.print(millis());
  Serial.println("}");
}

void setup() {
  Serial.begin(115200);
  delay(500);

  // Initialize ESP32 TWAI (CAN) in Listen-Only Mode (safe for vehicle tapping)
  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT(CAN_TX_PIN, CAN_RX_PIN, TWAI_MODE_LISTEN_ONLY);
  twai_timing_config_t t_config = TWAI_TIMING_CONFIG_500KBITS();
  twai_filter_config_t f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();

  if (twai_driver_install(&g_config, &t_config, &f_config) == ESP_OK) {
    twai_start();
  }

  // Send initial identity broadcast
  send_hello();
}

void loop() {
  // Check for incoming serial commands (e.g. {"cmd":"IDENTIFY"} or DIAG_PING)
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.indexOf("IDENTIFY") >= 0 || cmd.indexOf("DIAG_PING") >= 0) {
      send_hello();
    }
  }

  // Receive CAN frames non-blocking
  twai_message_t message;
  if (twai_receive(&message, pdMS_TO_TICKS(10)) == ESP_OK) {
    total_frames_received++;
    
    // Output formatted CAN frame JSON
    Serial.print("{\"type\":\"can_frame\",\"can_id\":");
    Serial.print(message.identifier);
    Serial.print(",\"dlc\":");
    Serial.print(message.data_length_code);
    Serial.print(",\"data\":\"");
    for (int i = 0; i < message.data_length_code; i++) {
      if (message.data[i] < 0x10) Serial.print("0");
      Serial.print(message.data[i], HEX);
    }
    Serial.print("\",\"timestamp_ms\":");
    Serial.print(millis());
    Serial.println("}");
  }

  // Periodic heartbeat every 2 seconds
  if (millis() - last_heartbeat >= 2000) {
    last_heartbeat = millis();
    Serial.print("{\"type\":\"heartbeat\",\"device_id\":\"");
    Serial.print(DEVICE_ID);
    Serial.print("\",\"can_status\":\"");
    Serial.print(total_frames_received > 0 ? "OK" : "QUIET");
    Serial.print("\",\"frames_received\":");
    Serial.print(total_frames_received);
    Serial.print(",\"uptime_ms\":");
    Serial.print(millis());
    Serial.println("}");
  }
}
