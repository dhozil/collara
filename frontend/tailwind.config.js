/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F0E0D",
        parchment: "#F2EFE7",
        brass: "#C8A25A",
        sage: "#8AA899",
        oxblood: "#8B2D2B",
        clay: "#D9A441",
        stone: "#2B2B29",
        mist: "#E8E2D6",
      },
      fontFamily: {
        display: ["Instrument Serif", "Cormorant Garamond", "serif"],
        sans: ["Instrument Sans", "Space Grotesk", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
}
