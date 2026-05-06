/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Syncopate'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
        body: ["'DM Sans'", "sans-serif"],
      },
      colors: {
        ore: { DEFAULT: "#FF6B35", dim: "#7A3218" },
        acid: { DEFAULT: "#C8FF00", dim: "#5A7200" },
        void: "#050A0F",
        surface: "#0C1520",
        panel: "#0F1D2E",
        border: "#1A3040",
        muted: "#3A6070",
        textPrimary: "#E8F4F8",
        textSecondary: "#7AA8BC",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "scan": "scan 4s linear infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        glow: {
          "0%": { boxShadow: "0 0 5px #C8FF00, 0 0 10px #C8FF00" },
          "100%": { boxShadow: "0 0 20px #C8FF00, 0 0 40px #C8FF00" },
        },
      },
    },
  },
  plugins: [],
};
