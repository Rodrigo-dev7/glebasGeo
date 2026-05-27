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

const funaiProxy = {
  target: 'https://geoserver.funai.gov.br',
  changeOrigin: true,
  secure: true,
  rewrite: (path) => path.replace(/^\/funai-wms/, '/geoserver/Funai/wms'),
}

const carPublicApiProxy = {
  target: 'https://consulta.car.gov.br',
  changeOrigin: true,
  secure: true,
  rewrite: (path) => path.replace(/^\/car-public-api/, '/api'),
}

const carPublicWfsProxy = {
  target: 'https://consulta.car.gov.br',
  changeOrigin: true,
  secure: true,
  rewrite: (path) => path.replace(/^\/car-public-wfs/, '/geoserver/consulta_publica/ows'),
}

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      '/icmbio-wms': icmbioProxy,
      '/ibge-wms': ibgeProxy,
      '/funai-wms': funaiProxy,
      '/car-public-api': carPublicApiProxy,
      '/car-public-wfs': carPublicWfsProxy,
    },
  },
  preview: {
    proxy: {
      '/icmbio-wms': icmbioProxy,
      '/ibge-wms': ibgeProxy,
      '/funai-wms': funaiProxy,
      '/car-public-api': carPublicApiProxy,
      '/car-public-wfs': carPublicWfsProxy,
    },
  },
})
