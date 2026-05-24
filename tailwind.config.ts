import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#F8F8F6",
        card: "#FFFFFF",
        card2: "#F3F3F1",
        line: "#E5E5E3",
        "line-soft": "#EDEDEB",
        ink: "#1A1A1A",
        "ink-soft": "#6B6B6B",
        "ink-faint": "#A3A3A3",
        accent: {
          DEFAULT: "#0A66C2",
          hover: "#004182",
          light: "#E8F4FF",
          dim: "#378FE9",
        },
        star: "#F59E0B",
        success: "#059669",
        warning: "#D97706",
        destructive: "#DC2626",
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: {
          DEFAULT: "#6B7280",
          foreground: "#9CA3AF",
        },
        border: "#E5E7EB",
      },
      fontFamily: {
        display: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        body: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      maxWidth: {
        page: "1180px",
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.25rem",
      },
    },
  },
  plugins: [],
};
export default config;
