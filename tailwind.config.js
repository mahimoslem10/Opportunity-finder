/** @type {import('tailwindcss').Config} */
const themeVar = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        white: themeVar('surface'),
        'on-brand': themeVar('on-brand'),
        gray: {
          50: themeVar('gray-50'),
          100: themeVar('gray-100'),
          200: themeVar('gray-200'),
          300: themeVar('gray-300'),
          400: themeVar('gray-400'),
          500: themeVar('gray-500'),
          600: themeVar('gray-600'),
          700: themeVar('gray-700'),
          800: themeVar('gray-800'),
          900: themeVar('gray-900'),
        },
        navy: {
          50: themeVar('navy-50'),
          100: themeVar('navy-100'),
          200: themeVar('navy-200'),
          300: themeVar('navy-300'),
          400: themeVar('navy-400'),
          500: themeVar('navy-500'),
          600: themeVar('navy-600'),
          700: themeVar('navy-700'),
          800: themeVar('navy-800'),
          900: themeVar('navy-900'),
        },
        accent: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
