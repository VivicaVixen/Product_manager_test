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
          DEFAULT:     '#10b981',   // emerald 500 — más vibrante sobre oscuro
          dark:        '#059669',   // emerald 600 — hover
          light:       'rgba(16, 185, 129, 0.12)',  // emerald tint on dark
          blue:        '#3b82f6',   // blue 500 — más vibrante sobre oscuro
          'blue-light': 'rgba(59, 130, 246, 0.12)',
          gold:        '#f59e0b',   // amber 500 — más vibrante
          'gold-light': 'rgba(245, 158, 11, 0.12)',
          danger:      '#ef4444',   // red 500
          'danger-light': 'rgba(239, 68, 68, 0.12)',
          surface:     '#0f172a',   // slate 900 — fondo principal
          surfaceAlt:  '#1e293b',   // slate 800 — cards, paneles
          surfaceHover:'#334155',   // slate 700 — hover states
          text:        '#e5e7eb',   // gray 200 — texto principal
          heading:     '#f9fafb',   // gray 50 — títulos
          muted:       '#9ca3af',   // gray 400 — texto secundario
          border:      'rgba(255, 255, 255, 0.08)',
          'border-strong': 'rgba(255, 255, 255, 0.15)',
          50:          'rgba(16, 185, 129, 0.08)',
          500:         '#10b981',
          700:         '#059669',
        },
        // Dark mode table row colors
        row: {
          hover: 'rgba(255, 255, 255, 0.04)',
          alt: 'rgba(255, 255, 255, 0.02)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
