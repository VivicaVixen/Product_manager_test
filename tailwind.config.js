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
        embarca: {
          DEFAULT:  '#059669',  // emerald — botones primarios, confirmado
          dark:     '#047857',  // emerald dark — hover, estados active
          light:    '#ECFDF5',  // emerald light — fondos sutiles, badges
          blue:     '#1D4ED8',  // azul real — secundario, tabs activos, info
          'blue-light': '#EFF6FF',
          gold:     '#D97706',  // dorado — alertas COD, badges HITL pendiente
          'gold-light': '#FFFBEB',
          danger:   '#DC2626',  // rojo — discrepancias, alertas críticas
          'danger-light': '#FEF2F2',
          surface:  '#F8FAFC',  // fondo general
          text:     '#111827',  // texto principal
          muted:    '#6B7280',  // texto secundario
          50:       '#ECFDF5',
          500:      '#059669',
          700:      '#047857',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
