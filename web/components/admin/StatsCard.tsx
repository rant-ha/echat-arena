import { cn } from "@/components/ui";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatsCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border-faint bg-surface-secondary p-6",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-muted">{title}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-interactive-accent/10">
          <Icon className="h-5 w-5 text-interactive-accent" />
        </div>
      </div>
      <div className="mt-3">
        <p className="text-3xl font-semibold text-text-primary">{value}</p>
        {description && (
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        )}
        {trend && (
          <div
            className={cn(
              "mt-2 flex items-center gap-1 text-sm",
              trend.isPositive ? "text-positive" : "text-negative"
            )}
          >
            <span>{trend.isPositive ? "↑" : "↓"}</span>
            <span>{Math.abs(trend.value)}%</span>
            <span className="text-text-muted">vs 上期</span>
          </div>
        )}
      </div>
    </div>
  );
}
