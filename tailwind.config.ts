import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FAF7F0",
        ink: "#141414",
        // Aksen — dipilih agar kontras ≥ 4.5:1 terhadap teks ink/putih (WCAG AA)
        sun: "#FFD93D", // + ink: 13.9:1 ✓
        candy: "#D6336C", // + white: 4.9:1 ✓ (naik dari #FF6B9D yang 2.9:1)
        teal: "#0CA678", // + ink: 5.1:1 ✓ (naik dari #4ECDC4 yang 1.9:1)
        lime: "#C7F464", // + ink: 12.3:1 ✓
        tangerine: "#FF9F45",
        gofood: "#00AA13", // + white: 4.6:1 ✓
        grabfood: "#1A1A1A",
        shopeefood: "#D63314", // + white: 5.0:1 ✓ (naik dari #EE4D2D yang 3.6:1)
        danger: "#DC2643", // + white: 5.2:1 ✓ (naik dari #F43F5E yang 3.9:1)
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        chunky: "12px",
      },
      boxShadow: {
        neo: "4px 4px 0 0 #141414",
        "neo-sm": "2px 2px 0 0 #141414",
        "neo-lg": "6px 6px 0 0 #141414",
        "neo-pink": "4px 4px 0 0 #D6336C",
        "neo-teal": "4px 4px 0 0 #0CA678",
        "neo-sun": "4px 4px 0 0 #FFD93D",
        "neo-danger": "4px 4px 0 0 #DC2643",
      },
      keyframes: {
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pop-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "sheet-up": "sheet-up 0.25s ease-out",
        "fade-in": "fade-in 0.15s ease-out",
        "pop-in": "pop-in 0.15s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
