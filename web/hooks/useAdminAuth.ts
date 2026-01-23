"use client";

import { useState, useEffect, useCallback } from "react";

const ADMIN_TOKEN_KEY = "admin_token";
const ADMIN_TOKEN_EXPIRY_KEY = "admin_token_expiry";

export interface AdminAuthState {
  isAuthenticated: boolean | null; // null = loading
  isLoading: boolean;
  error: string | null;
}

export function useAdminAuth() {
  const [state, setState] = useState<AdminAuthState>({
    isAuthenticated: null,
    isLoading: true,
    error: null,
  });

  // Check token validity on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));

    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    const expiry = localStorage.getItem(ADMIN_TOKEN_EXPIRY_KEY);

    // No token stored
    if (!token || !expiry) {
      setState({ isAuthenticated: false, isLoading: false, error: null });
      return;
    }

    // Check if expired locally
    if (new Date(expiry) < new Date()) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.removeItem(ADMIN_TOKEN_EXPIRY_KEY);
      setState({ isAuthenticated: false, isLoading: false, error: null });
      return;
    }

    // Verify with server
    try {
      const res = await fetch("/api/proxy/api/arena/admin/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "admin-token": token,
        },
      });

      const data = await res.json();

      if (data.ok && data.data?.valid) {
        setState({ isAuthenticated: true, isLoading: false, error: null });
      } else {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        localStorage.removeItem(ADMIN_TOKEN_EXPIRY_KEY);
        setState({ isAuthenticated: false, isLoading: false, error: null });
      }
    } catch (err) {
      setState({
        isAuthenticated: false,
        isLoading: false,
        error: "Failed to verify token",
      });
    }
  }, []);

  const login = useCallback(async (password: string): Promise<boolean> => {
    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const res = await fetch("/api/proxy/api/arena/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (data.ok && data.data?.token) {
        localStorage.setItem(ADMIN_TOKEN_KEY, data.data.token);
        localStorage.setItem(ADMIN_TOKEN_EXPIRY_KEY, data.data.expires_at);
        setState({ isAuthenticated: true, isLoading: false, error: null });
        return true;
      } else {
        setState({
          isAuthenticated: false,
          isLoading: false,
          error: data.error || "Login failed",
        });
        return false;
      }
    } catch (err) {
      setState({
        isAuthenticated: false,
        isLoading: false,
        error: "Network error",
      });
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);

    if (token) {
      try {
        await fetch("/api/proxy/api/arena/admin/logout", {
          method: "POST",
          headers: {
            "admin-token": token,
          },
        });
      } catch {
        // Ignore logout errors
      }
    }

    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_EXPIRY_KEY);
    setState({ isAuthenticated: false, isLoading: false, error: null });
  }, []);

  const getToken = useCallback((): string | null => {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  }, []);

  return {
    ...state,
    login,
    logout,
    checkAuth,
    getToken,
  };
}
