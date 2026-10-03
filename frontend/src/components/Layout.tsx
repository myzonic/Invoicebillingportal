import { useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  FileText,
  Send,
  Zap,
  Boxes,
  Store,
  BadgeDollarSign,
  ShieldCheck,
  KeyRound,
  ScrollText,
  Settings,
  LogOut,
  Menu,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/app/store";
import { reset } from "@/features/auth/authSlice";
import { tokenStore } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useMeQuery } from "@/app/apiSlice";
import Logo from "@/components/Logo";
import { branding } from "@/config/branding";

const NAV = [
  { to: "/dashboard/main", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/clients", label: "Clients", icon: Users },
  { to: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { to: "/dashboard/direct-invoice", label: "Direct Invoice", icon: Zap },
  { to: "/dashboard/invoice-logs", label: "Invoice Logs", icon: Send },
  { to: "/dashboard/brand-management", label: "Brands", icon: Boxes },
  { to: "/dashboard/merchant-management", label: "Merchants", icon: Store },
  { to: "/dashboard/merchant-records", label: "Merchant Records", icon: BadgeDollarSign },
  { to: "/dashboard/user-management", label: "Users", icon: ShieldCheck },
  { to: "/dashboard/roles", label: "Roles & Permissions", icon: KeyRound },
  { to: "/dashboard/logs", label: "Logs", icon: ScrollText },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  useMeQuery();

  const logout = () => {
    tokenStore.clear();
    dispatch(reset());
    navigate("/login");
  };

  const side = useMemo(
    () => (
      <div className="flex h-full flex-col">
        <div
          className={cn(
            "flex h-16 shrink-0 items-center gap-2.5 border-b border-neutral-200 px-5",
            "bg-white",
            collapsed && "justify-center px-2",
          )}
        >
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-neutral-200">
            <Logo className={cn("size-10", collapsed && "size-9")} />
          </div>
          {!collapsed && <span className="truncate text-sm font-bold text-neutral-900">{branding.portalName}</span>}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                  isActive
                    ? "bg-neutral-900 text-white shadow-sm"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                  collapsed && "justify-center px-0",
                )
              }
              title={item.label}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-neutral-200 p-3">
          <div className={cn("flex items-center gap-2 rounded-md px-2 py-2", collapsed && "justify-center")}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
              {user?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-neutral-900">{user?.name}</p>
                <p className="truncate text-xs text-neutral-500">{user?.role?.name}</p>
              </div>
            )}
            <Button variant="ghost" size="icon" className="text-neutral-500 hover:text-neutral-900" onClick={logout} title="Logout">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    ),
    [collapsed, mobileOpen, user],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-neutral-200 bg-card md:flex",
          collapsed ? "w-16" : "w-56",
        )}
      >
        {side}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-card">{side}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={() => setCollapsed((v) => !v)}
            title="Collapse sidebar"
          >
            <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
          </Button>
          <div className="ml-auto text-sm font-bold text-neutral-900">
            {branding.companyName} &middot; {branding.portalTagline}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
