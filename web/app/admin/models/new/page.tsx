"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, Input, Label, ErrorText } from "@/components/ui";

export default function NewModelPage() {
  const router = useRouter();
  const { getToken } = useAdminAuth();
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

    if (!formData.model_key.trim()) {
      setError("模型 Key 是必填项");
      return;
    }
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
      const res = await fetch("/api/proxy/api/arena/admin/models", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "admin-token": token,
        },
        body: JSON.stringify(formData),
      });

      // 先检查 HTTP 状态码
      if (!res.ok) {
        try {
          const data = await res.json();
          // 处理 FastAPI HTTPException 格式 {"detail": "..."} 和标准格式 {"ok": false, "error": "..."}
          const errorMsg = data.detail || data.error || `请求失败 (${res.status})`;

          // 特殊处理 401 - 提示重新登录
          if (res.status === 401) {
            setError("登录已过期，请重新登录");
            return;
          }

          setError(errorMsg);
        } catch {
          setError(`请求失败 (HTTP ${res.status})`);
        }
        return;
      }

      const data = await res.json();

      if (data.ok) {
        router.push("/admin/models");
      } else {
        setError(data.error || "创建失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

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
        <h1 className="text-2xl font-semibold text-text-primary">添加模型</h1>
        <p className="mt-1 text-sm text-text-muted">
          配置新的 AI 模型端点
        </p>
      </div>

      {/* Form */}
      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h2 className="font-medium text-text-primary">基本信息</h2>

            <div>
              <Label htmlFor="model_key">模型 Key *</Label>
              <Input
                id="model_key"
                name="model_key"
                value={formData.model_key}
                onChange={handleChange}
                placeholder="例如: gpt-4-turbo"
              />
              <p className="mt-1 text-xs text-text-muted">
                唯一标识符，用于 API 调用
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
              <p className="mt-1 text-xs text-text-muted">
                显示名称
              </p>
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
                placeholder="sk-..."
              />
              <p className="mt-1 text-xs text-text-muted">
                API 密钥将安全存储
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
              <p className="mt-1 text-xs text-text-muted">
                选择概率权重，数值越大被选中概率越高
              </p>
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
