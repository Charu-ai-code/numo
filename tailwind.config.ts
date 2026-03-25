import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: "#0a0a0a",
        surface: "#141414",
        "surface-light": "#1a1a1a",
        "surface-border": "rgba(255,255,255,0.08)",
        accent: {
          green: "#4edea3",
          coral: "#ffb4ab",
          amber: "#e9c349",
          blue: "#b0c6ff",
        },
        muted: "#888888",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        pulse_glow: "pulseGlow 2s infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,180,171,0.4)" },
          "50%": { boxShadow: "0 0 12px 4px rgba(255,180,171,0.2)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
