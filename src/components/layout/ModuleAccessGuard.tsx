"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Home, Shield } from "lucide-react";
import { modules } from "@/lib/modules";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";

function resolveModule(pathname: string) {
  const sorted = [...modules].sort((a, b) => b.href.length - a.href.length);
  return (
    sorted.find((module) => pathname === module.href || pathname.startsWith(`${module.href}/`)) ??
    null
  );
}

export function ModuleAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { access, loading } = usePermissions();
  const module = resolveModule(pathname);

  if (!module) return <>{children}</>;
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Shield className="mx-auto mb-3 h-8 w-8 animate-pulse text-slate-400" />
          <p className="text-sm text-slate-600">Checking module permissions...</p>
        </div>
      </div>
    );
  }

  const hasRead = access?.isAdmin || access?.permissions?.[module.id]?.read;
  const blockedByAdminOnly = module.adminOnly && !access?.isAdmin;

  if (hasRead && !blockedByAdminOnly) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-full items-center justify-center bg-background p-8">
      <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto mb-3 h-9 w-9 text-red-500" />
        <h2 className="text-lg font-semibold text-slate-900">Access Restricted</h2>
        <p className="mt-2 text-sm text-slate-600">
          You do not have read access to the <span className="font-medium">{module.label}</span>{" "}
          module.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/home">
            <Button>
              <Home className="mr-2 h-4 w-4" />
              Back To Home
            </Button>
          </Link>
          <Link href="/search">
            <Button variant="outline">Open Search</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
