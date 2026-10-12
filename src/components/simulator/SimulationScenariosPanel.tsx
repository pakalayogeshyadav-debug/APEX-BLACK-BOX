import React from 'react';
import { useSimulator } from '../../providers/SimulatorProvider';
import type { PresetScenarioName, PresetScenarioInfo } from '../../types/simulator';
import { Play, Square, AlertOctagon, Flame, BatteryLow, Car, Gauge, Wind, RotateCcw } from 'lucide-react';

const SCENARIOS: (PresetScenarioInfo & { icon: React.ReactNode })[] = [
  {
    name: 'Idle',
    tagline: 'Stationary engine idle',
    description: 'Vehicle in Park with engine running at ~800 RPM. Zero speed, nominal temperatures.',
    badge: 'normal',
    icon: <Car size={16} />
  },
  {
    name: 'City Driving',
    tagline: 'Stop-and-go urban cycle',
    description: 'Stoplight cycles, acceleration up to 45 km/h, gentle steering and braking.',
    badge: 'normal',
    icon: <Gauge size={16} />
  },
  {
    name: 'Highway Cruising',
    tagline: 'High-speed steady cruise',
    description: 'Sustained 110–115 km/h driving in 5th gear, optimal alternator voltage and thermal balance.',
    badge: 'normal',
    icon: <Wind size={16} />
  },
  {
    name: 'Hard Braking',
    tagline: 'Emergency deceleration > 0.8g',
    description: 'Cruises to ~90 km/h then triggers emergency maximum braking, generating HARD_BRAKING blackbox event.',
    badge: 'critical',
    icon: <AlertOctagon size={16} />
  },
  {
    name: 'Sudden Acceleration',
    tagline: 'Wide-open throttle launch',
    description: 'Full 100% pedal acceleration through automatic gear ratios up to maximum vehicle speed.',
    badge: 'performance',
    icon: <Play size={16} />
  },
  {
    name: 'Engine Overheating',
    tagline: 'Cooling system failure',
    description: 'High-load operation with simulated radiator failure; coolant climbs steadily past 115°C.',
    badge: 'critical',
    icon: <Flame size={16} />
  },
  {
    name: 'Low Battery',
    tagline: 'Alternator charging fault',
    description: 'Simulates alternator disconnect under electrical load; battery drops below 11.5V threshold.',
    badge: 'diagnostic',
    icon: <BatteryLow size={16} />
  },
  {
    name: 'Ignition Off',
    tagline: 'In-motion engine shutdown',
    description: 'Engine cuts out at speed; RPM drops to 0, vehicle coasts naturally to a stop with drag.',
    badge: 'diagnostic',
    icon: <RotateCcw size={16} />
  },
  {
    name: 'Custom Drive',
    tagline: 'Free manual driver control',
    description: 'Full manual control session with tracking timer, pedals, and steering enabled.',
    badge: 'normal',
    icon: <Car size={16} />
  }
];

export const SimulationScenariosPanel: React.FC = () => {
  const { simState, startScenario, stopScenario } = useSimulator();
  const activeScenario = simState.active_scenario;

  const handleScenarioToggle = (name: PresetScenarioName) => {
    if (activeScenario === name) {
      stopScenario();
    } else {
      startScenario(name);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-5 bg-surface rounded-[20px] border border-border shadow-xs select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-3">
        <div>
          <h2 className="text-[15px] font-semibold text-primary">Preset Simulation Scenarios</h2>
          <p className="text-xs text-secondary mt-0.5">Automotive test routines driving the deterministic dynamics engine</p>
        </div>

        {activeScenario && (
          <div className="flex items-center gap-2 px-3 py-1 bg-accent-subtle/80 border border-accent/30 rounded-[8px] text-xs font-mono text-accent">
            <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
            <span className="font-semibold">{activeScenario}</span>
            <span className="text-muted tabular-nums">({simState.scenario_elapsed_sec}s)</span>
            <button
              onClick={stopScenario}
              className="ml-1 p-0.5 hover:bg-accent/20 rounded text-accent"
              title="Stop Scenario"
            >
              <Square size={12} />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {SCENARIOS.map(scen => {
          const isActive = activeScenario === scen.name;

          let badgeStyles = 'bg-surface-secondary text-secondary border-border';
          if (scen.badge === 'critical') {
            badgeStyles = 'bg-error-subtle text-error border-error/30 font-medium';
          } else if (scen.badge === 'performance') {
            badgeStyles = 'bg-accent-subtle text-accent border-accent/30 font-medium';
          } else if (scen.badge === 'diagnostic') {
            badgeStyles = 'bg-warning-subtle text-warning border-warning/30 font-medium';
          }

          return (
            <div
              key={scen.name}
              className={`flex flex-col justify-between p-4 rounded-[16px] border transition-all duration-150 ${
                isActive
                  ? 'bg-accent-subtle/30 border-accent shadow-xs ring-1 ring-accent/30'
                  : 'bg-surface-secondary/40 border-border/80 hover:border-border hover:bg-surface-hover/50'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`p-1.5 rounded-[8px] ${isActive ? 'bg-accent text-white' : 'bg-surface text-secondary border border-border'}`}>
                      {scen.icon}
                    </span>
                    <span className="font-semibold text-sm text-primary">{scen.name}</span>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-[6px] border ${badgeStyles}`}>
                    {scen.badge.toUpperCase()}
                  </span>
                </div>

                <p className="text-xs font-medium text-secondary mt-1">{scen.tagline}</p>
                <p className="text-[11px] text-muted mt-1 leading-relaxed">{scen.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
                {isActive ? (
                  <button
                    onClick={() => handleScenarioToggle(scen.name as PresetScenarioName)}
                    className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-[9px] bg-primary text-white text-xs font-mono font-semibold transition-colors hover:bg-primary/90"
                  >
                    <Square size={13} />
                    <span>Stop Routine</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleScenarioToggle(scen.name as PresetScenarioName)}
                    className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-[9px] bg-surface text-primary border border-border text-xs font-mono font-medium hover:bg-surface-hover hover:border-accent/40 transition-colors"
                  >
                    <Play size={13} className="text-accent" />
                    <span>Run Scenario</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
