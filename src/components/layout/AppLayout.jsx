import { Outlet } from 'react-router-dom'
import { motion } from 'motion/react'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import AppSidebar from './AppSidebar'

export default function AppLayout() {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/6 lg:hidden">
            <SidebarTrigger />
            <span className="text-sm font-medium text-muted-foreground">Меню</span>
          </div>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="p-6"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </SidebarProvider>
  )
}
