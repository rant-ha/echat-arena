"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Bot,
  MoreVertical,
  Pencil,
  Trash2,
  Check,
  X,
  RefreshCw,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card } from "@/components/ui";
import { cn } from "@/components/ui";

interface Model {
  id: string;
  model_key: string;
  model_name: string;
  api_type: string;
  api_base: string;
  is_enabled: boolean;
  anony_only: boolean;
  weight: number;
  description: string;
  created_at: string;
  updated_at: string;
  display_order?: number;
}

export default function ModelsPage() {
  const router = useRouter();
  const { getToken } = useAdminAuth();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeDisabled, setIncludeDisabled] = useState(true);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);

    const token = getToken();
    if (!token) {
      setError("未登录");
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({
        page: "1",
        page_size: "100",
        include_disabled: includeDisabled.toString(),
      });

      const res = await fetch(`/api/proxy/api/arena/admin/models?${params}`, {
        headers: {
          "admin-token": token,
        },
      });

      const data = await res.json();

      if (data.ok) {
        setModels(data.data.models || []);
      } else {
        setError(data.error || "获取模型列表失败");
      }
    } catch (err) {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [getToken, includeDisabled]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleDelete = async (modelId: string) => {
    if (!confirm("确定要删除这个模型吗？")) {
      return;
    }

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/proxy/api/arena/admin/models/${modelId}`, {
        method: "DELETE",
        headers: {
          "admin-token": token,
        },
      });

      const data = await res.json();

      if (data.ok) {
        fetchModels();
      } else {
        alert(data.error || "删除失败");
      }
    } catch {
      alert("网络错误");
    }

    setActionMenuId(null);
  };

  const handleToggleEnabled = async (model: Model) => {
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/proxy/api/arena/admin/models/${model.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "admin-token": token,
        },
        body: JSON.stringify({
          is_enabled: !model.is_enabled,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        fetchModels();
      } else {
        alert(data.error || "更新失败");
      }
    } catch {
      alert("网络错误");
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0 || isReordering) return;
    const token = getToken();
    if (!token) return;

    setIsReordering(true);
    const newModels = [...models];
    [newModels[index], newModels[index - 1]] = [newModels[index - 1], newModels[index]];

    // 重新计算 display_order
    const orders = newModels.map((m, i) => ({ id: m.id, display_order: i + 1 }));

    try {
      const res = await fetch("/api/proxy/api/arena/admin/models/reorder", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "admin-token": token,
        },
        body: JSON.stringify({ orders }),
      });

      const data = await res.json();
      if (data.ok) {
        setModels(newModels);
      } else {
        alert(data.error || "排序失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setIsReordering(false);
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index === models.length - 1 || isReordering) return;
    const token = getToken();
    if (!token) return;

    setIsReordering(true);
    const newModels = [...models];
    [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];

    const orders = newModels.map((m, i) => ({ id: m.id, display_order: i + 1 }));

    try {
      const res = await fetch("/api/proxy/api/arena/admin/models/reorder", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "admin-token": token,
        },
        body: JSON.stringify({ orders }),
      });

      const data = await res.json();
      if (data.ok) {
        setModels(newModels);
      } else {
        alert(data.error || "排序失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setIsReordering(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">模型配置</h1>
          <p className="mt-1 text-sm text-text-muted">
            管理 AI 模型端点和 API 配置
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={fetchModels}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button onClick={() => router.push("/admin/models/new")}>
            <Plus className="mr-2 h-4 w-4" />
            添加模型
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={includeDisabled}
            onChange={(e) => setIncludeDisabled(e.target.checked)}
            className="rounded border-border"
          />
          显示已禁用模型
        </label>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-text-muted">加载中...</div>
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-negative">{error}</div>
        </div>
      ) : models.length === 0 ? (
        <Card className="flex h-64 flex-col items-center justify-center">
          <Bot className="h-12 w-12 text-text-muted" />
          <p className="mt-4 text-text-muted">暂无模型配置</p>
          <Button
            className="mt-4"
            onClick={() => router.push("/admin/models/new")}
          >
            <Plus className="mr-2 h-4 w-4" />
            添加第一个模型
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {models.map((model, index) => (
            <Card
              key={model.id}
              className={cn(
                "flex items-center gap-4 p-4",
                !model.is_enabled && "opacity-60",
                actionMenuId === model.id && "relative z-50"
              )}
            >
              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0 || isReordering}
                  className="rounded p-0.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                  title="上移"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleMoveDown(index)}
                  disabled={index === models.length - 1 || isReordering}
                  className="rounded p-0.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                  title="下移"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              {/* Icon */}
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg",
                  model.is_enabled
                    ? "bg-interactive-accent/10"
                    : "bg-surface-elevated"
                )}
              >
                <Bot
                  className={cn(
                    "h-5 w-5",
                    model.is_enabled
                      ? "text-interactive-accent"
                      : "text-text-muted"
                  )}
                />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-text-primary">
                    {model.model_name}
                  </h3>
                  {!model.is_enabled && (
                    <span className="rounded bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
                      已禁用
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-text-muted">
                  {model.model_key}
                </p>
                {model.description && (
                  <p className="mt-1 line-clamp-1 text-sm text-text-secondary">
                    {model.description}
                  </p>
                )}
              </div>

              {/* Meta */}
              <div className="hidden text-right text-sm text-text-muted md:block">
                <div>#{index + 1} | 权重: {model.weight}</div>
                <div>{model.api_type}</div>
              </div>

              {/* Actions */}
              <div className="relative">
                <button
                  onClick={() =>
                    setActionMenuId(actionMenuId === model.id ? null : model.id)
                  }
                  className="rounded p-2 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>

                {actionMenuId === model.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setActionMenuId(null)}
                    />
                    <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border-faint bg-surface-secondary p-1 shadow-lg">
                      <button
                        onClick={() => {
                          router.push(`/admin/models/${model.id}`);
                          setActionMenuId(null);
                        }}
                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                      >
                        <Pencil className="h-4 w-4" />
                        编辑
                      </button>
                      <button
                        onClick={() => handleToggleEnabled(model)}
                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                      >
                        {model.is_enabled ? (
                          <>
                            <X className="h-4 w-4" />
                            禁用
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4" />
                            启用
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(model.id)}
                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-negative hover:bg-negative/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        删除
                      </button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
