import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    allowedHosts: ['mbp', 'mbp.tail1592c.ts.net', 'justcal.ai'],
  },
  preview: {
    allowedHosts: ['mbp', 'mbp.tail1592c.ts.net', 'justcal.ai'],
  },
})
