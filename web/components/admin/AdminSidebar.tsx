"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Bot,
  BarChart3,
  MessageSquare,
  LogOut,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/components/ui";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { href: "/admin", label: "仪表板", icon: LayoutDashboard },
  { href: "/admin/users", label: "用户管理", icon: Users },
  { href: "/admin/models", label: "模型配置", icon: Bot },
  { href: "/admin/statistics", label: "系统统计", icon: BarChart3 },
  { href: "/admin/sessions", label: "会话管理", icon: MessageSquare },
];

interface AdminSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onLogout?: () => void;
}

export function AdminSidebar({ collapsed = false, onToggle, onLogout }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border-faint bg-surface-secondary transition-all duration-300",
        collapsed ? "w-[60px]" : "w-[240px]"
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border-faint px-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-interactive-accent" />
            <span className="font-semibold text-text-primary">Admin</span>
          </div>
        )}
        {collapsed && (
          <Shield className="mx-auto h-5 w-5 text-interactive-accent" />
        )}
        {onToggle && (
          <button
            onClick={onToggle}
            className="rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-interactive-accent/10 text-interactive-accent"
                      : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-border-faint p-2">
        <button
          onClick={onLogout}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-negative/10 hover:text-negative",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? "退出登录" : undefined}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>退出登录</span>}
        </button>
      </div>
    </aside>
  );
}
