"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, logout } = useAdminAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Skip auth check for login page
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    // Don't redirect if on login page or still loading
    if (isLoginPage || isLoading || isAuthenticated === null) {
      return;
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
      router.replace("/admin/login");
    }
  }, [isAuthenticated, isLoading, isLoginPage, router]);

  const handleLogout = async () => {
    await logout();
    router.replace("/admin/login");
  };

  // Show nothing while checking auth (prevents flash)
  if (isLoading || isAuthenticated === null) {
    if (!isLoginPage) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-surface-primary">
          <div className="text-text-secondary">加载中...</div>
        </div>
      );
    }
  }

  // Login page - render without sidebar
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Not authenticated - show nothing (will redirect)
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-primary">
        <div className="text-text-secondary">重定向中...</div>
      </div>
    );
  }

  // Authenticated - render with sidebar
  return (
    <div className="flex h-screen bg-surface-primary">
      <AdminSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={handleLogout}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
