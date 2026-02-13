import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./utils/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Custom Zinc-based Palette
        surface: {
          primary: "var(--surface-primary)",
          secondary: "var(--surface-secondary)",
          tertiary: "var(--surface-tertiary)",
          elevated: "var(--surface-elevated)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        border: {
          faint: "var(--border-faint)",
          strong: "var(--border-strong)",
        },
        glass: {
          bg: "var(--glass-bg)",
          border: "var(--glass-border)",
        },
        interactive: {
          accent: "var(--interactive-accent)",
          hover: "var(--interactive-hover)",
        },
        // Legacy fallback (can be removed later if unused)
        background: "var(--surface-primary)",
        foreground: "var(--text-primary)",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,0.35)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
      },
      animation: {
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
