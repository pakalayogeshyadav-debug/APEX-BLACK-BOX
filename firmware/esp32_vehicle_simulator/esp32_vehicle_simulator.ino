/*
 * ============================================================================
 * APEX BLACKBOX - ESP32 #1: VEHICLE SIMULATOR (WI-FI & CAN)
 * ============================================================================
 * Hardware Target: ESP32-WROOM-32 Dev Module
 * Transceiver:     SN65HVD230 (3.3V CAN Transceiver)
 * CAN Pins:        TX=GPIO5 (CTX), RX=GPIO4 (CRX)
 * CAN Bitrate:     500 kbps (TWAI_TIMING_CONFIG_500KBITS)
 * Serial Console:  115200 Baud (USB)
 * Communication:   Wi-Fi HTTP REST API (Port 80)
 *
 * Data Flow:
 * Dashboard -> Backend -> Wi-Fi HTTP -> ESP32 #1 -> CAN Bus -> ESP32 #2 (Receiver)
 * ============================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include "driver/twai.h"

// Wi-Fi Configuration
#if __has_include("wifi_config.h")
  #include "wifi_config.h"
#else
  #define WIFI_SSID     "APEX_VEHICLE_LAB"
  #define WIFI_PASSWORD "ApexSecretPass2097"
#endif

#define DEVICE_ID        "apex-vehicle-simulator-01"
#define FIRMWARE_VER     "1.1.0-wifi"
#define PROTOCOL_VER     1
#define CAN_TX_PIN       GPIO_NUM_5
#define CAN_RX_PIN       GPIO_NUM_4
#define HTTP_PORT        80

// Global Web Server
WebServer server(HTTP_PORT);

// Simulation State Variables
static bool sim_running = true;
static bool ignition_on = true;
static char current_gear = 'P'; // P, R, N, D
static float cmd_accelerator = 0.0f; // 0 - 100%
static float cmd_brake = 0.0f;       // 0 - 100%
static float cmd_steering = 0.0f;    // -100 to +100%
static bool parking_brake_on = true;

// Calculated Dynamic Vehicle Telemetry
static float sim_speed_kmh = 0.0f;
static float sim_rpm = 800.0f;
static float sim_throttle = 0.0f;
static float sim_coolant_c = 30.0f;
static float sim_battery_v = 12.6f;
static float sim_heading_deg = 0.0f;

// Operational Counters & Timers
static uint32_t total_frames_sent = 0;
static uint32_t command_counter = 0;
static unsigned long last_command_time = 0;
static unsigned long last_can_tx_time = 0;
static unsigned long last_heartbeat_time = 0;
static bool twai_installed = false;

// Safe CORS Response Helper
void send_cors_header() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void handle_options() {
  send_cors_header();
  server.send(204);
}

// Simple JSON Key Extractors (Self-contained, no external library dependency)
bool get_json_float(const String& body, const String& key, float& out_val) {
  int idx = body.indexOf("\"" + key + "\"");
  if (idx < 0) idx = body.indexOf(key + ":");
  if (idx < 0) return false;
  int colon = body.indexOf(':', idx);
  if (colon < 0) return false;
  int start = colon + 1;
  while (start < body.length() && (body[start] == ' ' || body[start] == '\"')) start++;
  int end = start;
  while (end < body.length() && (isDigit(body[end]) || body[end] == '.' || body[end] == '-')) end++;
  if (end > start) {
    out_val = body.substring(start, end).toFloat();
    return true;
  }
  return false;
}

bool get_json_bool(const String& body, const String& key, bool& out_val) {
  int idx = body.indexOf("\"" + key + "\"");
  if (idx < 0) idx = body.indexOf(key + ":");
  if (idx < 0) return false;
  int colon = body.indexOf(':', idx);
  if (colon < 0) return false;
  String sub = body.substring(colon + 1);
  sub.toLowerCase();
  if (sub.indexOf("true") >= 0 && sub.indexOf("true") < 10) {
    out_val = true;
    return true;
  }
  if (sub.indexOf("false") >= 0 && sub.indexOf("false") < 10) {
    out_val = false;
    return true;
  }
  return false;
}

bool get_json_char(const String& body, const String& key, char& out_val) {
  int idx = body.indexOf("\"" + key + "\"");
  if (idx < 0) return false;
  int colon = body.indexOf(':', idx);
  if (colon < 0) return false;
  int start = colon + 1;
  while (start < body.length() && (body[start] == ' ' || body[start] == '\"')) start++;
  if (start < body.length()) {
    out_val = toupper(body[start]);
    return true;
  }
  return false;
}

// API: GET /api/status
void handle_get_status() {
  send_cors_header();
  String ip_str = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString();

  String json = "{";
  json += "\"status\":\"OK\",";
  json += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  json += "\"firmware\":\"" + String(FIRMWARE_VER) + "\",";
  json += "\"ip\":\"" + ip_str + "\",";
  json += "\"running\":" + String(sim_running ? "true" : "false") + ",";
  json += "\"ignition\":" + String(ignition_on ? "true" : "false") + ",";
  json += "\"gear\":\"" + String(current_gear) + "\",";
  json += "\"parking_brake\":" + String(parking_brake_on ? "true" : "false") + ",";
  json += "\"speed\":" + String(sim_speed_kmh, 1) + ",";
  json += "\"rpm\":" + String((int)sim_rpm) + ",";
  json += "\"throttle\":" + String(sim_throttle, 1) + ",";
  json += "\"brake\":" + String(cmd_brake, 1) + ",";
  json += "\"steering\":" + String(cmd_steering, 1) + ",";
  json += "\"coolant\":" + String(sim_coolant_c, 1) + ",";
  json += "\"battery\":" + String(sim_battery_v, 2) + ",";
  json += "\"frames_sent\":" + String(total_frames_sent) + ",";
  json += "\"uptime_ms\":" + String(millis());
  json += "}";

  server.send(200, "application/json", json);
}

// API: POST /api/controls
void handle_post_controls() {
  send_cors_header();
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"Missing JSON body\"}");
    return;
  }

  String body = server.arg("plain");
  float val_f;
  bool val_b;
  char val_c;

  if (get_json_float(body, "accelerator", val_f)) {
    cmd_accelerator = constrain(val_f, 0.0f, 100.0f);
  }
  if (get_json_float(body, "brake", val_f)) {
    cmd_brake = constrain(val_f, 0.0f, 100.0f);
  }
  if (get_json_float(body, "steering", val_f)) {
    cmd_steering = constrain(val_f, -100.0f, 100.0f);
  }
  if (get_json_bool(body, "ignition", val_b)) {
    ignition_on = val_b;
  }
  if (get_json_bool(body, "parking_brake", val_b)) {
    parking_brake_on = val_b;
  }
  if (get_json_char(body, "gear", val_c)) {
    if (val_c == 'P' || val_c == 'R' || val_c == 'N' || val_c == 'D') {
      current_gear = val_c;
      if (current_gear == 'P') parking_brake_on = true;
    }
  }

  command_counter++;
  last_command_time = millis();

  String res = "{";
  res += "\"status\":\"OK\",";
  res += "\"acknowledged\":true,";
  res += "\"command_seq\":" + String(command_counter) + ",";
  res += "\"speed\":" + String(sim_speed_kmh, 1) + ",";
  res += "\"rpm\":" + String((int)sim_rpm);
  res += "}";

  server.send(200, "application/json", res);
}

// API: POST /api/start
void handle_post_start() {
  send_cors_header();
  sim_running = true;
  last_command_time = millis();
  server.send(200, "application/json", "{\"status\":\"STARTED\",\"running\":true}");
}

// API: POST /api/stop
void handle_post_stop() {
  send_cors_header();
  sim_running = false;
  cmd_accelerator = 0.0f;
  server.send(200, "application/json", "{\"status\":\"STOPPED\",\"running\":false}");
}

// API: GET /api/ping
void handle_get_ping() {
  send_cors_header();
  server.send(200, "application/json", "{\"pong\":true,\"uptime_ms\":" + String(millis()) + "}");
}

// Deterministic Time-Stepped Vehicle Physics Model (20 Hz update)
void update_vehicle_physics(float dt) {
  // 1. Failsafe timeout: ease throttle if no Wi-Fi commands received for 5 seconds
  if (millis() - last_command_time > 5000 && last_command_time > 0) {
    if (cmd_accelerator > 0.0f) {
      cmd_accelerator = max(0.0f, cmd_accelerator - 15.0f * dt);
    }
  }

  // 2. Ignition State
  if (!ignition_on) {
    // Engine off: idle RPM decays to 0, battery rests
    sim_rpm = max(0.0f, sim_rpm - 800.0f * dt);
    sim_throttle = 0.0f;
    sim_battery_v = max(12.2f, sim_battery_v - 0.05f * dt);
    sim_coolant_c = max(25.0f, sim_coolant_c - 0.2f * dt);

    // Vehicle coasting deceleration
    if (sim_speed_kmh > 0.0f) {
      float decel = 3.5f * dt; // coasting drag
      if (cmd_brake > 0.0f || parking_brake_on) decel += (cmd_brake * 0.25f + 15.0f) * dt;
      sim_speed_kmh = max(0.0f, sim_speed_kmh - decel);
    }
    return;
  }

  // Ignition ON
  sim_battery_v = min(14.2f, sim_battery_v + 0.15f * dt); // Alternator charging
  sim_coolant_c = min(92.0f, sim_coolant_c + 0.08f * dt); // Progressive warmup

  // Smooth throttle interpolation toward commanded pedal position
  sim_throttle += (cmd_accelerator - sim_throttle) * min(1.0f, 10.0f * dt);

  // Drivetrain Gear Dynamics
  if (current_gear == 'P' || parking_brake_on) {
    // Parked / Parking Brake Active
    sim_speed_kmh = 0.0f;
    sim_rpm += ((800.0f + sim_throttle * 20.0f) - sim_rpm) * min(1.0f, 5.0f * dt);
  }
  else if (current_gear == 'N') {
    // Neutral: Engine revs with throttle (idle up to 3800 RPM neutral limiter), wheels disconnected
    float target_rpm = 850.0f + (sim_throttle / 100.0f) * 3200.0f;
    sim_rpm += (target_rpm - sim_rpm) * min(1.0f, 8.0f * dt);
    // Coast wheels down
    float coast_decel = (1.5f + (cmd_brake * 0.2f)) * dt;
    sim_speed_kmh = max(0.0f, sim_speed_kmh - coast_decel);
  }
  else if (current_gear == 'D') {
    // Drive: Acceleration proportional to throttle, decelerated by drag & brakes
    float drive_force = (sim_throttle / 100.0f) * 18.0f; // km/h/s potential
    float drag_force = 0.0008f * (sim_speed_kmh * sim_speed_kmh) + 1.2f;
    float brake_force = (cmd_brake / 100.0f) * 32.0f; // strong braking

    float net_accel = drive_force - drag_force - brake_force;
    sim_speed_kmh = constrain(sim_speed_kmh + net_accel * dt, 0.0f, 220.0f);

    // RPM calculated across simulated 6-speed transmission ratios
    float gear_ratio = 3.6f;
    if (sim_speed_kmh > 120.0f) gear_ratio = 0.8f;
    else if (sim_speed_kmh > 85.0f) gear_ratio = 1.1f;
    else if (sim_speed_kmh > 55.0f) gear_ratio = 1.5f;
    else if (sim_speed_kmh > 30.0f) gear_ratio = 2.1f;
    else if (sim_speed_kmh > 15.0f) gear_ratio = 2.8f;

    float wheel_rpm = (sim_speed_kmh / 3.6f) / (0.31f * 2.0f * 3.14159f) * 60.0f;
    float target_rpm = max(800.0f, wheel_rpm * gear_ratio * 3.4f);
    sim_rpm += (target_rpm - sim_rpm) * min(1.0f, 10.0f * dt);
  }
  else if (current_gear == 'R') {
    // Reverse: Limited backward speed
    float drive_force = (sim_throttle / 100.0f) * 8.0f;
    float brake_force = (cmd_brake / 100.0f) * 30.0f;
    float net = drive_force - brake_force - 1.0f;
    sim_speed_kmh = constrain(sim_speed_kmh + net * dt, 0.0f, 35.0f);
    sim_rpm = 850.0f + (sim_speed_kmh / 35.0f) * 2200.0f;
  }

  // Steering & Heading
  if (sim_speed_kmh > 1.0f) {
    float yaw_rate = (cmd_steering / 100.0f) * (sim_speed_kmh / 60.0f) * 25.0f;
    sim_heading_deg = fmod(sim_heading_deg + yaw_rate * dt + 360.0f, 360.0f);
  }
}

// Transmit Physical CAN Frames via TWAI Driver (500 kbps, SN65HVD230)
void transmit_can_frames() {
  if (!twai_installed || !sim_running) return;

  uint8_t spd_u8 = (uint8_t)constrain(sim_speed_kmh, 0.0f, 255.0f);
  uint16_t rpm_u16 = (uint16_t)constrain(sim_rpm, 0.0f, 8500.0f);
  uint8_t thr_u8 = (uint8_t)constrain(sim_throttle, 0.0f, 100.0f);
  int8_t clt_i8 = (int8_t)constrain(sim_coolant_c, -40.0f, 125.0f);

  // 1. Frame 0x100: Speed & Engine RPM
  twai_message_t msg_100;
  msg_100.identifier = 0x100;
  msg_100.flags = TWAI_MSG_FLAG_NONE;
  msg_100.data_length_code = 8;
  msg_100.data[0] = spd_u8;
  msg_100.data[1] = 0x00;
  msg_100.data[2] = (rpm_u16 >> 8) & 0xFF;
  msg_100.data[3] = rpm_u16 & 0xFF;
  msg_100.data[4] = (uint8_t)current_gear;
  msg_100.data[5] = ignition_on ? 0x01 : 0x00;
  msg_100.data[6] = 0x00;
  msg_100.data[7] = 0x00;
  twai_transmit(&msg_100, pdMS_TO_TICKS(10));

  // 2. Frame 0x101: Throttle & Coolant Temperature
  twai_message_t msg_101;
  msg_101.identifier = 0x101;
  msg_101.flags = TWAI_MSG_FLAG_NONE;
  msg_101.data_length_code = 8;
  msg_101.data[0] = thr_u8;
  msg_101.data[1] = (uint8_t)clt_i8;
  msg_101.data[2] = (uint8_t)(sim_battery_v * 10.0f);
  msg_101.data[3] = (uint8_t)cmd_brake;
  msg_101.data[4] = 0x00;
  msg_101.data[5] = 0x00;
  msg_101.data[6] = 0x00;
  msg_101.data[7] = 0x00;
  twai_transmit(&msg_101, pdMS_TO_TICKS(10));

  // 3. Frame 0x7E8: Standard OBD-II Response (RPM PID 0x0C & Speed PID 0x0D)
  twai_message_t msg_obd;
  msg_obd.identifier = 0x7E8;
  msg_obd.flags = TWAI_MSG_FLAG_NONE;
  msg_obd.data_length_code = 8;
  msg_obd.data[0] = 0x04; // DLC
  msg_obd.data[1] = 0x41; // Mode 01 response
  msg_obd.data[2] = 0x0C; // PID 0x0C (Engine RPM)
  uint16_t obd_rpm = (uint16_t)(rpm_u16 * 4);
  msg_obd.data[3] = (obd_rpm >> 8) & 0xFF;
  msg_obd.data[4] = obd_rpm & 0xFF;
  msg_obd.data[5] = spd_u8; // Speed
  msg_obd.data[6] = (uint8_t)(clt_i8 + 40); // Coolant offset formula
  msg_obd.data[7] = 0x00;

  if (twai_transmit(&msg_obd, pdMS_TO_TICKS(10)) == ESP_OK) {
    total_frames_sent += 3;
  }
}

void send_hello() {
  String ip_str = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
  Serial.print("{\"type\":\"device_hello\",\"device_id\":\"");
  Serial.print(DEVICE_ID);
  Serial.print("\",\"role\":\"vehicle_simulator\",\"ip\":\"");
  Serial.print(ip_str);
  Serial.print("\",\"firmware_version\":\"");
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
  Serial.println("\n[APEX SIMULATOR] Booting ESP32 Vehicle Simulator...");

  // 1. Initialize TWAI CAN Driver (Normal Mode, 500 kbps, TX=GPIO5, RX=GPIO4)
  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT(CAN_TX_PIN, CAN_RX_PIN, TWAI_MODE_NORMAL);
  twai_timing_config_t t_config = TWAI_TIMING_CONFIG_500KBITS();
  twai_filter_config_t f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();

  if (twai_driver_install(&g_config, &t_config, &f_config) == ESP_OK) {
    if (twai_start() == ESP_OK) {
      twai_installed = true;
      Serial.println("[APEX SIMULATOR] TWAI CAN driver started at 500 kbps on TX=GPIO5, RX=GPIO4");
    }
  } else {
    Serial.println("[APEX SIMULATOR] WARNING: TWAI CAN install failed. Check pins and transceiver.");
  }

  // 2. Connect to Wi-Fi STA
  Serial.printf("[APEX SIMULATOR] Connecting to Wi-Fi: %s ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long wifi_start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifi_start < 12000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[APEX SIMULATOR] Wi-Fi Connected!");
    Serial.print("[APEX SIMULATOR] Assigned IP: http://");
    Serial.println(WiFi.localIP());
  } else {
    // Fallback to SoftAP so device is always accessible on LAN
    Serial.println("\n[APEX SIMULATOR] Wi-Fi STA failed. Starting fallback SoftAP: APEX-SIMULATOR-WIFI");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("APEX-SIMULATOR-WIFI", "apex123456");
    Serial.print("[APEX SIMULATOR] SoftAP IP: http://");
    Serial.println(WiFi.softAPIP());
  }

  // 3. Configure HTTP REST Endpoints
  server.on("/api/status", HTTP_GET, handle_get_status);
  server.on("/api/controls", HTTP_POST, handle_post_controls);
  server.on("/api/controls", HTTP_OPTIONS, handle_options);
  server.on("/api/start", HTTP_POST, handle_post_start);
  server.on("/api/start", HTTP_OPTIONS, handle_options);
  server.on("/api/stop", HTTP_POST, handle_post_stop);
  server.on("/api/stop", HTTP_OPTIONS, handle_options);
  server.on("/api/ping", HTTP_GET, handle_get_ping);
  server.onNotFound([]() {
    send_cors_header();
    server.send(404, "application/json", "{\"error\":\"Not Found\"}");
  });

  server.begin();
  Serial.println("[APEX SIMULATOR] HTTP REST API listening on Port 80");

  send_hello();
  last_command_time = millis();
}

void loop() {
  server.handleClient();

  // Listen for Serial query commands
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.indexOf("IDENTIFY") >= 0 || cmd.indexOf("DIAG_PING") >= 0) {
      send_hello();
    }
  }

  unsigned long now = millis();

  // Run vehicle dynamics & CAN transmission at 20 Hz (every 50ms)
  if (now - last_can_tx_time >= 50) {
    float dt = (now - last_can_tx_time) / 1000.0f;
    last_can_tx_time = now;

    update_vehicle_physics(dt);
    transmit_can_frames();
  }

  // Periodic heartbeat message every 2 seconds
  if (now - last_heartbeat_time >= 2000) {
    last_heartbeat_time = now;
    String ip_str = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString();

    Serial.print("{\"type\":\"heartbeat\",\"device_id\":\"");
    Serial.print(DEVICE_ID);
    Serial.print("\",\"role\":\"vehicle_simulator\",\"ip\":\"");
    Serial.print(ip_str);
    Serial.print("\",\"frames_sent\":");
    Serial.print(total_frames_sent);
    Serial.print(",\"sim_rpm\":");
    Serial.print((int)sim_rpm);
    Serial.print(",\"sim_speed\":");
    Serial.print(sim_speed_kmh, 1);
    Serial.print(",\"uptime_ms\":");
    Serial.print(now);
    Serial.println("}");
  }
}
