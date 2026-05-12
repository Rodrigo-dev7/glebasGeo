import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const icmbioProxy = {
  target: 'https://geoservicos.inde.gov.br',
  changeOrigin: true,
  secure: true,
  rewrite: (path) => path.replace(/^\/icmbio-wms/, '/geoserver/ICMBio/ows'),
}

const ibgeProxy = {
  target: 'https://geoservicos.ibge.gov.br',
  changeOrigin: true,
  secure: true,
  rewrite: (path) => path.replace(/^\/ibge-wms/, '/geoserverIBGE/ows'),
}

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      '/icmbio-wms': icmbioProxy,
      '/ibge-wms': ibgeProxy,
    },
  },
  preview: {
    proxy: {
      '/icmbio-wms': icmbioProxy,
      '/ibge-wms': ibgeProxy,
    },
  },
})
