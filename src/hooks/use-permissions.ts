import { useQuery } from "@tanstack/react-query";
import type { UserAccess } from "@/lib/rbac";
import type { ModuleId } from "@/lib/permissions";

async function fetchPermissions(): Promise<UserAccess> {
  const res = await fetch("/api/permissions");
  if (!res.ok) throw new Error("Failed to load permissions");
  return res.json() as Promise<UserAccess>;
}

export function usePermissions() {
  const { data, isLoading, refetch } = useQuery<UserAccess>({
    queryKey: ["permissions"],
    queryFn: fetchPermissions,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60 * 1000,
  });

  function can(module: ModuleId, action: "read" | "write" | "manage"): boolean {
    if (!data) return false;
    return data.permissions[module]?.[action] ?? false;
  }

  return {
    access: data,
    loading: isLoading,
    isAdmin: data?.isAdmin ?? false,
    can,
    refresh: refetch,
  };
}
