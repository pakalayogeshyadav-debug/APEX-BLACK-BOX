import type { TelemetryData, SystemStatus } from '../types';

export class SimulationService {
  private intervalId: number | null = null;
  private listeners: ((data: TelemetryData) => void)[] = [];
  
  private currentSpeed = 0;
  private currentRpm = 800;
  private currentThrottle = 0;

  start() {
    if (this.intervalId) return;
    this.intervalId = window.setInterval(() => {
      // Deterministic but realistic simulation
      this.currentThrottle = Math.max(0, Math.min(100, this.currentThrottle + (Math.random() * 10 - 4)));
      if (this.currentThrottle > 10) {
        this.currentRpm = Math.min(7000, this.currentRpm + (this.currentThrottle * 0.5));
        this.currentSpeed = Math.min(220, this.currentSpeed + (this.currentThrottle * 0.05));
      } else {
        this.currentRpm = Math.max(800, this.currentRpm - 50);
        this.currentSpeed = Math.max(0, this.currentSpeed - 1);
      }

      const deceleration = this.currentThrottle === 0 && this.currentSpeed > 0 ? 0.5 : 0;

      const data: TelemetryData = {
        timestamp: new Date().toISOString(),
        speed: Math.round(this.currentSpeed),
        rpm: Math.round(this.currentRpm),
        throttle: Math.round(this.currentThrottle),
        deceleration,
        simulated: true,
      };

      this.listeners.forEach(l => l(data));
    }, 100); // 10Hz telemetry
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  subscribe(callback: (data: TelemetryData) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  getSystemStatus(): SystemStatus {
    return {
      mode: 'SIMULATION',
      logger: { status: 'healthy', lastSeen: new Date().toISOString() },
      gateway: { status: 'healthy', lastSeen: new Date().toISOString() },
      backend: { status: 'disconnected', lastSeen: new Date().toISOString() },
      lastUpdate: new Date().toISOString(),
    };
  }
}

export const simulationService = new SimulationService();
