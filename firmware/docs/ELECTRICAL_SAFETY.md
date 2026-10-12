# APEX BLACKBOX — CAN Transceiver Electrical Safety & Wiring Guide

## 1. Overview

APEX BLACKBOX uses an ESP32 microcontroller paired with a physical CAN bus transceiver to interface with vehicle or bench CAN networks.

The built-in ESP32 peripheral is the **TWAI (Two-Wire Automotive Interface)** controller. It handles the CAN 2.0B protocol (framing, arbitration, error checking, and timing). The transceiver (PHY) converts the ESP32's digital 3.3 V logic signals into the differential physical signaling required by ISO 11898-2 ($CAN\_H$ and $CAN\_L$).

---

## 2. Transceiver Comparison Matrix

| Specification | Texas Instruments SN65HVD230 | NXP / Philips TJA1050 |
| :--- | :--- | :--- |
| **Operating Voltage ($V_{CC}$)** | **3.3 V** (3.0 V – 3.6 V) | **5.0 V** (4.75 V – 5.25 V) |
| **Logic Levels (TXD / RXD)** | **3.3 V CMOS / TTL** | **5.0 V CMOS** (RXD output is 5 V!) |
| **ESP32 Compatibility** | **Direct Connection** (Native 3.3 V) | **Requires Level Shifting on RXD!** |
| **Max Bitrate** | 1 Mbps | 1 Mbps |
| **Mode Control Pin** | Pin 8: `Rs` (Slope / Standby) | Pin 8: `S` (Silent / Normal) |
| **Current Consumption (Active)** | ~30 mA | ~50–70 mA |
| **Common Breakout Labels** | 3V3, GND, CTX, CRX, CANH, CANL | VCC, GND, TXD, RXD, CANH, CANL |

---

## 3. SN65HVD230 Electrical Specification & Wiring

### 3.1 Power Supply
- Connect $V_{CC}$ to the **3.3 V rail** of the ESP32 board.
- Connect $GND$ to the ESP32 common ground.
- **WARNING**: Do NOT connect the SN65HVD230 to the 5 V rail. Exceeding 3.6 V will permanently damage the transceiver.

### 3.2 Logic Connections
- `CTX` (Transceiver TXD) $\rightarrow$ ESP32 TWAI TX (e.g., `GPIO 5`).
- `CRX` (Transceiver RXD) $\rightarrow$ ESP32 TWAI RX (e.g., `GPIO 4`).
- `Rs` (Pin 8): Mode control:
  - Tied to $GND$ directly or via resistor ($10\text{ k}\Omega$): High-speed normal mode.
  - Left floating: Standby mode (reception disabled). Most breakout boards have an on-board pulldown to ground.

### 3.3 Pinout Diagram (SN65HVD230)
```
          +-----------------------+
   3.3V --| 1 VCC          8 Rs   |-- Mode control (GND = High-speed)
    GND --| 2 GND          7 CANH |-- CAN High (Differential Bus)
 ESP_TX --| 3 TXD (CTX)    6 CANL |-- CAN Low (Differential Bus)
 ESP_RX --| 4 RXD (CRX)    5 Vref |-- Voltage Reference (NC)
          +-----------------------+
```

---

## 4. TJA1050 Electrical Hazard & Level Shifting

### 4.1 Power Supply
- The TJA1050 requires a strict **5.0 V supply** ($V_{CC} = 4.75\text{V} - 5.25\text{V}$) to properly drive differential CAN bus voltages ($V_{dominant} \ge 1.5\text{V}$).
- Connect $V_{CC}$ to the **5 V (VIN / USB 5V)** rail. Do not power from the ESP32 3.3 V regulator, as the transceiver will fail to generate valid dominant bus levels.

### 4.2 CRITICAL HAZARD: 5 V RXD Logic Level
> [!CAUTION]
> **OVER-VOLTAGE HAZARD ON ESP32 RX PIN**
> When the CAN bus is recessive (idle), the TJA1050 drives its `RXD` pin to $V_{CC}$ (**5.0 V**).
> The ESP32 GPIO input pins are rated for a maximum voltage of **3.6 V**.
> **Connecting TJA1050 RXD directly to an ESP32 GPIO can permanently destroy the GPIO pin or latch up the ESP32.**

### 4.3 Mandatory Level Shifting Solutions for TJA1050
To safely connect the TJA1050 RXD output to the ESP32:

#### Option A: Resistor Voltage Divider (Recommended & Simple)
Connect a 2-resistor voltage divider between TJA1050 `RXD` and ESP32 `RX GPIO`:
```
 TJA1050 RXD (5V) ---[ 1.8 kΩ ]---+---> ESP32 RX (GPIO 4) [~3.25V]
                                  |
                               [ 3.3 kΩ ]
                                  |
                                 GND
```
- Formula: $V_{ESP32} = 5.0\text{V} \times \frac{3300}{1800 + 3300} = 3.235\text{V}$.
- This safely steps down the 5 V high level to ~3.24 V, well within the safe 3.3 V CMOS range.

#### Option B: Active Bi-Directional MOSFET Level Shifter
Use a standard BSS138 or TXB0108 level translator module:
- Low-voltage side ($LV$): 3.3 V, connected to ESP32 RX.
- High-voltage side ($HV$): 5.0 V, connected to TJA1050 RXD.

