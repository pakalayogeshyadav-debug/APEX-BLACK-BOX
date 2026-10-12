import React from 'react';
import type { VehicleSimState } from '../../types/simulator';
import { Thermometer, Zap, Activity, Compass, Gauge } from 'lucide-react';

interface Props {
  simState: VehicleSimState;
  compact?: boolean;
}

export const VehicleTelemetryGrid: React.FC<Props> = ({ simState, compact = false }) => {
  const isOverheating = simState.coolant_temp_c >= 105.0;
  const isLowBattery = simState.battery_voltage_v < 11.8;
  const accelG = (simState.longitudinal_accel_mps2 / 9.81).toFixed(2);

  const metrics = [
    {
      label: 'Vehicle Speed',
      value: `${Math.round(simState.vehicle_speed_kmh)} km/h`,
      subValue: `${(simState.vehicle_speed_kmh / 3.6).toFixed(1)} m/s`,
      icon: <Gauge size={15} className="text-accent" />,
      highlight: false
    },
    {
      label: 'Engine RPM',
      value: `${simState.engine_rpm} RPM`,
      subValue: `Load: ${simState.engine_load_percent}%`,
      icon: <Activity size={15} className={simState.engine_rpm > 6000 ? 'text-error' : 'text-[#B77916]'} />,
      highlight: simState.engine_rpm > 6000
    },
    {
      label: 'Coolant Temp',
      value: `${simState.coolant_temp_c}°C`,
      subValue: isOverheating ? 'OVERHEATING WARNING' : 'Normal Operating Temp',
      icon: <Thermometer size={15} className={isOverheating ? 'text-error' : 'text-primary'} />,
      highlight: isOverheating,
      alertColor: isOverheating ? 'border-error/50 bg-error-subtle/50 text-error' : ''
    },
    {
      label: 'Battery Voltage',
      value: `${simState.battery_voltage_v.toFixed(2)} V`,
      subValue: isLowBattery ? 'LOW BATTERY DISCHARGE' : simState.battery_voltage_v > 13.5 ? 'Alternator Charging' : 'Resting State',
      icon: <Zap size={15} className={isLowBattery ? 'text-error' : 'text-primary'} />,
      highlight: isLowBattery,
      alertColor: isLowBattery ? 'border-error/50 bg-error-subtle/50 text-error' : ''
    },
    {
      label: 'Longitudinal Accel',
      value: `${simState.longitudinal_accel_mps2 > 0 ? '+' : ''}${simState.longitudinal_accel_mps2.toFixed(2)} m/s²`,
      subValue: `${accelG} g`,
      icon: <Activity size={15} className={simState.longitudinal_accel_mps2 < 0 ? 'text-error' : 'text-accent'} />,
      highlight: simState.deceleration_mps2 > 5.0
    },
    {
      label: 'Compass Heading',
      value: `${Math.round(simState.heading_deg)}°`,
      subValue: `${simState.heading_cardinal} (${simState.steering_angle_deg > 0 ? '+' : ''}${simState.steering_angle_deg}° steer)`,
      icon: <Compass size={15} className="text-accent" />,
      highlight: false
    }
  ];

  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="flex items-center justify-between p-2 rounded-[8px] bg-surface-secondary/70 border border-border">
          <span className="text-secondary">Coolant</span>
          <span className={`font-semibold ${isOverheating ? 'text-error font-bold' : 'text-primary'}`}>
            {simState.coolant_temp_c}°C
          </span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-[8px] bg-surface-secondary/70 border border-border">
          <span className="text-secondary">Battery</span>
          <span className={`font-semibold ${isLowBattery ? 'text-error font-bold' : 'text-primary'}`}>
            {simState.battery_voltage_v.toFixed(2)}V
          </span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-[8px] bg-surface-secondary/70 border border-border">
          <span className="text-secondary">Load</span>
          <span className="font-semibold text-primary">{simState.engine_load_percent}%</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-[8px] bg-surface-secondary/70 border border-border">
          <span className="text-secondary">Heading</span>
          <span className="font-semibold text-primary">{Math.round(simState.heading_deg)}° {simState.heading_cardinal}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-primary uppercase tracking-wider font-mono">
          Authoritative Telemetry Readouts
        </span>
        <span className="text-[11px] font-mono text-muted">
          Session Seq: #{simState.sequence_number} &bull; Buffer: {simState.rolling_buffer_samples} samples
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col justify-between p-3.5 rounded-[14px] bg-surface border transition-all ${
              m.alertColor || 'border-border/80 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-secondary mb-1.5">
              <span className="font-sans font-medium text-[11px]">{m.label}</span>
              {m.icon}
            </div>

            <div className="font-mono text-[17px] font-bold text-primary tracking-tight tabular-nums">
              {m.value}
            </div>

            <div className={`text-[10px] font-mono mt-1 truncate ${m.highlight ? 'font-semibold text-error' : 'text-muted'}`}>
              {m.subValue}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
