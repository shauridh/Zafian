import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FAF7F0",
        ink: "#141414",
        sun: "#FFD93D",
        candy: "#FF6B9D",
        teal: "#4ECDC4",
        lime: "#C7F464",
        tangerine: "#FF9F45",
        gofood: "#00AA13",
        grabfood: "#1A1A1A",
        shopeefood: "#EE4D2D",
        danger: "#F43F5E",
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
        "neo-pink": "4px 4px 0 0 #FF6B9D",
        "neo-teal": "4px 4px 0 0 #4ECDC4",
        "neo-sun": "4px 4px 0 0 #FFD93D",
        "neo-danger": "4px 4px 0 0 #F43F5E",
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
