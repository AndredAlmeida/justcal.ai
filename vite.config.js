import { existsSync, readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const tlsKeyPath = new URL('./certs/justcal.ai.key', import.meta.url)
const tlsCertPath = new URL('./certs/justcal.ai.crt', import.meta.url)

const httpsConfig =
  existsSync(tlsKeyPath) && existsSync(tlsCertPath)
    ? {
        key: readFileSync(tlsKeyPath),
        cert: readFileSync(tlsCertPath),
      }
    : undefined

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 443,
    strictPort: true,
    https: httpsConfig,
    allowedHosts: [
      'mbp',
      'mbp.tail1592c.ts.net',
      'justcal.ai',
      'www.justcal.ai',
      'justcalendar.ai',
      'www.justcalendar.ai',
    ],
  },
  preview: {
    host: '0.0.0.0',
    port: 443,
    strictPort: true,
    https: httpsConfig,
    allowedHosts: [
      'mbp',
      'mbp.tail1592c.ts.net',
      'justcal.ai',
      'www.justcal.ai',
      'justcalendar.ai',
      'www.justcalendar.ai',
    ],
  },
})
