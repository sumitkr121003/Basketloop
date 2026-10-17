/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Stargate Deep Carbon Palette
        canvas: "#141414",
        background: "#141414",
        surface: "#1C1C1E",
        "surface-elevated": "#242428",
        "surface-hover": "#2A2A30",
        "surface-inset": "#141416",
        "surface-border": "#26262A",
        "border-subtle": "#26262A",
        "border-prominent": "#36363C",
        "border-highlight": "#484852",

        // Typography
        "text-primary": "#FAFAFA",
        "text-secondary": "#9A9A9A",
        "text-muted": "#666666",

        // Stargate Emerald Mint Brand Accent
        mint: {
          300: "#6EE7B7",
          400: "#34D399",
          500: "#0FB983", // Stargate verified accent
          600: "#059669",
          glow: "rgba(15, 185, 131, 0.15)",
        },
        emerald: {
          400: "#34D399",
          500: "#0FB983",
          600: "#059669",
        },
        indigo: {
          400: "#818CF8",
          500: "#6366F1",
          600: "#4F46E5",
        },
        cyan: {
          400: "#38BDF8",
          500: "#0EA5E9",
        },
        // Semantic Alerts
        stargate: {
          warning: "#F46F28",
          error: "#F3566B",
          success: "#0FB983",
        },
      },
      fontFamily: {
        sans: [
          "Geist",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "Geist Mono",
          "JetBrains Mono",
          "Roboto Mono",
          "monospace",
        ],
      },
      boxShadow: {
        stargate: "0px 4px 111.9px 0px rgba(20, 20, 20, 0.80)",
        "glow-mint": "0 0 30px -5px rgba(15, 185, 131, 0.25)",
        "glow-cyan": "0 0 30px -5px rgba(56, 189, 248, 0.20)",
        "card-deep": "0 8px 32px -4px rgba(0, 0, 0, 0.6)",
      },
      borderRadius: {
        "2xl": "20px",
        "3xl": "24px",
      },
    },
  },
  plugins: [],
};
