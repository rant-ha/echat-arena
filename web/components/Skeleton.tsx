import { cn } from "@/components/ui";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-surface-elevated", className)} />;
}

// Pre-built skeleton patterns for common admin uses
export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border-faint bg-surface-secondary p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>
      <div className="mt-3">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="mt-2 h-3 w-16" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border-faint bg-surface-secondary/70 p-4">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-8 w-8" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
