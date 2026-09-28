import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Two-pane pages need ~800px beside the 268px sidebar; the default 1280px stacked them on typical laptop windows.
      screens: { xl: "1152px" },
      colors: {
        ink: "hsl(var(--ink))",
        paper: "hsl(var(--paper))",
        line: "hsl(var(--line))",
        navy: "hsl(var(--navy))",
        accent: "hsl(var(--accent))",
        danger: "hsl(var(--danger))",
        warning: "hsl(var(--warning))",
        success: "hsl(var(--success) / <alpha-value>)",
      },
      boxShadow: {
        panel: "0 14px 36px rgba(8, 29, 53, .08)",
      },
    },
  },
  plugins: [],
};

export default config;
