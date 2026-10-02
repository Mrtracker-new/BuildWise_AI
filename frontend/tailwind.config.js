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
      transitionDuration: {
        DEFAULT: '150ms',
        0: '0ms',
        75: '75ms',
        100: '100ms',
        150: '150ms',
        200: '200ms',
        250: '250ms',
        300: '300ms',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
      keyframes: {
        'scrim-fade': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'sheet-in': {
          from: { opacity: '0', transform: 'scale(0.97) translateY(6px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'scrim': 'scrim-fade 150ms cubic-bezier(0.25, 0.1, 0.25, 1) forwards',
        'sheet-in': 'sheet-in 200ms cubic-bezier(0.25, 0.1, 0.25, 1) forwards',
        'toast-in': 'toast-in 200ms cubic-bezier(0.25, 0.1, 0.25, 1) forwards',
      },
    },
  },
  plugins: [
    require('@tailwindcss/container-queries'),
  ],
}
