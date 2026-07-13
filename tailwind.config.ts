import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--primary)",
        "primary-strong": "var(--primary-strong)",
        "primary-tint": "var(--primary-tint)",
        accent: "var(--accent)",
        ink: "var(--ink)",
        body: "var(--text)",
        muted: "var(--muted)",
        line: "var(--border)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "sev-major": "var(--sev-major)",
        "sev-major-bg": "var(--sev-major-bg)",
        "sev-moderate": "var(--sev-moderate)",
        "sev-moderate-bg": "var(--sev-moderate-bg)",
        "sev-minor": "var(--sev-minor)",
        "sev-minor-bg": "var(--sev-minor-bg)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(23, 41, 59, 0.04), 0 1px 3px rgba(23, 41, 59, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
