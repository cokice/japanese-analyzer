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
    extend: {
      colors: {
        paper: 'var(--paper)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink2)',
        'ink-3': 'var(--ink3)',
        rule: 'var(--rule)',
        shu: 'var(--shu)',
        'shu-soft': 'var(--shu-soft)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        jp: ['var(--font-jp)', 'serif'],
        ui: ['var(--font-ui)', 'sans-serif'],
      },
      borderRadius: {
        paper: '3px',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
