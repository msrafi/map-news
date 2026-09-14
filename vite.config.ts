import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Set VITE_BASE=/your-repo/ when deploying to GitHub Project Pages.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
  // The dep optimizer breaks maplibre-gl's worker bundle, which blanks the map.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
