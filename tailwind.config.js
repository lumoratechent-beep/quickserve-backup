
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./App.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    fontFamily: {
      sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
    },
    extend: {
      fontWeight: {
        bold: '500',
        extrabold: '600',
        black: '600',
      },
      letterSpacing: {
        normal: '0.02em',
      },
      colors: {
        gray: {
          50: '#eef0f3',
          100: '#dfe2e6',
          200: '#c8ccd3',
        },
      },
      animation: {
        'slide-left': 'slideLeft 0.3s ease-out',
      },
      keyframes: {
        slideLeft: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
