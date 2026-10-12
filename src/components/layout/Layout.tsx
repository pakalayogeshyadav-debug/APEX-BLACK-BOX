import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useSidebar } from '../../providers/SidebarProvider';
import { FloatingSimulatorConsole } from '../simulator/FloatingSimulatorConsole';
import { ModeSwitchModal } from '../simulator/ModeSwitchModal';

export const Layout: React.FC = () => {
  const { isCollapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-background text-primary font-sans flex flex-col">
      <TopBar />
      <Sidebar />
      <main
        className={`flex-1 pt-[88px] sm:pt-[98px] pb-8 sm:pb-12 px-4 sm:px-6 min-h-screen bg-background overflow-x-hidden transition-[margin] duration-200 ease-in-out ml-0 ${
          isCollapsed ? 'lg:ml-[100px]' : 'lg:ml-[272px]'
        }`}
      >
        <Outlet />
      </main>
      <FloatingSimulatorConsole />
      <ModeSwitchModal />
    </div>
  );
};
