"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { modules } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/hooks/use-permissions";

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin;
  const { access, loading } = usePermissions();
  const accessibleModules = access?.accessibleModules ?? null;
  const [collapsed, setCollapsed] = useState(false);

  const visibleModules = useMemo(() => {
    const canSeeModule = (module: (typeof modules)[number]) =>
      !module.adminOnly || Boolean(isAdmin);

    if (loading) {
      return modules.filter((module) => module.id === "home" && canSeeModule(module));
    }
    if (accessibleModules) {
      return modules.filter(
        (module) => accessibleModules.includes(module.id) && canSeeModule(module)
      );
    }
    if (isAdmin) {
      return modules;
    }
    return modules.filter(
      (module) =>
        (module.id === "home" || module.id === "search") && canSeeModule(module)
    );
  }, [accessibleModules, isAdmin, loading]);

  return (
    <aside
      className={cn(
        "relative flex h-full shrink-0 flex-col overflow-hidden border-r border-[#5f0f16] bg-[linear-gradient(180deg,var(--twx-sidebar-from,#6e0d14)_0%,var(--twx-sidebar-mid,#560d14)_38%,var(--twx-sidebar-to,#45111a)_100%)] text-white shadow-[12px_0_30px_-24px_rgba(29,4,7,0.9)] transition-all duration-200",
        collapsed ? "w-[56px]" : "w-[220px]"
      )}
    >
      <div className="animate-sidebar-sheen pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(255,255,255,0.22),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(0,0,0,0.3)_100%)]" />
      <div className="relative flex h-full flex-col py-3">
        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="mb-2 ml-auto mr-2 flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>

        {!collapsed ? (
          <div className="mb-2 px-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
              Navigation
            </p>
          </div>
        ) : null}

        <nav className="app-sidebar-scroll flex-1 space-y-1 overflow-y-auto px-2">
          {visibleModules.map((mod) => {
            const Icon = mod.icon;
            const isActive = pathname.startsWith(mod.href);
            return (
              <Link
                key={mod.id}
                href={mod.href}
                title={collapsed ? mod.label : undefined}
                className={cn(
                  "group relative flex items-center gap-2.5 overflow-hidden rounded-xl px-2.5 py-2.5 text-sm font-medium transition-all duration-200",
                  collapsed ? "justify-center" : "",
                  isActive
                    ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.26)_0%,rgba(255,255,255,0.1)_100%)] text-white ring-1 ring-white/30 shadow-[0_10px_24px_-16px_rgba(0,0,0,0.95)]"
                    : "text-white/80 hover:translate-x-0.5 hover:bg-white/[0.09] hover:text-white hover:ring-1 hover:ring-white/16 hover:shadow-[0_8px_18px_-16px_rgba(0,0,0,0.9)]"
                )}
              >
                {!collapsed ? (
                  <span
                    className={cn(
                      "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[linear-gradient(180deg,#fff6f6_0%,#ffd6d9_100%)] transition-opacity duration-200",
                      isActive ? "opacity-100" : "opacity-0"
                    )}
                  />
                ) : null}
                <span
                  className={cn(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                    isActive
                      ? "bg-black/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
                      : "text-white/75 group-hover:bg-white/10 group-hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </span>
                {!collapsed ? <span className="truncate">{mod.label}</span> : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
