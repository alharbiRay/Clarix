import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Theme colors are full oklch() values in CSS variables (globals.css).
  // color-mix with <alpha-value> lets Tailwind opacity modifiers (bg-primary/90,
  // ring-ring/50) work on them; a bare var() would silently drop those classes.
  theme: {
  	extend: {
  		fontFamily: {
  			// The CSS variables are set by next/font in src/app/layout.tsx.
  			sans: ['var(--font-geist-sans)', 'var(--font-arabic)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  			mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
  		},
  		colors: {
  			background: 'color-mix(in oklch, var(--background) calc(<alpha-value> * 100%), transparent)',
  			foreground: 'color-mix(in oklch, var(--foreground) calc(<alpha-value> * 100%), transparent)',
  			card: {
  				DEFAULT: 'color-mix(in oklch, var(--card) calc(<alpha-value> * 100%), transparent)',
  				foreground: 'color-mix(in oklch, var(--card-foreground) calc(<alpha-value> * 100%), transparent)'
  			},
  			popover: {
  				DEFAULT: 'color-mix(in oklch, var(--popover) calc(<alpha-value> * 100%), transparent)',
  				foreground: 'color-mix(in oklch, var(--popover-foreground) calc(<alpha-value> * 100%), transparent)'
  			},
  			primary: {
  				DEFAULT: 'color-mix(in oklch, var(--primary) calc(<alpha-value> * 100%), transparent)',
  				foreground: 'color-mix(in oklch, var(--primary-foreground) calc(<alpha-value> * 100%), transparent)'
  			},
  			secondary: {
  				DEFAULT: 'color-mix(in oklch, var(--secondary) calc(<alpha-value> * 100%), transparent)',
  				foreground: 'color-mix(in oklch, var(--secondary-foreground) calc(<alpha-value> * 100%), transparent)'
  			},
  			muted: {
  				DEFAULT: 'color-mix(in oklch, var(--muted) calc(<alpha-value> * 100%), transparent)',
  				foreground: 'color-mix(in oklch, var(--muted-foreground) calc(<alpha-value> * 100%), transparent)'
  			},
  			accent: {
  				DEFAULT: 'color-mix(in oklch, var(--accent) calc(<alpha-value> * 100%), transparent)',
  				foreground: 'color-mix(in oklch, var(--accent-foreground) calc(<alpha-value> * 100%), transparent)'
  			},
  			destructive: 'color-mix(in oklch, var(--destructive) calc(<alpha-value> * 100%), transparent)',
  			border: 'color-mix(in oklch, var(--border) calc(<alpha-value> * 100%), transparent)',
  			input: 'color-mix(in oklch, var(--input) calc(<alpha-value> * 100%), transparent)',
  			ring: 'color-mix(in oklch, var(--ring) calc(<alpha-value> * 100%), transparent)',
  			chart: {
  				'1': 'color-mix(in oklch, var(--chart-1) calc(<alpha-value> * 100%), transparent)',
  				'2': 'color-mix(in oklch, var(--chart-2) calc(<alpha-value> * 100%), transparent)',
  				'3': 'color-mix(in oklch, var(--chart-3) calc(<alpha-value> * 100%), transparent)',
  				'4': 'color-mix(in oklch, var(--chart-4) calc(<alpha-value> * 100%), transparent)',
  				'5': 'color-mix(in oklch, var(--chart-5) calc(<alpha-value> * 100%), transparent)'
  			},
  			sidebar: {
  				DEFAULT: 'color-mix(in oklch, var(--sidebar) calc(<alpha-value> * 100%), transparent)',
  				foreground: 'color-mix(in oklch, var(--sidebar-foreground) calc(<alpha-value> * 100%), transparent)',
  				primary: 'color-mix(in oklch, var(--sidebar-primary) calc(<alpha-value> * 100%), transparent)',
  				'primary-foreground': 'color-mix(in oklch, var(--sidebar-primary-foreground) calc(<alpha-value> * 100%), transparent)',
  				accent: 'color-mix(in oklch, var(--sidebar-accent) calc(<alpha-value> * 100%), transparent)',
  				'accent-foreground': 'color-mix(in oklch, var(--sidebar-accent-foreground) calc(<alpha-value> * 100%), transparent)',
  				border: 'color-mix(in oklch, var(--sidebar-border) calc(<alpha-value> * 100%), transparent)',
  				ring: 'color-mix(in oklch, var(--sidebar-ring) calc(<alpha-value> * 100%), transparent)'
  			}
  		},
  		borderRadius: {
  			lg: 'color-mix(in oklch, var(--radius) calc(<alpha-value> * 100%), transparent)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
