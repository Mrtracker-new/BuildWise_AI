/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        apple: {
          panel: 'var(--panel)',
          border: 'var(--panel-border)',
          fill: 'var(--fill)',
          'fill-hover': 'var(--fill-hover)',
          hairline: 'var(--hairline)',
          'text-1': 'var(--text-1)',
          'text-2': 'var(--text-2)',
          'text-3': 'var(--text-3)',
          accent: 'var(--accent)',
          'accent-tint': 'var(--accent-tint)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      letterSpacing: {
        apple: '-0.01em',
      },
    },
  },
  plugins: [
    require('@tailwindcss/container-queries'),
  ],
}
