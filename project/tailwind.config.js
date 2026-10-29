/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        ink: {
          950: '#000000',
          900: '#000000',
          850: '#000000',
          800: '#000000',
          750: '#171717',
          700: '#262626',
          600: '#404040',
        },
        pulse: {
          50: '#eefcf5',
          100: '#d6f5e6',
          200: '#aae8cd',
          300: '#6fd3aa',
          400: '#36bd85',
          500: '#14a36b',
          600: '#0a8255',
          700: '#096846',
          800: '#0a5239',
          900: '#09432f',
        },
        signal: {
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
        },
        flame: {
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
        },
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
      },
      animation: {
        'flash': 'flash 1s ease-in-out infinite',
        'slide': 'slide 30s linear infinite',
        'fade-in': 'fade-in 0.4s ease-out',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'ticker': 'ticker 40s linear infinite',
      },
      keyframes: {
        flash: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '0.8' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        'ticker': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
};
