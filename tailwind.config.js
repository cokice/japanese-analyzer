/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/streamdown/dist/**/*.{js,mjs}',
    './node_modules/@assistant-ui/react-streamdown/dist/**/*.{js,mjs}',
    './node_modules/@streamdown/code/dist/**/*.{js,mjs}',
  ],
  theme: {
    extend: {},
  },
  plugins: [require('@tailwindcss/typography')],
}
