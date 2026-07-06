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
        bg: "#FAFAFC",
        card: "#FFFFFF",
        card2: "#F4F4F8",
        line: "#E6E6EE",
        "line-soft": "#EEEEF4",
        ink: "#16161D",
        "ink-soft": "#5D5D6B",
        "ink-faint": "#9C9CAC",
        accent: {
          DEFAULT: "#4F46E5",
          hover: "#4338CA",
          light: "#EEF2FF",
          dim: "#818CF8",
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
