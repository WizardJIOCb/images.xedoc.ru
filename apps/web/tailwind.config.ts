import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f4efe4",
        ink: "#1d1d1b",
        accent: "#e85d04",
        accent2: "#6b8f71",
        soft: "#fffaf0"
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        body: ["Trebuchet MS", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
