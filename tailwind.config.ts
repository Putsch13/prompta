import type { Config } from "tailwindcss";

/**
 * Design system Prompta — DA « AI Core » (dark HUD).
 * Fond quasi-noir bleuté, bleu électrique lumineux, lignes fines, mono technique.
 * Les noms de tokens sont sémantiques : tout l'app se re-skinne depuis ce fichier.
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#05070D",
        card: "#0A0F1B",
        card2: "#0E1524",
        line: "#172136",
        "line-soft": "#111A2B",
        ink: "#E4EDF9",
        "ink-soft": "#8FA1BC",
        "ink-faint": "#5B6B85",
        accent: {
          DEFAULT: "#38BDF8",
          hover: "#67D0FF",
          light: "#0B2036",
          dim: "#1E7FC2",
          /** Texte posé SUR un fond accent (les CTA lumineux). */
          ink: "#04121F",
        },
        star: "#FBBF24",
        success: "#34D399",
        warning: "#FBBF24",
        destructive: "#F87171",
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: {
          DEFAULT: "#8FA1BC",
          foreground: "#5B6B85",
        },
        border: "#172136",
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
      boxShadow: {
        glow: "0 0 24px -4px rgba(56,189,248,0.45), 0 0 6px -2px rgba(56,189,248,0.6)",
        "glow-sm": "0 0 12px -2px rgba(56,189,248,0.35)",
        "glow-lg": "0 0 60px -12px rgba(56,189,248,0.5), 0 0 16px -4px rgba(56,189,248,0.45)",
        "inner-line": "inset 0 1px 0 0 rgba(228,237,249,0.04)",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 18px -4px rgba(56,189,248,0.35)" },
          "50%": { boxShadow: "0 0 30px -2px rgba(56,189,248,0.65)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "ring-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "ring-spin-rev": {
          from: { transform: "rotate(360deg)" },
          to: { transform: "rotate(0deg)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "15%": { opacity: "1" },
          "85%": { opacity: "1" },
          "100%": { transform: "translateY(100%)", opacity: "0" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
      },
      animation: {
        "glow-pulse": "glow-pulse 2.6s ease-in-out infinite",
        "fade-up": "fade-up 0.7s cubic-bezier(0.16,1,0.3,1) both",
        "ring-spin": "ring-spin 24s linear infinite",
        "ring-spin-slow": "ring-spin 48s linear infinite",
        "ring-spin-rev": "ring-spin-rev 36s linear infinite",
        scan: "scan 5s ease-in-out infinite",
        blink: "blink 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
