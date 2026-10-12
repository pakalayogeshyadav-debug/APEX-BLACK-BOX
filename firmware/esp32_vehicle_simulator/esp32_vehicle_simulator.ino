/*
 * APEX BLACKBOX - ESP32 #2: Vehicle Simulator
 * Hardware: Classic ESP32 Dev Module + SN65HVD230 3.3V CAN Transceiver
 * CAN Pins: TX=GPIO5 (CTX), RX=GPIO4 (CRX)
 * Serial: 115200 Baud (USB)
 *
 * Generates realistic CAN bus vehicle telemetry (RPM, Speed, Temperature, Battery)
 * Emits APEX structured JSON identity messages and heartbeats over USB Serial.
 */

#include "driver/twai.h"

#define DEVICE_ID "apex-vehicle-simulator-01"
#define FIRMWARE_VER "1.0.0"
#define PROTOCOL_VER 1
#define CAN_TX_PIN GPIO_NUM_5
#define CAN_RX_PIN GPIO_NUM_4

static uint32_t total_frames_sent = 0;
static unsigned long last_heartbeat = 0;
static unsigned long last_can_tx = 0;
static bool twai_installed = false;

// Simulated vehicle telemetry variables
static uint16_t sim_rpm = 850;       // Idle RPM
static uint8_t sim_speed = 0;        // km/h
static int8_t sim_coolant = 88;      // deg C
static bool accelerating = true;

void send_hello() {
  Serial.print("{\"type\":\"device_hello\",\"device_id\":\"");
  Serial.print(DEVICE_ID);
  Serial.print("\",\"role\":\"vehicle_simulator\",\"firmware_version\":\"");
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

  // Initialize ESP32 TWAI (CAN) in Normal transmission mode
  // If transceiver is not connected to a receiving bus, retransmissions may occur
  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT(CAN_TX_PIN, CAN_RX_PIN, TWAI_MODE_NORMAL);
  twai_timing_config_t t_config = TWAI_TIMING_CONFIG_500KBITS();
  twai_filter_config_t f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();

  if (twai_driver_install(&g_config, &t_config, &f_config) == ESP_OK) {
    if (twai_start() == ESP_OK) {
      twai_installed = true;
    }
  }

  // Send initial identity broadcast
  send_hello();
}

void update_simulated_vehicle() {
  // Simulate speed and RPM cycle
  if (accelerating) {
    sim_rpm += 45;
    if (sim_rpm >= 4200) {
      accelerating = false;
    }
  } else {
    sim_rpm -= 35;
    if (sim_rpm <= 950) {
      accelerating = true;
    }
  }
  sim_speed = (uint8_t)(sim_rpm / 45);
}

void transmit_simulated_can_frame() {
  if (!twai_installed) return;

  twai_message_t message;
  message.flags = TWAI_MSG_FLAG_NONE;
  message.identifier = 0x7E8; // Standard OBD-II Diagnostic Response ID
  message.data_length_code = 8;
  
  // Example OBD-II formatted payload:
  // byte 0: DLC (4 bytes payload), byte 1: mode 0x41, byte 2: PID 0x0C (RPM)
  message.data[0] = 0x04;
  message.data[1] = 0x41;
  message.data[2] = 0x0C; // Engine RPM
  message.data[3] = (sim_rpm * 4) >> 8;
  message.data[4] = (sim_rpm * 4) & 0xFF;
  message.data[5] = sim_speed; // Vehicle Speed
  message.data[6] = (uint8_t)(sim_coolant + 40); // Coolant temp offset
  message.data[7] = 0x00;

  esp_err_t res = twai_transmit(&message, pdMS_TO_TICKS(20));
  if (res == ESP_OK) {
    total_frames_sent++;
  }
}

void loop() {
  // Listen for serial commands (e.g. {"cmd":"IDENTIFY"} or DIAG_PING)
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.indexOf("IDENTIFY") >= 0 || cmd.indexOf("DIAG_PING") >= 0) {
      send_hello();
    }
  }

  // Transmit simulated CAN frames at 20Hz (every 50ms)
  unsigned long now = millis();
  if (now - last_can_tx >= 50) {
    last_can_tx = now;
    update_simulated_vehicle();
    transmit_simulated_can_frame();
  }

  // Periodic heartbeat every 2 seconds over USB Serial
  if (now - last_heartbeat >= 2000) {
    last_heartbeat = now;
    Serial.print("{\"type\":\"heartbeat\",\"device_id\":\"");
    Serial.print(DEVICE_ID);
    Serial.print("\",\"role\":\"vehicle_simulator\",\"frames_sent\":");
    Serial.print(total_frames_sent);
    Serial.print(",\"sim_rpm\":");
    Serial.print(sim_rpm);
    Serial.print(",\"sim_speed\":");
    Serial.print(sim_speed);
    Serial.print(",\"uptime_ms\":");
    Serial.print(now);
    Serial.println("}");
  }
}
