/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#F5F7FA',
        surface: '#FFFFFF',
        'surface-secondary': '#F8FAFC',
        'surface-hover': '#F1F5F9',
        border: '#E3E8EF',
        divider: '#D5DDE7',
        primary: '#17212F',
        secondary: '#596579',
        muted: '#8590A0',
        accent: '#087F9C',
        'accent-hover': '#066780',
        'accent-subtle': '#E8F5F8',
        telemetry: '#087F9C',
        success: '#18794E',
        'success-subtle': '#EAF6EF',
        healthy: '#18794E',
        warning: '#946200',
        'warning-subtle': '#FFF5DF',
        error: '#B42332',
        'error-subtle': '#FDECEE',
        critical: '#B42332',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
