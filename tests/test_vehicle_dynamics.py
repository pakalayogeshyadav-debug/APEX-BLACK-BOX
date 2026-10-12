import pytest
from app.services.vehicle_dynamics import VehicleDynamicsModel

def test_initial_state():
    model = VehicleDynamicsModel()
    state = model.get_state()
    assert state["vehicle_speed_kmh"] == 0.0
    assert state["engine_rpm"] == 0
    assert state["current_gear"] == "P"
    assert state["ignition"] is False
    assert state["parking_brake"] is True
    assert state["source_mode"] == "SIMULATION"

def test_ignition_and_idle():
    model = VehicleDynamicsModel()
    model.set_controls(ignition=True)
    # Step 0.1s
    model.step(0.1)
    state = model.get_state()
    assert state["ignition"] is True
    assert state["engine_rpm"] >= 800
    assert state["battery_voltage_v"] > 12.5

def test_park_prevents_motion():
    model = VehicleDynamicsModel()
    model.set_controls(ignition=True, gear="P", parking_brake=False, accelerator=1.0)
    for _ in range(20):
        model.step(0.1)
    state = model.get_state()
    assert state["vehicle_speed_kmh"] == 0.0

def test_parking_brake_prevents_motion():
    model = VehicleDynamicsModel()
    model.set_controls(ignition=True, gear="D", parking_brake=True, accelerator=0.5)
    for _ in range(20):
        model.step(0.1)
    state = model.get_state()
    assert state["vehicle_speed_kmh"] == 0.0

def test_forward_acceleration_in_drive():
    model = VehicleDynamicsModel()
    model.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.8)
    for _ in range(30): # 3.0 seconds
        model.step(0.1)
    state = model.get_state()
    assert state["vehicle_speed_kmh"] > 15.0
    assert state["engine_rpm"] > 1200
    assert state["longitudinal_accel_mps2"] > 0.0

def test_braking_and_no_negative_forward_speed():
    model = VehicleDynamicsModel()
    model.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.8)
    for _ in range(30):
        model.step(0.1)
    speed_before = model.get_state()["vehicle_speed_kmh"]
    assert speed_before > 15.0

    # Apply 100% brake, 0% accelerator
    model.set_controls(accelerator=0.0, brake=1.0)
    for _ in range(40):
        model.step(0.1)
    state = model.get_state()
    assert state["vehicle_speed_kmh"] == 0.0
    assert state["signed_speed_kmh"] == 0.0 # Forward braking cannot make speed negative!
    assert state["deceleration_mps2"] >= 0.0

def test_coasting_and_drag():
    model = VehicleDynamicsModel()
    model.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.8)
    for _ in range(40):
        model.step(0.1)
    peak_speed = model.get_state()["vehicle_speed_kmh"]

    # Release accelerator, no brake
    model.set_controls(accelerator=0.0, brake=0.0)
    for _ in range(20):
        model.step(0.1)
    coasting_speed = model.get_state()["vehicle_speed_kmh"]
    assert coasting_speed < peak_speed # Slows down due to rolling resistance & drag

def test_neutral_gear_disconnect():
    model = VehicleDynamicsModel()
    model.set_controls(ignition=True, gear="N", parking_brake=False, accelerator=0.8)
    for _ in range(20):
        model.step(0.1)
    state = model.get_state()
    assert state["vehicle_speed_kmh"] == 0.0 # No torque transmitted
    assert state["engine_rpm"] > 2500 # Engine revs freely

def test_reverse_gear():
    model = VehicleDynamicsModel()
    model.set_controls(ignition=True, gear="R", parking_brake=False, accelerator=0.5)
    for _ in range(20):
        model.step(0.1)
    state = model.get_state()
    assert state["signed_speed_kmh"] < 0.0 # Moving backwards
    assert state["vehicle_speed_kmh"] > 0.0

    # Apply brake while reversing
    model.set_controls(accelerator=0.0, brake=1.0)
    for _ in range(20):
        model.step(0.1)
    state = model.get_state()
    assert state["signed_speed_kmh"] == 0.0 # Reverse braking returns to 0 without going positive

def test_ignition_off_behavior():
    model = VehicleDynamicsModel()
    model.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.5)
    for _ in range(20):
        model.step(0.1)
    # Turn off ignition
    model.set_controls(ignition=False, accelerator=0.5)
    for _ in range(20):
        model.step(0.1)
    state = model.get_state()
    assert state["ignition"] is False
    assert state["engine_rpm"] == 0
    assert state["battery_voltage_v"] < 13.0

def test_rpm_and_speed_limits():
    model = VehicleDynamicsModel()
    model.set_controls(ignition=True, gear="N", parking_brake=False, accelerator=1.0)
    for _ in range(50):
        model.step(0.1)
    state = model.get_state()
    assert state["engine_rpm"] <= 6500

def test_steering_and_heading():
    model = VehicleDynamicsModel()
    model.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.6, steering=0.5)
    for _ in range(30):
        model.step(0.1)
    state = model.get_state()
    assert state["steering_angle_percent"] == 50.0
    assert state["heading_deg"] != 0.0

def test_coolant_temperature_progression():
    model = VehicleDynamicsModel()
    initial_temp = model.get_state()["coolant_temp_c"]
    model.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.8)
    for _ in range(100):
        model.step(0.1)
    warmed_temp = model.get_state()["coolant_temp_c"]
    assert warmed_temp > initial_temp # Warms gradually

def test_invalid_input_clamping():
    model = VehicleDynamicsModel()
    # Out of range accelerator (> 100) and brake (< 0) and steering (> 100)
    model.set_controls(accelerator=999.0, brake=-50.0, steering=-200.0)
    state = model.get_state()
    assert state["accelerator_percent"] == 100.0
    assert state["brake_percent"] == 0.0
    assert state["steering_angle_percent"] == -100.0

def test_timestep_consistency():
    # Comparing 10 steps of 0.1s vs 1 step of 1.0s (approximately similar integration trend)
    m1 = VehicleDynamicsModel()
    m1.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.5)
    for _ in range(10):
        m1.step(0.1)
    
    m2 = VehicleDynamicsModel()
    m2.set_controls(ignition=True, gear="D", parking_brake=False, accelerator=0.5)
    for _ in range(20):
        m2.step(0.05)
    
    # Speeds should be closely comparable
    s1 = m1.get_state()["vehicle_speed_kmh"]
    s2 = m2.get_state()["vehicle_speed_kmh"]
    assert abs(s1 - s2) < 2.0
