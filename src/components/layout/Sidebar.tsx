import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  Gauge,
  HardDrive,
  AlertTriangle,
  FileSpreadsheet,
  Cpu,
  Settings as SettingsIcon,
  X
} from 'lucide-react';
import { useSidebar } from '../../providers/SidebarProvider';

export const Sidebar: React.FC = () => {
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const navItems = [
    { name: 'Overview', path: '/', icon: <LayoutDashboard size={17} strokeWidth={1.8} /> },
    { name: 'Live Telemetry', path: '/telemetry', icon: <Activity size={17} strokeWidth={1.8} /> },
    { name: 'Vehicle Simulator', path: '/simulator', icon: <Gauge size={17} strokeWidth={1.8} /> },
    { name: 'Black Box', path: '/blackbox', icon: <HardDrive size={17} strokeWidth={1.8} /> },
    { name: 'Event Recorder', path: '/events', icon: <AlertTriangle size={17} strokeWidth={1.8} /> },
    { name: 'Recordings', path: '/recordings', icon: <FileSpreadsheet size={17} strokeWidth={1.8} /> },
    { name: 'Device Health', path: '/health', icon: <Cpu size={17} strokeWidth={1.8} /> },
    { name: 'Settings', path: '/settings', icon: <SettingsIcon size={17} strokeWidth={1.8} /> },
  ];

  const renderNavLinks = (isDrawer = false) => (
    <nav className="flex-1 py-4 px-3 flex flex-col gap-1.5 overflow-y-auto">
      {navItems.map(item => {
        const isCollapsedMode = isCollapsed && !isDrawer;

        return (
          <div
            key={item.path}
            className="relative"
            onMouseEnter={() => isCollapsedMode && setHoveredItem(item.name)}
            onMouseLeave={() => isCollapsedMode && setHoveredItem(null)}
          >
            <NavLink
              to={item.path}
              onClick={() => isDrawer && closeMobile()}
              onFocus={() => isCollapsedMode && setHoveredItem(item.name)}
              onBlur={() => isCollapsedMode && setHoveredItem(null)}
              className={({ isActive }) =>
                `flex items-center h-[44px] rounded-[10px] text-sm font-medium transition-all duration-180 ${
                  isCollapsedMode ? 'justify-center px-0' : 'gap-3 px-3.5'
                } ${
                  isActive
                    ? 'bg-accent-subtle/85 text-accent shadow-xs'
                    : 'text-secondary hover:text-primary hover:bg-surface-hover/80'
                }`
              }
              aria-label={item.name}
            >
              {({ isActive }) => (
                <>
                  <span className={`flex-shrink-0 flex items-center justify-center transition-colors ${isActive ? 'text-accent' : 'text-muted'}`}>
                    {item.icon}
                  </span>
                  {(!isCollapsed || isDrawer) && (
                    <span className="truncate tracking-[-0.1px]">{item.name}</span>
                  )}
                </>
              )}
            </NavLink>

            {/* Tooltip in collapsed mode */}
            {isCollapsedMode && hoveredItem === item.name && (
              <div
                role="tooltip"
                className="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 z-50 bg-[#172334] text-white text-xs font-medium px-3 py-1.5 rounded-[9px] shadow-lg whitespace-nowrap pointer-events-none"
              >
                {item.name}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-xs z-40 lg:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* Mobile Floating Drawer (< 1024px) */}
      <aside
        className={`fixed top-3 bottom-3 left-3 z-50 w-[270px] bg-white/95 backdrop-blur-md border border-border rounded-[22px] shadow-2xl flex flex-col transition-transform duration-200 ease-in-out lg:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-[110%]'
        }`}
      >
        <div className="h-16 px-5 border-b border-border/80 flex items-center justify-between">
          <span className="text-[15px] font-[650] text-primary">APEX BLACKBOX</span>
          <button
            onClick={closeMobile}
            className="p-1.5 rounded-[9px] text-secondary hover:text-primary hover:bg-surface-hover"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {renderNavLinks(true)}

        <div className="p-4 border-t border-border/80 text-[11px] font-mono text-muted">
          <div className="font-medium text-secondary">APEX OS v1.2</div>
          <div className="text-[10px] text-muted">CAN 2.0B / Dual ESP32</div>
        </div>
      </aside>

      {/* Desktop Persistent Floating Collapsible Sidebar (>= 1024px) */}
      <aside
        className={`hidden lg:flex fixed top-[86px] sm:top-[94px] left-4 sm:left-6 bottom-4 sm:bottom-6 z-20 flex-col rounded-[22px] glass-panel select-none transition-[width] duration-200 ease-in-out ${
          isCollapsed ? 'w-[72px]' : 'w-[238px]'
        }`}
      >
        {renderNavLinks(false)}

        {/* Footer Meta */}
        <div className="p-3.5 border-t border-border/80 overflow-hidden">
          {!isCollapsed ? (
            <div className="text-[11px] font-mono text-muted px-1.5">
              <div className="font-medium text-secondary">APEX OS v1.2</div>
              <div className="text-[10px] text-muted">CAN 2.0B / Dual ESP32</div>
            </div>
          ) : (
            <div className="flex justify-center text-[10px] font-mono font-semibold text-muted" title="APEX OS v1.2">
              v1.2
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
