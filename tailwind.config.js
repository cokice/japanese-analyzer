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
        canvas: 'var(--bg)', panel: 'var(--bg-2)', ink: 'var(--ink)', muted: 'var(--ink-2)', subtle: 'var(--ink-3)', line: 'var(--line)',
        primary: { DEFAULT: 'var(--primary)', hover: 'var(--primary-2)', soft: 'var(--primary-soft)' },
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        pos: Object.fromEntries(['n', 'v', 'adj', 'adjv', 'adv', 'adn', 'conj', 'int', 'p', 'aux', 'o'].map(key => [key, `var(--pos-${key})`])),
      },
      fontSize: Object.fromEntries(['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl'].map(key => [`ui-${key}`, `var(--text-${key})`])),
      borderRadius: Object.fromEntries(['sm', 'md', 'lg', 'pill'].map(key => [`ui-${key}`, `var(--r-${key})`])),
      spacing: Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 8].map(key => [`ui-${key}`, `var(--space-${key})`])),
      fontFamily: { ui: ['var(--font-ui)'], japanese: ['var(--font-japanese)'] },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
