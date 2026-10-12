import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Overview } from './pages/Overview';
import { LiveTelemetry } from './pages/LiveTelemetry';
import { VehicleSimulator } from './pages/VehicleSimulator';
import { BlackBox } from './pages/BlackBox';
import { EventRecorder } from './pages/EventRecorder';
import { Recordings } from './pages/Recordings';
import { DeviceHealth } from './pages/DeviceHealth';
import { Settings } from './pages/Settings';
import { TelemetryProvider } from './providers/TelemetryProvider';
import { SidebarProvider } from './providers/SidebarProvider';
import { SimulatorProvider } from './providers/SimulatorProvider';

function App() {
  return (
    <TelemetryProvider>
      <SimulatorProvider>
        <SidebarProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Overview />} />
                <Route path="telemetry" element={<LiveTelemetry />} />
                <Route path="simulator" element={<VehicleSimulator />} />
                <Route path="blackbox" element={<BlackBox />} />
                <Route path="events" element={<EventRecorder />} />
                <Route path="recordings" element={<Recordings />} />
                <Route path="health" element={<DeviceHealth />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </SidebarProvider>
      </SimulatorProvider>
    </TelemetryProvider>
  );
}

export default App;
