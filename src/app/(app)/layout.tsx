import { AppHeader } from "@/components/layout/AppHeader";
import { ModuleAccessGuard } from "@/components/layout/ModuleAccessGuard";
import { AppSidebar } from "@/components/layout/AppSidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto bg-background">
          <ModuleAccessGuard>{children}</ModuleAccessGuard>
        </main>
      </div>
    </div>
  );
}
