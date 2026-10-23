/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: { 950: '#070b14', 900: '#0b1120', 850: '#0f172a', 800: '#141d31', 700: '#1e293b', 600: '#2a3650' },
        sev: { 1: '#22c55e', 2: '#a3e635', 3: '#f59e0b', 4: '#f97316', 5: '#e11d48' },
      },
      keyframes: {
        pulsering: { '0%': { transform: 'scale(.6)', opacity: '.9' }, '100%': { transform: 'scale(2.4)', opacity: '0' } },
        slidein: { '0%': { transform: 'translateY(-6px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: { pulsering: 'pulsering 1.6s ease-out infinite', slidein: 'slidein .3s ease-out' },
    },
  },
  plugins: [],
};
