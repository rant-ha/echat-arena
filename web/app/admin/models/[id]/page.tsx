"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, Input, Label, ErrorText } from "@/components/ui";

export default function EditModelPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken } = useAdminAuth();
  const modelId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    model_key: "",
    model_name: "",
    api_type: "openai",
    api_base: "",
    api_key: "",
    is_enabled: true,
    anony_only: true,
    weight: 100,
    description: "",
  });

  useEffect(() => {
    async function fetchModel() {
      const token = getToken();
      if (!token) {
        setError("未登录");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/proxy/api/arena/admin/models/${modelId}`,
          {
            headers: {
              "admin-token": token,
            },
          }
        );

        const data = await res.json();

        if (data.ok) {
          setFormData({
            model_key: data.data.model_key || "",
            model_name: data.data.model_name || "",
            api_type: data.data.api_type || "openai",
            api_base: data.data.api_base || "",
            api_key: "", // Don't prefill API key for security
            is_enabled: data.data.is_enabled ?? true,
            anony_only: data.data.anony_only ?? true,
            weight: data.data.weight || 100,
            description: data.data.description || "",
          });
        } else {
          setError(data.error || "获取模型信息失败");
        }
      } catch {
        setError("网络错误");
      } finally {
        setLoading(false);
      }
    }

    fetchModel();
  }, [modelId, getToken]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : type === "number"
          ? parseInt(value) || 0
          : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.model_name.trim()) {
      setError("模型名称是必填项");
      return;
    }

    const token = getToken();
    if (!token) {
      setError("未登录");
      return;
    }

    setSubmitting(true);

    try {
      // Only send fields that can be updated (not model_key)
      const updateData: any = {
        model_name: formData.model_name,
        api_type: formData.api_type,
        api_base: formData.api_base,
        is_enabled: formData.is_enabled,
        anony_only: formData.anony_only,
        weight: formData.weight,
        description: formData.description,
      };

      // Only include api_key if it was changed
      if (formData.api_key) {
        updateData.api_key = formData.api_key;
      }

      const res = await fetch(`/api/proxy/api/arena/admin/models/${modelId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "admin-token": token,
        },
        body: JSON.stringify(updateData),
      });

      const data = await res.json();

      if (data.ok) {
        router.push("/admin/models");
      } else {
        setError(data.error || "更新失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-text-muted">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <h1 className="text-2xl font-semibold text-text-primary">编辑模型</h1>
        <p className="mt-1 text-sm text-text-muted">
          修改模型配置
        </p>
      </div>

      {/* Form */}
      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h2 className="font-medium text-text-primary">基本信息</h2>

            <div>
              <Label htmlFor="model_key">模型 Key</Label>
              <Input
                id="model_key"
                name="model_key"
                value={formData.model_key}
                disabled
                className="bg-surface-elevated"
              />
              <p className="mt-1 text-xs text-text-muted">
                模型 Key 不可修改
              </p>
            </div>

            <div>
              <Label htmlFor="model_name">模型名称 *</Label>
              <Input
                id="model_name"
                name="model_name"
                value={formData.model_name}
                onChange={handleChange}
                placeholder="例如: GPT-4 Turbo"
              />
            </div>

            <div>
              <Label htmlFor="description">描述</Label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={2}
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
                placeholder="可选的模型描述"
              />
            </div>
          </div>

          {/* API Configuration */}
          <div className="space-y-4">
            <h2 className="font-medium text-text-primary">API 配置</h2>

            <div>
              <Label htmlFor="api_type">API 类型</Label>
              <select
                id="api_type"
                name="api_type"
                value={formData.api_type}
                onChange={handleChange}
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              >
                <option value="openai">OpenAI Compatible</option>
                <option value="anthropic">Anthropic</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <Label htmlFor="api_base">API Base URL</Label>
              <Input
                id="api_base"
                name="api_base"
                value={formData.api_base}
                onChange={handleChange}
                placeholder="https://api.openai.com/v1"
              />
            </div>

            <div>
              <Label htmlFor="api_key">API Key</Label>
              <Input
                id="api_key"
                name="api_key"
                type="password"
                value={formData.api_key}
                onChange={handleChange}
                placeholder="留空则不修改"
              />
              <p className="mt-1 text-xs text-text-muted">
                留空表示保持现有 API Key 不变
              </p>
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-4">
            <h2 className="font-medium text-text-primary">设置</h2>

            <div>
              <Label htmlFor="weight">权重</Label>
              <Input
                id="weight"
                name="weight"
                type="number"
                min={1}
                max={1000}
                value={formData.weight}
                onChange={handleChange}
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="is_enabled"
                  checked={formData.is_enabled}
                  onChange={handleChange}
                  className="rounded border-border"
                />
                <span className="text-sm text-text-secondary">启用</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="anony_only"
                  checked={formData.anony_only}
                  onChange={handleChange}
                  className="rounded border-border"
                />
                <span className="text-sm text-text-secondary">仅匿名对战</span>
              </label>
            </div>
          </div>

          {/* Error */}
          {error && <ErrorText>{error}</ErrorText>}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4">
            <Button type="submit" disabled={submitting}>
              <Save className="mr-2 h-4 w-4" />
              {submitting ? "保存中..." : "保存"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
            >
              取消
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
