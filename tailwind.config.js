/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/**/*.{js,jsx,ts,tsx}",
    "./src/renderer/index.html"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#E3F2FD',
          DEFAULT: '#90CAF9',
          dark: '#1976D2',
          darkest: '#0D47A1',
        },
        background: {
          white: '#FFFFFF',
          gray: '#F5F5F5',
        },
        border: {
          gray: '#E0E0E0',
        },
        text: {
          dark: '#333333',
          medium: '#666666',
          light: '#999999',
        },
        danger: '#EF5350',
      }
    },
  },
  plugins: [],
}