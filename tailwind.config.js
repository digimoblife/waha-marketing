/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        wa: {
          green: '#25D366',
          teal: '#128C7E',
          'teal-dark': '#075E54',
          light: '#25d366',
          blue: '#34B7F1',
          bg: '#EFEAE2',
          'chat-in': '#FFFFFF',
          'chat-out': '#D9FDD3',
          gray: '#F0F2F5',
          'gray-dark': '#54656F',
        },
      },
    },
  },
  plugins: [],
}
