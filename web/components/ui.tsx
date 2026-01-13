import * as React from "react";

export function cn(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(" ");
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "ghost";
  }
) {
  const { className, variant = "primary", ...rest } = props;
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition",
        "border border-border bg-card text-foreground shadow-soft",
        variant === "primary" && "hover:border-primary/50 hover:text-primary",
        variant === "ghost" && "bg-transparent shadow-none hover:bg-white/5",
        className
      )}
      {...rest}
    />
  );
}

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }
) {
  const { className, ...rest } = props;
  return (
    <input
      className={cn(
        "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm",
        "outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20",
        className
      )}
      {...rest}
    />
  );
}

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/70 p-6 shadow-soft backdrop-blur",
        className
      )}
      {...rest}
    />
  );
}

export function ErrorText(props: React.HTMLAttributes<HTMLParagraphElement>) {
  const { className, ...rest } = props;
  return (
    <p className={cn("mt-2 text-sm text-red-300", className)} {...rest} />
  );
}

export function Label(props: React.LabelHTMLAttributes<HTMLLabelElement>) {
  const { className, ...rest } = props;
  return (
    <label
      className={cn("mb-1 block text-sm text-foreground/90", className)}
      {...rest}
    />
  );
}
