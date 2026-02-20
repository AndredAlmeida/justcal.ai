import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    allowedHosts: ['mbp', 'mbp.tail1592c.ts.net'],
  },
  preview: {
    allowedHosts: ['mbp', 'mbp.tail1592c.ts.net'],
  },
})
