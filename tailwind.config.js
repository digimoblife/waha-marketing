/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#00688E',
          hover: '#005575',
          dark: '#00435C',
          soft: '#ECF6FA',
          border: '#A7D6E7',
        },
        surface: {
          app: '#F4F8FA',
          card: '#FFFFFF',
          subtle: '#E8EFF3',
          active: '#D3EBF3',
        },
      },
    },
  },
  plugins: [],
};
