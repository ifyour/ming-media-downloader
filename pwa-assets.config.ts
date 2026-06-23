import { minimalPreset } from '@vite-pwa/assets-generator'

export default {
  preset: minimalPreset,
  images: [
    'public/favicon.svg'
  ],
  outDir: 'public',
  basePath: './public/',
  logLevel: 'info'
}