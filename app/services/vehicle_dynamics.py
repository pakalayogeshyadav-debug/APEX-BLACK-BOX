import math
import time
from typing import Dict, Any, Optional

class VehicleDynamicsModel:
    """
    Deterministic, time-stepped vehicle dynamics simulation model for APEX BLACKBOX.
    
    Physics and Engineering Assumptions:
    - Vehicle Mass: 1450 kg (generic modern C-segment passenger sedan)
    - Air density (rho): 1.225 kg/m^3 (sea level, 15°C)
    - Aerodynamic drag coefficient (Cd): 0.30
    - Frontal area (A): 2.2 m^2
    - Rolling resistance coefficient (Crr): 0.015
    - Gravity (g): 9.81 m/s^2
    - Wheelbase (L): 2.7 m
    - Max steering angle: 35 degrees (0.61 rad)
    - Engine: 2.0L 4-cylinder simulated torque curve peaking at 250 Nm @ 3500 RPM
    - Idle RPM: 800, Redline: 6000 RPM, Max RPM limit: 6500 RPM
    - Automatic transmission gear ratios:
        P: Park (drivetrain mechanically locked)
        R: Reverse (-3.40 ratio, max speed ~35 km/h)
        N: Neutral (drivetrain disconnected, engine revs freely)
        D: Drive (1st: 3.60, 2nd: 2.10, 3rd: 1.40, 4th: 1.00, 5th: 0.80; Final Drive: 3.90)
    - Effective wheel radius (r_wheel): 0.315 m (e.g. 205/55R16)
    - Hydraulic service brakes: up to ~1.0g (9.81 m/s^2) max deceleration at 100% brake pedal
    - Parking brake: locks rear wheels, prevents vehicle motion, holds standstill
    """

    def __init__(self, mass_kg: float = 1450.0):
        self.mass_kg = max(500.0, float(mass_kg))
        self.g = 9.81
        self.rho_air = 1.225
        self.cd = 0.30
        self.frontal_area = 2.2
        self.crr = 0.015
        self.wheel_radius = 0.315
        self.wheelbase = 2.7
        self.max_steering_deg = 35.0

        # Gear ratios for forward gears
        self.forward_gear_ratios = [3.60, 2.10, 1.40, 1.00, 0.80]
        self.final_drive_ratio = 3.90
        self.reverse_gear_ratio = -3.40

        # State variables
        self.speed_mps: float = 0.0          # Speed in m/s (positive = forward, negative = reverse)
        self.engine_rpm: float = 0.0         # Engine RPM (0 when off, 800-6500 when running)
        self.current_gear: str = "P"         # "P", "R", "N", "D"
        self.active_drive_gear: int = 1      # 1 to 5 (when in D)
        self.ignition: bool = False          # False = OFF, True = ON
        self.parking_brake: bool = True      # True = engaged
        self.heading_deg: float = 0.0        # 0 to 360 degrees
        self.coolant_temp_c: float = 28.0    # Ambient ~28°C, normal ~90°C
        self.battery_voltage_v: float = 12.5 # Resting ~12.5V, Running ~14.1V
        self.engine_load_percent: float = 0.0
        self.longitudinal_accel_mps2: float = 0.0

        # Driver control inputs (clamped)
        self.accelerator_pos: float = 0.0    # 0.0 to 1.0 (0% to 100%)
        self.brake_pos: float = 0.0          # 0.0 to 1.0 (0% to 100%)
        self.steering_angle_norm: float = 0.0 # -1.0 (full left) to +1.0 (full right)
        
        # Lights & indicators
        self.headlights: bool = False
        self.turn_indicators: str = "OFF"     # "LEFT", "RIGHT", "OFF"
        self.hazard_lights: bool = False

        # Internal tracking
        self.last_update_time: Optional[float] = None
        self.overheating_failure: bool = False
        self.low_battery_failure: bool = False

    def reset(self):
        """Reset state to baseline initial conditions (Engine off in Park)."""
        self.speed_mps = 0.0
        self.engine_rpm = 0.0
        self.current_gear = "P"
        self.active_drive_gear = 1
        self.ignition = False
        self.parking_brake = True
        self.heading_deg = 0.0
        self.coolant_temp_c = 28.0
        self.battery_voltage_v = 12.5
        self.engine_load_percent = 0.0
        self.longitudinal_accel_mps2 = 0.0
        self.accelerator_pos = 0.0
        self.brake_pos = 0.0
        self.steering_angle_norm = 0.0
        self.headlights = False
        self.turn_indicators = "OFF"
        self.hazard_lights = False
        self.last_update_time = None
        self.overheating_failure = False
        self.low_battery_failure = False

    def set_controls(
        self,
        accelerator: Optional[float] = None,
        brake: Optional[float] = None,
        steering: Optional[float] = None,
        gear: Optional[str] = None,
        ignition: Optional[bool] = None,
        parking_brake: Optional[bool] = None,
        headlights: Optional[bool] = None,
        turn_indicators: Optional[str] = None,
        hazard_lights: Optional[bool] = None
    ):
        """Safely update driver control inputs with clamping."""
        if accelerator is not None:
            # accept either 0-1 or 0-100%
            val = float(accelerator)
            if val > 1.0 and val <= 100.0:
                val /= 100.0
            self.accelerator_pos = max(0.0, min(1.0, val))

        if brake is not None:
            val = float(brake)
            if val > 1.0 and val <= 100.0:
                val /= 100.0
            self.brake_pos = max(0.0, min(1.0, val))

        if steering is not None:
            # accept -100 to +100 or -1.0 to +1.0
            val = float(steering)
            if abs(val) > 1.0 and abs(val) <= 100.0:
                val /= 100.0
            self.steering_angle_norm = max(-1.0, min(1.0, val))

        if gear is not None:
            g = str(gear).upper().strip()
            if g in ["P", "R", "N", "D"]:
                # Realistic interlock: shifting into P or R usually requires low speed or brake
                if g == "P" and abs(self.speed_mps) > 1.0:
                    pass # lock out shifting to P while moving fast
                else:
                    self.current_gear = g
                    if g == "P":
                        self.speed_mps = 0.0
                        self.parking_brake = True

        if ignition is not None:
            self.ignition = bool(ignition)
            if not self.ignition:
                # Turning ignition off kills engine
                self.engine_rpm = 0.0

        if parking_brake is not None:
            self.parking_brake = bool(parking_brake)

        if headlights is not None:
            self.headlights = bool(headlights)

        if turn_indicators is not None:
            ti = str(turn_indicators).upper().strip()
            if ti in ["LEFT", "RIGHT", "OFF"]:
                self.turn_indicators = ti

        if hazard_lights is not None:
            self.hazard_lights = bool(hazard_lights)

    def _get_engine_max_torque(self, rpm: float) -> float:
        """Simplified parabolic torque curve for a 2.0L engine."""
        if rpm < 600 or rpm > 6500:
            return 0.0
        # Peak torque 250 Nm at 3500 RPM, ~180 Nm at 1000 RPM, ~200 Nm at 6000 RPM
        diff = (rpm - 3500.0) / 2500.0
        torque = 250.0 - 70.0 * (diff ** 2)
        return max(50.0, torque)

    def step(self, dt: float):
        """
        Deterministic, time-stepped physics integration.
        Uses actual elapsed dt in seconds (clamped to sensible 0.001 - 0.5s).
        """
        dt = max(0.001, min(0.5, float(dt)))

        # 1. Ignition & Engine State
        if not self.ignition:
            # Engine is OFF
            self.engine_rpm = max(0.0, self.engine_rpm - 3000.0 * dt)
            self.engine_load_percent = 0.0
            # Target resting battery voltage ~12.4V
            target_voltage = 12.4
            self.battery_voltage_v += (target_voltage - self.battery_voltage_v) * min(1.0, 1.5 * dt)
            # Coolant slowly cools toward ambient (28°C)
            self.coolant_temp_c += (28.0 - self.coolant_temp_c) * min(1.0, 0.008 * dt)
        else:
            # Engine is ON
            if self.engine_rpm < 700:
                self.engine_rpm = 800.0 # Idle RPM start

            # Target alternator voltage ~14.2V (or drop if low battery failure)
            if self.low_battery_failure:
                target_voltage = 11.2
            else:
                target_voltage = 14.2 - (0.3 if self.headlights else 0.0)
            self.battery_voltage_v += (target_voltage - self.battery_voltage_v) * min(1.0, 1.2 * dt)

            # Coolant warms to operating temp (~90°C) or overheats if scenario
            target_coolant = 122.0 if self.overheating_failure else 90.0
            # Heating rate proportional to engine load and RPM
            heat_factor = 0.02 + 0.06 * (self.engine_load_percent / 100.0) + 0.04 * (self.engine_rpm / 6500.0)
            if self.coolant_temp_c < target_coolant:
                self.coolant_temp_c += (target_coolant - self.coolant_temp_c) * min(1.0, heat_factor * dt)
            else:
                self.coolant_temp_c -= (self.coolant_temp_c - target_coolant) * min(1.0, 0.03 * dt)

        # 2. Transmission & Drivetrain Response
        driving_force = 0.0
        is_reverse = (self.current_gear == "R")
        is_drive = (self.current_gear == "D")
        is_neutral = (self.current_gear == "N")
        is_park = (self.current_gear == "P")

        # Automatic shift logic in Drive
        speed_kmh = abs(self.speed_mps) * 3.6
        if is_drive:
            if speed_kmh < 22.0:
                self.active_drive_gear = 1
            elif speed_kmh < 42.0:
                self.active_drive_gear = 2
            elif speed_kmh < 68.0:
                self.active_drive_gear = 3
            elif speed_kmh < 95.0:
                self.active_drive_gear = 4
            else:
                self.active_drive_gear = 5

        # Calculate wheel torque and driving force
        if self.ignition and not self.parking_brake and not is_park:
            if is_drive or is_reverse:
                ratio = self.reverse_gear_ratio if is_reverse else self.forward_gear_ratios[self.active_drive_gear - 1]
                overall_ratio = abs(ratio * self.final_drive_ratio)

                # Wheel rotational speed to engine RPM
                wheel_angular_vel = abs(self.speed_mps) / self.wheel_radius
                calc_rpm = (wheel_angular_vel * overall_ratio * 60.0) / (2.0 * math.pi)
                
                # Minimum idle RPM
                base_rpm = max(800.0, calc_rpm)
                # Accelerator adds revs (slip/converter)
                target_rpm = min(6500.0, base_rpm + self.accelerator_pos * 1800.0)
                self.engine_rpm += (target_rpm - self.engine_rpm) * min(1.0, 10.0 * dt)
                self.engine_rpm = max(800.0, min(6500.0, self.engine_rpm))

                # Torque calculation
                max_torque = self._get_engine_max_torque(self.engine_rpm)
                engine_torque = max_torque * self.accelerator_pos
                wheel_torque = engine_torque * overall_ratio * 0.88 # 88% drivetrain efficiency
                force_magnitude = wheel_torque / self.wheel_radius

                if is_reverse:
                    driving_force = -force_magnitude
                else:
                    driving_force = force_magnitude

                self.engine_load_percent = round(self.accelerator_pos * 100.0, 1)

            elif is_neutral:
                # In neutral, accelerator revs engine freely with no driving torque
                target_rpm = 800.0 + self.accelerator_pos * 5200.0
                self.engine_rpm += (target_rpm - self.engine_rpm) * min(1.0, 12.0 * dt)
                self.engine_rpm = max(800.0, min(6500.0, self.engine_rpm))
                driving_force = 0.0
                self.engine_load_percent = round(self.accelerator_pos * 40.0, 1)

        elif self.ignition and is_park:
            # In park, revving works similarly
            target_rpm = 800.0 + self.accelerator_pos * 3500.0
            self.engine_rpm += (target_rpm - self.engine_rpm) * min(1.0, 12.0 * dt)
            self.engine_rpm = max(800.0, min(5000.0, self.engine_rpm))
            driving_force = 0.0
            self.engine_load_percent = round(self.accelerator_pos * 30.0, 1)

        # 3. Resistive Forces: Rolling Resistance & Aerodynamic Drag
        # Rolling resistance acts against direction of travel
        v = self.speed_mps
        rolling_resistance = self.crr * self.mass_kg * self.g
        aero_drag = 0.5 * self.rho_air * self.cd * self.frontal_area * (v ** 2)

        # 4. Braking Force
        # Service brake: up to 1.0g deceleration (1450 kg * 9.81 m/s^2 * brake_pos)
        max_service_brake_force = self.mass_kg * 9.81 * 1.05
        service_brake_force = max_service_brake_force * self.brake_pos

        # Parking brake lock: very high holding force
        if self.parking_brake or is_park:
            parking_brake_force = self.mass_kg * 9.81 * 1.5
        else:
            parking_brake_force = 0.0

        total_braking_capacity = service_brake_force + parking_brake_force

        # 5. Longitudinal Acceleration & Velocity Update
        if abs(v) < 0.01 and total_braking_capacity > abs(driving_force):
            # Vehicle is at standstill and held by brakes or lack of drive
            if abs(driving_force) < (rolling_resistance + total_braking_capacity):
                self.speed_mps = 0.0
                self.longitudinal_accel_mps2 = 0.0
            else:
                # Drive overcomes stationary resistance
                net_f = driving_force - math.copysign(rolling_resistance, driving_force)
                self.longitudinal_accel_mps2 = net_f / self.mass_kg
                self.speed_mps += self.longitudinal_accel_mps2 * dt
        else:
            # Vehicle is in motion
            sign_v = 1.0 if v >= 0 else -1.0
            resistance_force = (rolling_resistance + aero_drag + total_braking_capacity) * sign_v
            net_force = driving_force - resistance_force
            accel = net_force / self.mass_kg

            # Forward braking check: ordinary forward braking cannot cause vehicle to reverse
            new_v = v + accel * dt
            if v > 0 and new_v <= 0 and driving_force >= 0:
                new_v = 0.0
                accel = -v / dt if dt > 0 else 0.0
            elif v < 0 and new_v >= 0 and driving_force <= 0:
                new_v = 0.0
                accel = -v / dt if dt > 0 else 0.0

            # Reverse max speed cap ~35 km/h (-9.72 m/s)
            if new_v < -9.72:
                new_v = -9.72
                accel = 0.0

            # Forward max speed cap ~240 km/h (66.67 m/s)
            if new_v > 66.67:
                new_v = 66.67
                accel = 0.0

            self.speed_mps = new_v
            self.longitudinal_accel_mps2 = accel

        # If Park is engaged, velocity is strictly 0
        if is_park:
            self.speed_mps = 0.0
            self.longitudinal_accel_mps2 = 0.0

        # 6. Steering & Heading kinematics
        # Steering angle delta theta = (v / L) * tan(delta) * dt
        actual_steer_angle_rad = math.radians(self.steering_angle_norm * self.max_steering_deg)
        if abs(self.speed_mps) > 0.05 and abs(actual_steer_angle_rad) > 0.001:
            yaw_rate_rad_s = (self.speed_mps / self.wheelbase) * math.tan(actual_steer_angle_rad)
            yaw_rate_deg_s = math.degrees(yaw_rate_rad_s)
            self.heading_deg = (self.heading_deg + yaw_rate_deg_s * dt) % 360.0

    def get_state(self) -> Dict[str, Any]:
        """Return the complete vehicle state dictionary."""
        speed_kmh = round(abs(self.speed_mps) * 3.6, 2)
        signed_speed_kmh = round(self.speed_mps * 3.6, 2)
        deceleration_mps2 = round(max(0.0, -self.longitudinal_accel_mps2), 2)
        
        # Compass cardinal direction
        cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        idx = int(((self.heading_deg + 22.5) % 360.0) / 45.0)
        heading_cardinal = cardinals[idx]

        return {
            "vehicle_speed_kmh": speed_kmh,
            "signed_speed_kmh": signed_speed_kmh,
            "engine_rpm": int(round(self.engine_rpm)),
            "current_gear": self.current_gear,
            "active_drive_gear": self.active_drive_gear if self.current_gear == "D" else None,
            "ignition": self.ignition,
            "parking_brake": self.parking_brake,
            "accelerator_percent": round(self.accelerator_pos * 100.0, 1),
            "brake_percent": round(self.brake_pos * 100.0, 1),
            "steering_angle_percent": round(self.steering_angle_norm * 100.0, 1),
            "steering_angle_deg": round(self.steering_angle_norm * self.max_steering_deg, 1),
            "heading_deg": round(self.heading_deg, 1),
            "heading_cardinal": heading_cardinal,
            "coolant_temp_c": round(self.coolant_temp_c, 1),
            "battery_voltage_v": round(self.battery_voltage_v, 2),
            "engine_load_percent": round(self.engine_load_percent, 1),
            "longitudinal_accel_mps2": round(self.longitudinal_accel_mps2, 2),
            "deceleration_mps2": deceleration_mps2,
            "headlights": self.headlights,
            "turn_indicators": self.turn_indicators,
            "hazard_lights": self.hazard_lights,
            "source_mode": "SIMULATION"
        }
