import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#20231f',
        paper: '#f7f6f2',
        leaf: '#456b52',
      },
    },
  },
  plugins: [],
};

export default config;