### 4.4 TXD Pin Compatibility
- The TJA1050 TXD pin has a TTL input threshold ($V_{IH} \ge 2.0\text{V}$).
- The ESP32 3.3 V CMOS output ($V_{OH} \approx 3.3\text{V}$) is fully recognized as high.
- Therefore, ESP32 TX $\rightarrow$ TJA1050 TXD can be connected directly without level shifting.

### 4.5 Mode Pin `S` (Pin 8)
- Pin 8 `S` (Silent mode):
  - Tie to $GND$ for normal operation.
  - Pull HIGH (5 V) to force Silent/Listen-Only mode in hardware.

---

## 5. CAN Bus Termination Rules

### 5.1 ISO 11898-2 Standard Bus Termination
- High-speed CAN requires a nominal characteristic impedance of **$120\,\Omega$**.
- A standard linear bus requires exactly **two** $120\,\Omega$ termination resistors, one at each physical end of the wiring harness, resulting in a parallel resistance of **$60\,\Omega$**:
  $$R_{bus} = \frac{120 \times 120}{120 + 120} = 60\,\Omega$$

### 5.2 AUTOMOTIVE VEHICLE CONNECTION HAZARD
> [!WARNING]
> **DO NOT BLINDLY CONNECT A TERMINATED TRANSCEIVER TO A VEHICLE**
> In any production vehicle, the CAN bus is ALREADY terminated by the factory ECUs (typically inside the Engine Control Module and Body Control Module).
> If you connect an APEX BLACKBOX transceiver module that has an enabled $120\,\Omega$ resistor:
> 1. The total bus resistance drops from $60\,\Omega$ down to $40\,\Omega$:
>    $$R_{total} = \frac{1}{\frac{1}{60} + \frac{1}{120}} = 40\,\Omega$$
> 2. This overloads the vehicle ECUs' transceiver output drivers.
> 3. It causes signal reflections, ringing, frame errors, and may trigger vehicle fault codes (ABS, ESP, or Check Engine lights).

### 5.3 Bench Test vs. Vehicle Tap Rules
- **Bench Test Environment** (Isolated two-device network):
  - Both ends must have $120\,\Omega$ termination.
  - Enable/solder the $120\,\Omega$ jumper on the transceiver breakout.
- **In-Vehicle Diagnostic / OBD-II Connection**:
  - **DISABLE OR DESOLDER** the on-board $120\,\Omega$ SMD resistor (often labeled `R2` or `121` on red SN65HVD230 / blue TJA1050 boards).
  - Test bus resistance with a multimeter between $CAN\_H$ and $CAN\_L$ while the vehicle is powered off:
    - If reading is $\approx 60\,\Omega$, the bus is properly terminated. **Do not add termination.**
    - If reading is $\approx 120\,\Omega$, one termination is missing.
    - If reading is $\approx 40\,\Omega$, a third resistor is connected and must be removed.

---

## 6. Safe Read-Only Diagnostics (Listen-Only Mode)

### 6.1 Why Listen-Only Mode is Mandatory by Default
In standard CAN operation (`TWAI_MODE_NORMAL`):
1. Every CAN node on the bus that successfully receives a frame automatically drives an **ACK bit** (dominant) onto the bus during the ACK slot.
2. If a node detects a CRC or bit error, it transmits an **Error Frame** (6 dominant bits), intentionally destroying the frame for all nodes.

If a diagnostic device has mismatched bit timing or firmware bugs and operates in Normal mode, it will transmit error frames that can disrupt critical vehicle messages (e.g., electronic throttle or steering).

### 6.2 Default Configuration in APEX BLACKBOX
The APEX BLACKBOX firmware initializes the TWAI driver in:
```c
twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT(
    tx_gpio_num,
    rx_gpio_num,
    TWAI_MODE_LISTEN_ONLY
);
```
- In `TWAI_MODE_LISTEN_ONLY`:
  - The controller receives all standard and extended frames.
  - The transmitter is completely disabled in silicon.
  - No ACK bits are sent.
  - No error frames are asserted onto the bus.
  - Zero risk of perturbing active automotive control systems.

---

## 7. ESP32 Pin Selection Rules

### 7.1 Prohibited Pins
- **GPIO 6–11**: Internally connected to the SPI flash memory. Using these causes immediate CPU panics.

### 7.2 Input-Only Pins
- **GPIO 34, 35, 36 (SENSOR_VP), 39 (SENSOR_VN)**:
  - These pins have no internal output drivers.
  - They **CANNOT be used as TWAI TX**.
  - They may be used as TWAI RX, but lack software pull-up resistors.

### 7.3 Strapping Pins (Avoid if possible)
- **GPIO 0, 2, 12, 15**:
  - Sampled by the bootloader at power-on to configure boot voltage and download mode.
  - Connecting transceivers that hold lines high/low during power-up can cause the ESP32 to enter flashing mode or boot-loop.

### 7.4 Recommended Pin Assignments
| Profile | Suggested TWAI TX | Suggested TWAI RX | Mode Pin (Optional) |
| :--- | :---: | :---: | :---: |
| **Default Profile** | **GPIO 5** | **GPIO 4** | GPIO 2 (Rs / S control) |
| **Alternate Profile A** | **GPIO 22** | **GPIO 21** | GPIO 23 |
| **Alternate Profile B** | **GPIO 17** | **GPIO 16** | GPIO 18 |
