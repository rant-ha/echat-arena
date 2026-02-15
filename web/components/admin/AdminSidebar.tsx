"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Bot,
  BarChart3,
  MessageSquare,
  MessagesSquare,
  LogOut,
  Shield,
  ChevronLeft,
  ChevronRight,
  Globe,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/components/ui";
import { useI18n } from "@/utils/i18n-context";

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { href: "/admin", labelKey: "admin.nav.dashboard", icon: LayoutDashboard },
  { href: "/admin/users", labelKey: "admin.nav.users", icon: Users },
  { href: "/admin/models", labelKey: "admin.nav.models", icon: Bot },
  { href: "/admin/statistics", labelKey: "admin.nav.statistics", icon: BarChart3 },
  { href: "/admin/leaderboard", labelKey: "admin.nav.leaderboard", icon: Trophy },
  { href: "/admin/analytics", labelKey: "admin.nav.analytics", icon: TrendingUp },
  { href: "/admin/conversations", labelKey: "admin.nav.conversations", icon: MessagesSquare },
  { href: "/admin/sessions", labelKey: "admin.nav.sessions", icon: MessageSquare },
];

interface AdminSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onLogout?: () => void;
}

export function AdminSidebar({ collapsed = false, onToggle, onLogout }: AdminSidebarProps) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useI18n();

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
            <span className="font-semibold text-text-primary">{t("admin.title")}</span>
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
            const label = t(item.labelKey);

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
                  title={collapsed ? label : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-border-faint p-2">
        {/* Language Toggle */}
        {!collapsed ? (
          <button
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary mb-1"
            title={locale === "zh" ? "Switch to English" : "\u5207\u6362\u5230\u4e2d\u6587"}
          >
            <Globe className="h-5 w-5 flex-shrink-0" />
            <span>{locale === "zh" ? "EN" : "\u4e2d\u6587"}</span>
          </button>
        ) : (
          <button
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            className="flex w-full items-center justify-center rounded-lg px-2 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary mb-1"
            title={locale === "zh" ? "Switch to English" : "\u5207\u6362\u5230\u4e2d\u6587"}
          >
            <Globe className="h-5 w-5 flex-shrink-0" />
          </button>
        )}

        <button
          onClick={onLogout}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-negative/10 hover:text-negative",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? t("admin.logout") : undefined}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>{t("admin.logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
