import { useAppSelector } from "@/app/store";

export function usePermission(module: string) {
  const user = useAppSelector((s) => s.auth.user);
  return (action: "create" | "read" | "update" | "delete") => {
    if (!user) return false;
    const roleName = user.role?.name?.toLowerCase();
    if (roleName === "super-admin" || roleName === "admin") return true;
    const perm = user.role?.permissions?.find((p) => p.module === module);
    if (!perm) return false;
    const key = `can${action.charAt(0).toUpperCase()}${action.slice(1)}` as keyof typeof perm;
    return Boolean(perm[key]);
  };
}

export function useCan(module: string) {
  return usePermission(module);
}
