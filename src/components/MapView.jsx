/**
 * MapView.jsx
 * Mapa interativo com poligonos, vertices e destaque das criticas SICOR.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Pane, Polyline, Popup, TileLayer, WMSTileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import Legend from './Legend'
import { getEditableCoordinates } from '../services/featureGeometryService'
import { calculatePolygonAreaHectares } from '../services/glebaEnrichmentService'

const GlobeView = lazy(() => import('./GlobeView'))

const BRAZIL_CENTER = [-14.235, -51.9253]
const BRAZIL_ZOOM = 4

const BASEMAPS = {
  dark: {
    key: 'dark',
    label: 'Mapa',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
  },
  satellite: {
    key: 'satellite',
    label: 'Satélite',
    labels: {
      key: 'esri-boundaries-places',
      attribution: 'Labels &copy; Esri, Garmin, HERE, OpenStreetMap contributors, and the GIS user community',
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 19,
    },
    sources: [
      {
        key: 'google-satellite',
        attribution: 'Map data &copy; Google',
        url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20,
      },
      {
        key: 'esri-world-imagery',
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 19,
      },
    ],
  },
}

const ICMBIO_WMS_URL = 'https://geoservicos.inde.gov.br/geoserver/ICMBio/ows'
const ICMBIO_WMS_PROXY_URL = '/icmbio-wms'
const MMA_WMS_URL = 'https://geoservicos.inde.gov.br/geoserver/MMA/ows'
const MMA_WMS_PROXY_URL = '/mma-wms'
const IBGE_WMS_URL = 'https://geoservicos.ibge.gov.br/geoserverIBGE/ows'
const IBGE_WMS_PROXY_URL = '/ibge-wms'
const FUNAI_WMS_URL = 'https://geoserver.funai.gov.br/geoserver/Funai/wms'
const FUNAI_WMS_PROXY_URL = '/funai-wms'
const ICMBIO_FEATURE_INFO_EVENT = 'icmbiofeatureinfo'

const ICMBIO_UC_LEGEND = [
  { label: 'Protecao Integral', color: '#b9f34a', borderColor: '#3d5b1c' },
  { label: 'Uso Sustentavel', color: '#efb955', borderColor: '#6a4615' },
]

const MMA_CNUC_LEGEND = [
  { label: 'UC Protecao Integral', color: '#ef4444', borderColor: '#fecaca' },
  { label: 'UC Uso Sustentavel', color: '#f59e0b', borderColor: '#fde68a' },
  { label: 'RPPN / outras reservas', color: '#22c55e', borderColor: '#bbf7d0' },
]

const ICMBIO_AREA_PRIORITY_LEGEND = [
  { label: 'Alta', color: '#facc15', borderColor: '#7a5b00' },
  { label: 'Muito Alta', color: '#f59e0b', borderColor: '#6b3f00' },
  { label: 'Extremamente Alta', color: '#ef4444', borderColor: '#7f1d1d' },
]

const ICMBIO_EMBARGO_LEGEND = [
  { label: 'Area embargada', color: '#1478ff', borderColor: '#62ff3f' },
]

const FUNAI_TI_LEGEND = [
  { label: 'Terra Indigena', color: '#8b5cf6', borderColor: '#d8b4fe' },
]

const ICMBIO_WMS_SOURCE_LAYERS = [
  {
    key: 'uc-federal',
    label: 'UCs Federais',
    layers: 'limiteucsfederais_a',
    title: 'Limites das Unidades de Conservacao Federais - ICMBio (Mar/2026)',
    opacity: 0.72,
    legend: ICMBIO_UC_LEGEND,
  },
  {
    key: 'embargos',
    label: 'Embargos',
    layers: 'embargos_icmbio',
    title: 'Areas embargadas - ICMBio',
    opacity: 0.66,
    legend: ICMBIO_EMBARGO_LEGEND,
  },
  {
    key: 'caatinga',
    label: 'Caatinga',
    layers: 'caatinga_2a_atualizacao',
    title: 'Areas Prioritarias para Conservacao da Biodiversidade - Caatinga',
    opacity: 0.58,
    legend: ICMBIO_AREA_PRIORITY_LEGEND,
  },
  {
    key: 'cerrado-pantanal',
    label: 'Cerrado/Pantanal',
    layers: 'cerrado_pantanal_2a_atualizacao',
    title: 'Areas Prioritarias para Conservacao da Biodiversidade - Cerrado e Pantanal',
    opacity: 0.58,
    legend: ICMBIO_AREA_PRIORITY_LEGEND,
  },
  {
    key: 'mata-atlantica',
    label: 'Mata Atlantica',
    layers: 'mataatlantica_2a_atualiz',
    title: 'Areas Prioritarias para Conservacao da Biodiversidade - Mata Atlantica',
    opacity: 0.58,
    legend: ICMBIO_AREA_PRIORITY_LEGEND,
  },
  {
    key: 'amazonia',
    label: 'Amazonia',
    layers: 'amazonia_2a_atualizacao',
    title: 'Areas Prioritarias para Conservacao da Biodiversidade - Amazonia',
    opacity: 0.58,
    legend: ICMBIO_AREA_PRIORITY_LEGEND,
  },
  {
    key: 'zona-costeira',
    label: 'Zona Costeira',
    layers: 'zcm_2a_atualiz',
    title: 'Areas Prioritarias para Conservacao da Biodiversidade - Zona Costeira e Marinha',
    opacity: 0.58,
    legend: ICMBIO_AREA_PRIORITY_LEGEND,
  },
]

const ICMBIO_NORTHEAST_PRIORITY_LAYER = {
  key: 'prioridades-nordeste',
  label: 'Prioridades NE',
  layers: [
    'caatinga_2a_atualizacao',
    'mataatlantica_2a_atualiz',
    'cerrado_pantanal_2a_atualizacao',
    'amazonia_2a_atualizacao',
    'zcm_2a_atualiz',
  ].join(','),
  title: 'Areas Prioritarias para Conservacao da Biodiversidade - Nordeste',
  opacity: 0.62,
  legend: ICMBIO_AREA_PRIORITY_LEGEND,
}

const IBGE_BIOMES_WMS_LAYER = {
  key: 'biomas',
  label: 'Biomas',
  layers: 'CGMAT:qg_2025_240_bioma',
  title: 'Biomas do Brasil - IBGE (2025)',
  url: IBGE_WMS_URL,
  proxyUrl: IBGE_WMS_PROXY_URL,
  attribution: 'IBGE',
  opacity: 0.52,
  legend: [
    { label: 'Amazonia', color: '#9aff00', borderColor: '#5a8f00' },
    { label: 'Caatinga', color: '#fffdb2', borderColor: '#a89d53' },
    { label: 'Cerrado', color: '#ffbda4', borderColor: '#b86f57' },
    { label: 'Mata Atlantica', color: '#d9ffb7', borderColor: '#7ea65b' },
    { label: 'Pampa', color: '#fff0d6', borderColor: '#b39467' },
    { label: 'Pantanal', color: '#ffd8ff', borderColor: '#b87db8' },
  ],
}

const FUNAI_TERRAS_INDIGENAS_WMS_LAYER = {
  key: 'terras-indigenas',
  label: 'Terras Indigenas',
  layers: 'Funai:tis_poligonais_portarias',
  title: 'Terras Indigenas - FUNAI',
  url: FUNAI_WMS_URL,
  proxyUrl: FUNAI_WMS_PROXY_URL,
  attribution: 'FUNAI',
  opacity: 0.64,
  legend: FUNAI_TI_LEGEND,
}

const MMA_CNUC_WMS_LAYER = {
  key: 'reservas-brasil',
  label: 'Reservas Brasil',
  layers: 'cnuc_2026_03',
  wfsTypeName: 'MMA:cnuc_2026_03_atualizado',
  title: 'Unidades de Conservacao do Brasil - CNUC/MMA (03/2026)',
  url: MMA_WMS_URL,
  proxyUrl: MMA_WMS_PROXY_URL,
  version: '1.1.1',
  crs: L.CRS.EPSG4326,
  crsCode: 'EPSG:4326',
  featureInfoVersion: '1.1.1',
  featureInfoCrs: L.CRS.EPSG4326,
  featureInfoCrsCode: 'EPSG:4326',
  sourceLabel: 'MMA / CNUC',
  attribution: 'MMA / CNUC',
  opacity: 0.62,
  legend: MMA_CNUC_LEGEND,
}

const ICMBIO_WMS_LAYERS = [
  {
    key: 'all',
    label: 'Todas',
    layers: ICMBIO_WMS_SOURCE_LAYERS.map((layer) => layer.layers).join(','),
    title: 'UCs Federais, Embargos e Areas Prioritarias dos biomas brasileiros',
    opacity: 0.7,
    legend: [
      ...ICMBIO_UC_LEGEND,
      ...ICMBIO_EMBARGO_LEGEND,
      ...ICMBIO_AREA_PRIORITY_LEGEND,
    ],
  },
  ICMBIO_NORTHEAST_PRIORITY_LAYER,
  ...ICMBIO_WMS_SOURCE_LAYERS,
  MMA_CNUC_WMS_LAYER,
  IBGE_BIOMES_WMS_LAYER,
  FUNAI_TERRAS_INDIGENAS_WMS_LAYER,
]

const ICMBIO_WMS_LAYER_MAP = new Map(
  ICMBIO_WMS_LAYERS.map((layer) => [layer.key, layer])
)

const ICMBIO_LAYER_CONTROL_GROUPS = [
  {
    title: 'ANALISE',
    items: [
      { layerKey: 'embargos', label: 'Embargos ICMBio', swatch: '#dc2626' },
      { layerKey: 'uc-federal', label: 'Unid. Conservacao', swatch: '#2f6f5e' },
      { layerKey: 'reservas-brasil', label: 'Reservas Brasil', swatch: '#ef4444' },
      { layerKey: 'terras-indigenas', label: 'Terras Ind\u00edgenas', swatch: '#8b5cf6' },
      { layerKey: 'prioridades-nordeste', label: '\u00c1reas Priorit\u00e1rias NE', swatch: '#d99a31' },
      { layerKey: 'biomas', label: 'Bioma', swatch: '#315d86' },
    ],
  },
  {
    title: 'EXIBICAO',
    items: [
      { layerKey: 'caatinga', label: 'Caatinga', swatch: '#facc15' },
      { layerKey: 'cerrado-pantanal', label: 'Cerrado/Pantanal', swatch: '#f59e0b' },
      { layerKey: 'mata-atlantica', label: 'Mata Atlantica', swatch: '#22c55e' },
      { layerKey: 'amazonia', label: 'Amazonia', swatch: '#16a34a' },
      { layerKey: 'zona-costeira', label: 'Zona Costeira', swatch: '#38bdf8' },
    ],
  },
]

const ICMBIO_QUERYABLE_LAYERS = [
  ...ICMBIO_WMS_SOURCE_LAYERS,
  MMA_CNUC_WMS_LAYER,
  IBGE_BIOMES_WMS_LAYER,
  FUNAI_TERRAS_INDIGENAS_WMS_LAYER,
]

const ICMBIO_WMS_SOURCE_LAYER_MAP = new Map(
  ICMBIO_QUERYABLE_LAYERS.flatMap((layer) => [
    [layer.layers, layer],
    [normalizeIcmbioLayerName(layer.layers), layer],
  ])
)

const ICMBIO_FEATURE_INFO_FIELD_LIMIT = 12
const ICMBIO_FEATURE_INFO_FEATURE_LIMIT = 6
const ICMBIO_FEATURE_INFO_SKIP_KEYS = new Set([
  'boundedby',
  'bbox',
  'geometry',
  'geom',
  'the_geom',
  'shape',
  'ogc_fid',
])

const ICMBIO_FEATURE_FIELD_LABELS = {
  acao1: 'Acao 1',
  acao2: 'Acao 2',
  acao3: 'Acao 3',
  acao4: 'Acao 4',
  acao_2: 'Acao 2',
  acao_3: 'Acao 3',
  acao_prin: 'Acao principal',
  acao_princ: 'Acao principal',
  acaoprinc: 'Acao principal',
  acaopriori: 'Acao prioritaria',
  acprinc: 'Acao principal',
  acprincnom: 'Acao principal',
  ac2: 'Acao 2',
  ac3: 'Acao 3',
  ano: 'Ano',
  area: 'Area',
  area_ha: 'Area (ha)',
  areahaalb: 'Area (ha)',
  area_oficial: 'Area oficial',
  artigo_1: 'Artigo 1',
  artigo_2: 'Artigo 2',
  autuado: 'Autuado',
  cod_ti: 'Codigo TI',
  biomas: 'Biomas',
  cnuc: 'CNUC',
  cd_bioma: 'Codigo do bioma',
  cd_recorte: 'Codigo do recorte',
  cod_area: 'Codigo',
  criacaoano: 'Ano de criacao',
  criacaoato: 'Ato de criacao',
  data: 'Data',
  data_portaria: 'Data da portaria',
  demarcacao: 'Demarcacao',
  etnia_nome: 'Povo',
  fase_ti: 'Fase',
  esferaadm: 'Esfera',
  estados: 'Estados',
  gregional: 'Regional',
  grupouc: 'Grupo',
  id_ap: 'Codigo',
  import_bio: 'Importancia biologica',
  importbio_: 'Importancia biologica',
  imp: 'Importancia biologica',
  municipio: 'Municipio',
  n: 'Numero',
  n2: 'Codigo MMA',
  n3: 'Codigo auxiliar',
  n4: 'Codigo cartografico',
  n5: 'Codigo CNUC',
  n6: 'Unidade de Conservacao',
  n7: 'Data de criacao',
  n8: 'Ato de criacao',
  n10: 'Identificador',
  n13: 'Base geografica',
  n15: 'Area informada (ha)',
  n17: 'Esfera',
  n18: 'UF',
  n19: 'Municipio',
  n20: 'Orgao gestor',
  n21: 'Grupo',
  n22: 'Categoria',
  n23: 'Categoria IUCN',
  n26: 'Area calculada (ha)',
  n31: 'Status',
  n32: 'Tipo de limite',
  nome: 'Nome',
  nome_ti: 'Terra Indigena',
  nm_bioma: 'Bioma',
  nomeacao: 'Acao recomendada',
  nome_ap: 'Nome da area',
  nome_area: 'Nome da area',
  nome_uc: 'UC',
  nomeuc: 'Unidade de Conservacao',
  numero_ai: 'Auto de infracao',
  numero_emb: 'Embargo',
  obs: 'Observacao',
  origem: 'Origem',
  portaria: 'Portaria',
  prior_acao: 'Prioridade de acao',
  prioridade: 'Prioridade de acao',
  prio: 'Prioridade de acao',
  serie: 'Serie',
  siglacateg: 'Categoria',
  superficie: 'Superficie',
  tipo_infra: 'Tipo da infracao',
  terra_indigena: 'Terra Indigena',
  uf: 'UF',
  ufabrang: 'UF',
  quadro: 'Quadro',
}

const ICMBIO_LAYER_FIELD_PRIORITY = {
  limiteucsfederais_a: [
    'nomeuc',
    'cnuc',
    'siglacateg',
    'grupouc',
    'ufabrang',
    'biomas',
    'criacaoano',
    'criacaoato',
    'areahaalb',
    'demarcacao',
  ],
  cnuc_2026_03: [
    'n6',
    'n10',
    'n22',
    'n21',
    'n17',
    'n18',
    'n19',
    'n20',
    'n7',
    'n8',
    'n26',
    'n31',
  ],
  cnuc_2026_03_atualizado: [
    'n6',
    'n10',
    'n22',
    'n21',
    'n17',
    'n18',
    'n19',
    'n20',
    'n7',
    'n8',
    'n26',
    'n31',
  ],
  embargos_icmbio: [
    'numero_emb',
    'numero_ai',
    'autuado',
    'tipo_infra',
    'nome_uc',
    'cnuc',
    'municipio',
    'uf',
    'data',
    'ano',
    'area',
  ],
  amazonia_2a_atualizacao: [
    'nome_area',
    'cod_area',
    'import_bio',
    'prior_acao',
    'area_ha',
    'acao_prin',
    'acao_2',
    'acao_3',
  ],
  caatinga_2a_atualizacao: [
    'nome_area',
    'cod_area',
    'import_bio',
    'prior_acao',
    'acao_princ',
    'area_ha',
  ],
  cerrado_pantanal_2a_atualizacao: [
    'nome',
    'cod_area',
    'import_bio',
    'prior_acao',
    'area_ha',
    'estados',
    'acao1',
    'acao2',
    'acao3',
    'acao4',
  ],
  mataatlantica_2a_atualiz: [
    'cod_area',
    'importbio_',
    'prioridade',
    'acaopriori',
    'nomeacao',
  ],
  zcm_2a_atualiz: [
    'nome_ap',
    'id_ap',
    'imp',
    'prio',
    'acaoprinc',
    'acao2',
    'acao3',
    'n',
  ],
  qg_2025_240_bioma: [
    'nm_bioma',
    'cd_bioma',
    'cd_recorte',
    'quadro',
  ],
}

function MapInvalidateOnLayout({ revision }) {
  const map = useMap()
  useEffect(() => {
    const invalidateWithoutPan = () => {
      map.invalidateSize({
        animate: false,
        pan: false,
        debounceMoveend: true,
      })
    }

    const timeouts = [280, 560].map((delay) =>
      setTimeout(invalidateWithoutPan, delay)
    )
    return () => {
      timeouts.forEach(clearTimeout)
    }
  }, [revision, map])
  return null
}

function MapInvalidateOnContainerResize() {
  const map = useMap()
  const frameRef = useRef(null)

  useEffect(() => {
    const container = map.getContainer()
    if (!container || typeof ResizeObserver !== 'function') return undefined

    const invalidateWithoutPan = () => {
      frameRef.current = null

      map.invalidateSize({
        animate: false,
        pan: false,
        debounceMoveend: true,
      })
    }

    const observer = new ResizeObserver(() => {
      if (frameRef.current !== null) return
      frameRef.current = window.requestAnimationFrame(invalidateWithoutPan)
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [map])

  return null
}

function MapZoomTracker({ onZoomChange }) {
  const map = useMap()

  useEffect(() => {
    const syncZoom = () => onZoomChange?.(map.getZoom())

    syncZoom()
    map.on('zoomend', syncZoom)
    return () => map.off('zoomend', syncZoom)
  }, [map, onZoomChange])

  return null
}

function IcmbioFeatureInfoHandler({ activeLayer }) {
  const map = useMap()
  const requestRef = useRef({
    abortController: null,
    id: 0,
    popup: null,
  })

  useEffect(() => {
    if (!activeLayer) return undefined

    const handleFeatureInfoRequest = async (event) => {
      const latlng = event?.latlng
      if (!latlng) return

      requestRef.current.id += 1
      const requestId = requestRef.current.id

      if (requestRef.current.abortController) {
        requestRef.current.abortController.abort()
      }

      const abortController = new AbortController()
      requestRef.current.abortController = abortController

      if (requestRef.current.popup) {
        requestRef.current.popup.remove()
        requestRef.current.popup = null
      }

      const popup = L.popup(ICMBIO_FEATURE_INFO_POPUP_OPTIONS)
        .setLatLng(latlng)
        .setContent(icmbioFeatureInfoLoadingMarkup(activeLayer))
        .openOn(map)

      requestRef.current.popup = popup

      try {
        const sourceLabel = getFeatureInfoSourceLabel(activeLayer)
        const response = await fetch(
          buildIcmbioFeatureInfoUrl(map, latlng, activeLayer),
          {
            credentials: 'omit',
            signal: abortController.signal,
          }
        )

        if (!response.ok) {
          throw new Error(`Consulta ${sourceLabel} retornou HTTP ${response.status}`)
        }

        const contentType = response.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
          throw new Error(`${sourceLabel} nao retornou JSON para este ponto.`)
        }

        const featureCollection = await response.json()
        if (requestRef.current.id !== requestId) return

        popup.setContent(icmbioFeatureInfoPopupMarkup(activeLayer, featureCollection))
        popup.update()
      } catch (error) {
        if (error?.name === 'AbortError' || requestRef.current.id !== requestId) {
          return
        }

        popup.setContent(icmbioFeatureInfoErrorMarkup(activeLayer, error?.message))
        popup.update()
      }
    }

    map.on('click', handleFeatureInfoRequest)
    map.on(ICMBIO_FEATURE_INFO_EVENT, handleFeatureInfoRequest)

    return () => {
      map.off('click', handleFeatureInfoRequest)
      map.off(ICMBIO_FEATURE_INFO_EVENT, handleFeatureInfoRequest)
      if (requestRef.current.abortController) {
        requestRef.current.abortController.abort()
        requestRef.current.abortController = null
      }
      if (requestRef.current.popup) {
        requestRef.current.popup.remove()
        requestRef.current.popup = null
      }
    }
  }, [activeLayer, map])

  return null
}

export const STATUS_STYLES = {
  valida: {
    fillColor: '#22c55e',
    color: '#16a34a',
    fillOpacity: 0.28,
    weight: 2.5,
  },
  invalida: {
    fillColor: '#ef4444',
    color: '#dc2626',
    fillOpacity: 0.32,
    weight: 2.8,
  },
  pendente: {
    fillColor: '#f59e0b',
    color: '#d97706',
    fillOpacity: 0.3,
    weight: 2.5,
  },
}

const SELECTED_OVERRIDES = {
  fillOpacity: 0.58,
  weight: 4,
}

const MATCHED_OVERRIDES = {
  color: '#38bdf8',
  fillColor: '#38bdf8',
  fillOpacity: 0.38,
  weight: 4.5,
}

const GLEBA_INSIDE_REFERENCE_STYLE = {
  color: '#facc15',
  fillColor: '#facc15',
  fillOpacity: 0.42,
  weight: 4.4,
  dashArray: '5 4',
}

const GLEBA_PARTIAL_REFERENCE_STYLE = {
  color: '#fb923c',
  fillColor: '#f59e0b',
  fillOpacity: 0.34,
  weight: 3.8,
  dashArray: '10 5',
}

const CAR_REFERENCE_STYLE = {
  color: '#c084fc',
  fillColor: '#a855f7',
  fillOpacity: 0.08,
  opacity: 0.95,
  weight: 2.2,
  dashArray: '10 6',
}

const CAR_REFERENCE_MATCHED_STYLE = {
  color: '#f59e0b',
  fillColor: '#f59e0b',
  fillOpacity: 0.2,
  opacity: 1,
  weight: 3,
  dashArray: '8 4',
}

const CAR_REFERENCE_SELECTED_STYLE = {
  color: '#f8fafc',
  fillColor: '#38bdf8',
  fillOpacity: 0.22,
  opacity: 1,
  weight: 3,
  dashArray: null,
}

const PUBLIC_CAR_STATUS_STYLES = {
  active: {
    color: '#38bdf8',
    fillColor: '#22c55e',
  },
  pending: {
    color: '#facc15',
    fillColor: '#f59e0b',
  },
  invalid: {
    color: '#f87171',
    fillColor: '#ef4444',
  },
  unknown: {
    color: '#cbd5e1',
    fillColor: '#64748b',
  },
}

const ENVIRONMENTAL_RESTRICTION_STYLE = {
  color: '#fecaca',
  fillColor: '#ef4444',
}

const CAR_REFERENCE_ACTIVE_DATASET_STYLE = {
  fillOpacity: 0.18,
  opacity: 1,
  weight: 3.4,
}

const CAR_REFERENCE_CONTAINED_STYLE = {
  color: '#facc15',
  fillColor: '#fde047',
  fillOpacity: 0.3,
  opacity: 1,
  weight: 3.4,
  dashArray: '3 5',
}

const CAR_REFERENCE_CONTAINER_STYLE = {
  fillOpacity: 0.06,
  opacity: 0.9,
  weight: 2.6,
  dashArray: '12 6',
}

const CAR_REFERENCE_DIMMED_STYLE = {
  color: '#8b5cf6',
  fillColor: '#a855f7',
  fillOpacity: 0.16,
  opacity: 0.9,
  weight: 2.8,
  dashArray: '8 8',
}

const CAR_REFERENCE_DATASET_STYLES = [
  { color: '#c084fc', fillColor: '#a855f7', dashArray: '10 6', dashOffset: '0' },
  { color: '#38bdf8', fillColor: '#06b6d4', dashArray: '2 6', dashOffset: '2' },
  { color: '#f472b6', fillColor: '#ec4899', dashArray: '12 5 3 5', dashOffset: '4' },
  { color: '#fbbf24', fillColor: '#f59e0b', dashArray: '6 6', dashOffset: '3' },
  { color: '#34d399', fillColor: '#22c55e', dashArray: '14 6', dashOffset: '6' },
]

const HIDDEN_STYLE = {
  color: 'transparent',
  fillColor: 'transparent',
  opacity: 0,
  fillOpacity: 0,
  weight: 0.1,
}

const DEFAULT_FLY_OPTIONS = {
  animate: true,
  duration: 1.6,
  easeLinearity: 0.18,
}

const FLY_BOUNDS_OPTIONS = {
  ...DEFAULT_FLY_OPTIONS,
  padding: [50, 50],
}

const FLY_FEATURE_BOUNDS_OPTIONS = {
  ...DEFAULT_FLY_OPTIONS,
  padding: [60, 60],
  maxZoom: 17,
}

const PERSISTENT_POPUP_OPTIONS = {
  className: 'custom-popup',
  maxWidth: 280,
  autoClose: false,
  closeOnClick: false,
}

const CAR_REFERENCE_POPUP_OPTIONS = {
  ...PERSISTENT_POPUP_OPTIONS,
  autoPan: false,
}

const CAR_SELECTION_POPUP_OPTIONS = {
  className: 'custom-popup car-selector-popup-shell',
  maxWidth: 360,
  autoClose: true,
  closeOnClick: true,
  autoPan: false,
}

const ICMBIO_FEATURE_INFO_POPUP_OPTIONS = {
  className: 'custom-popup icmbio-feature-popup-shell',
  maxWidth: 380,
  autoClose: false,
  closeOnClick: false,
  autoPan: true,
}
const CAR_REFERENCE_RENDER_CHUNK_SIZE = 200
const GLOBE_CAR_FEATURE_LIMIT = 1200

// Small threshold to keep a simple click from entering the heavier drag path.
const DRAG_START_THRESHOLD_PX = 3
const COORDINATE_MATCH_TOLERANCE = 1e-10

function animateToBounds(map, bounds, options = {}) {
  if (!bounds?.isValid()) return
  map.flyToBounds(bounds, { ...FLY_BOUNDS_OPTIONS, ...options })
}

function animateToPoint(map, point, zoom = null, options = {}) {
  if (!point) return

  const targetZoom = Number.isFinite(zoom) ? zoom : map.getZoom()
  map.flyTo([point.lat, point.lon], targetZoom, {
    ...DEFAULT_FLY_OPTIONS,
    ...options,
  })
}

function getVisibleCoordinateIndexes({
  coordinates = [],
  coordinateStatuses = [],
  pointDisplayMode = 'marked',
}) {
  if (!coordinates.length) return []

  if (pointDisplayMode === 'none') {
    return []
  }

  if (pointDisplayMode !== 'validated') {
    return coordinates.map((_, index) => index)
  }

  if (coordinates.length === 1) {
    return [0]
  }

  const visibleIndexes = new Set([0, coordinates.length - 1])

  coordinateStatuses.forEach((coordinate, index) => {
    if (coordinate?.isValid === false) {
      visibleIndexes.add(index)
    }
  })

  return [...visibleIndexes].sort((left, right) => left - right)
}

function coordinateHasOverlapIssue(coordinate) {
  return coordinate?.issues?.some((issue) => issue.code === 'GEOMETRIA_SOBREPOSTA')
}

function coordinatesMatch(left, right, tolerance = COORDINATE_MATCH_TOLERANCE) {
  if (!left || !right) return false

  return (
    Math.abs(Number(left[0]) - Number(right[0])) <= tolerance &&
    Math.abs(Number(left[1]) - Number(right[1])) <= tolerance
  )
}

function ensureClosedCoordinateRing(coordinates = []) {
  if (coordinates.length < 2) return coordinates

  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]

  return coordinatesMatch(first, last)
    ? coordinates
    : [...coordinates, first]
}

function resolveEditableVertexIndex(feature, displayIndex) {
  const editableCoordinates = getEditableCoordinates(feature)

  if (!editableCoordinates.length || !Number.isInteger(displayIndex) || displayIndex < 0) {
    return null
  }

  if (displayIndex < editableCoordinates.length) {
    return displayIndex
  }

  return null
}

function buildActiveVertexReference(featureId, displayIndex, vertexIndex) {
  return {
    featureId: featureId || null,
    displayIndex: Number.isInteger(displayIndex) ? displayIndex : null,
    vertexIndex: Number.isInteger(vertexIndex) ? vertexIndex : null,
  }
}

function sortMarkerDescriptors(markerDescriptors, activeDisplayIndex = null) {
  if (!Number.isInteger(activeDisplayIndex)) {
    return markerDescriptors
  }

  // When two logical points share the same coordinate, keep the active one on top.
  return [...markerDescriptors].sort((left, right) => {
    const leftPriority = left.displayIndex === activeDisplayIndex ? 1 : 0
    const rightPriority = right.displayIndex === activeDisplayIndex ? 1 : 0

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }

    return left.displayIndex - right.displayIndex
  })
}

function getCoincidentMarkerDescriptors(markerDescriptors = [], targetDescriptor = null) {
  if (!targetDescriptor) return []

  return markerDescriptors.filter((candidate) => (
    coordinatesMatch(
      [candidate?.lon, candidate?.lat],
      [targetDescriptor?.lon, targetDescriptor?.lat]
    )
  ))
}

function getNextCoincidentMarkerDescriptor(markerDescriptors = [], currentDescriptor = null) {
  const coincidentDescriptors = getCoincidentMarkerDescriptors(markerDescriptors, currentDescriptor)

  if (coincidentDescriptors.length < 2 || !currentDescriptor) {
    return null
  }

  const currentIndex = coincidentDescriptors.findIndex((descriptor) => (
    descriptor.displayIndex === currentDescriptor.displayIndex
  ))

  if (currentIndex < 0) {
    return coincidentDescriptors[0] || null
  }

  return coincidentDescriptors[(currentIndex + 1) % coincidentDescriptors.length] || null
}

function resolveClosingDisplayIndex(feature, displayIndex) {
  const coordinateStatuses = feature?.properties?.coordinateStatuses || []

  if (coordinateStatuses.length < 2 || !Number.isInteger(displayIndex)) {
    return null
  }

  const firstCoordinate = coordinateStatuses[0]
  const lastDisplayIndex = coordinateStatuses.length - 1
  const lastCoordinate = coordinateStatuses[lastDisplayIndex]

  if (
    !lastCoordinate?.isLast ||
    !lastCoordinate?.isRepeatedStart ||
    !coordinatesMatch(
      [firstCoordinate?.lon, firstCoordinate?.lat],
      [lastCoordinate?.lon, lastCoordinate?.lat]
    )
  ) {
    return null
  }

  if (displayIndex === 0) return lastDisplayIndex
  if (displayIndex === lastDisplayIndex) return 0

  return null
}

function resolveCoordinateRole(feature, displayIndex, coordinate = null) {
  const coordinateStatuses = feature?.properties?.coordinateStatuses || []

  if (!Number.isInteger(displayIndex) || coordinateStatuses.length < 2) {
    return 'default'
  }

  const firstCoordinate = coordinateStatuses[0]
  const lastDisplayIndex = coordinateStatuses.length - 1
  const lastCoordinate = coordinateStatuses[lastDisplayIndex]
  const targetCoordinate = coordinate || coordinateStatuses[displayIndex] || null

  if (
    !lastCoordinate?.isLast ||
    !lastCoordinate?.isRepeatedStart ||
    !coordinatesMatch(
      [firstCoordinate?.lon, firstCoordinate?.lat],
      [lastCoordinate?.lon, lastCoordinate?.lat]
    )
  ) {
    return 'default'
  }

  if (displayIndex === 0) {
    return 'start'
  }

  if (displayIndex === lastDisplayIndex && targetCoordinate?.isRepeatedStart) {
    return 'closing'
  }

  return 'default'
}

function describeCoordinateRole(feature, coordinate, displayIndex) {
  const role = resolveCoordinateRole(feature, displayIndex, coordinate)

  if (role === 'start') {
    return 'Ponto inicial do poligono'
  }

  if (role === 'closing') {
    return 'Ponto de fechamento do poligono'
  }

  return null
}

function buildMarkerClassName(baseClassName, role = 'default', isActive = false, extraClasses = []) {
  const classNames = [baseClassName]

  if (role !== 'default') {
    classNames.push(`${baseClassName}--${role}`)
  }

  if (isActive) {
    classNames.push('is-active')
  }

  return [...classNames, ...extraClasses].join(' ')
}

function getVertexMarkerStyle(coordinate, isActive = false, role = 'default') {
  const hasOverlap = coordinateHasOverlapIssue(coordinate)

  if (role === 'closing') {
    return {
      radius: isActive
        ? (hasOverlap ? 13 : 11)
        : (hasOverlap ? 11 : 9),
      pathOptions: {
        color: hasOverlap ? '#fdba74' : coordinate?.isValid === false ? '#fda4af' : '#93c5fd',
        weight: isActive ? 3.6 : 3,
        fillColor: hasOverlap ? '#f97316' : coordinate?.isValid === false ? '#ef4444' : '#38bdf8',
        fillOpacity: 0.08,
        dashArray: hasOverlap ? '6 4' : '4 3',
      },
    }
  }

  const accentColor = role === 'start'
    ? '#e0f2fe'
    : hasOverlap
      ? '#fdba74'
      : coordinate?.isValid === false
        ? '#fecaca'
        : '#bbf7d0'
  const accentFill = role === 'start'
    ? '#34d399'
    : hasOverlap
      ? '#f97316'
      : coordinate?.isValid === false
        ? '#ef4444'
        : '#22c55e'

  return {
    radius: isActive
      ? (hasOverlap ? 11 : 8)
      : (hasOverlap ? 9 : 6),
    pathOptions: {
      color: accentColor,
      weight: role === 'start'
        ? (hasOverlap ? 3.2 : 2.4)
        : (hasOverlap ? 3 : 2),
      fillColor: accentFill,
      fillOpacity: 1,
    },
  }
}

function getEditableVertexPathOptions(coordinate, isActive = false, role = 'default') {
  const markerStyle = getVertexMarkerStyle(coordinate, isActive, role)

  return {
    radius: markerStyle.radius + (isActive ? 1 : 1.5),
    pathOptions: {
      ...markerStyle.pathOptions,
      className: buildMarkerClassName('gleba-edit-handle', role, isActive),
    },
  }
}

function getCompanionVertexPathOptions(coordinate) {
  const markerStyle = getVertexMarkerStyle(coordinate, false)

  return {
    radius: markerStyle.radius + 3.5,
    pathOptions: {
      ...markerStyle.pathOptions,
      weight: Math.max(markerStyle.pathOptions.weight, 2),
      fillOpacity: 0.2,
      className: buildMarkerClassName('gleba-edit-handle', 'default', false, ['is-companion']),
    },
  }
}

function escapeHtml(value) {
  return String(value ?? '-')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isLocalhostRuntime() {
  if (typeof window === 'undefined') return false
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
}

function getIcmbioFeatureInfoBaseUrl(activeLayer) {
  if (isLocalhostRuntime()) {
    return activeLayer?.proxyUrl || ICMBIO_WMS_PROXY_URL
  }

  return activeLayer?.url || ICMBIO_WMS_URL
}

function getFeatureInfoSourceLabel(activeLayer) {
  return activeLayer?.sourceLabel || activeLayer?.attribution || 'ICMBio'
}

function buildIcmbioFeatureInfoUrl(map, latlng, activeLayer) {
  const size = map.getSize()
  const clickPoint = map.latLngToContainerPoint(latlng).round()
  const bounds = map.getBounds()
  const version = activeLayer?.featureInfoVersion || activeLayer?.version || '1.3.0'
  const crs = activeLayer?.featureInfoCrs || activeLayer?.crs || map.options.crs || L.CRS.EPSG3857
  const crsCode =
    activeLayer?.featureInfoCrsCode ||
    activeLayer?.crsCode ||
    (crs === L.CRS.EPSG4326 ? 'EPSG:4326' : 'EPSG:3857')
  const bbox = crs === L.CRS.EPSG4326
    ? [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')
    : (() => {
        const southWest = crs.project(bounds.getSouthWest())
        const northEast = crs.project(bounds.getNorthEast())
        return [southWest.x, southWest.y, northEast.x, northEast.y].join(',')
      })()
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: version,
    REQUEST: 'GetFeatureInfo',
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    LAYERS: activeLayer.layers,
    QUERY_LAYERS: activeLayer.layers,
    STYLES: activeLayer.styles || '',
    INFO_FORMAT: 'application/json',
    FEATURE_COUNT: String(ICMBIO_FEATURE_INFO_FEATURE_LIMIT),
    BBOX: bbox,
    WIDTH: String(Math.round(size.x)),
    HEIGHT: String(Math.round(size.y)),
  })

  if (version === '1.3.0') {
    params.set('CRS', crsCode)
    params.set('I', String(clickPoint.x))
    params.set('J', String(clickPoint.y))
  } else {
    params.set('SRS', crsCode)
    params.set('X', String(clickPoint.x))
    params.set('Y', String(clickPoint.y))
  }

  return `${getIcmbioFeatureInfoBaseUrl(activeLayer)}?${params.toString()}`
}

function normalizeIcmbioLayerName(value) {
  return String(value || '').split(':').pop()
}

function getIcmbioFeatureLayerName(feature, activeLayer) {
  const featureIdLayer = String(feature?.id || '').split('.')[0]
  const normalizedFeatureIdLayer = normalizeIcmbioLayerName(featureIdLayer)

  if (ICMBIO_WMS_SOURCE_LAYER_MAP.has(normalizedFeatureIdLayer)) {
    return normalizedFeatureIdLayer
  }

  const [firstLayer] = String(activeLayer?.layers || '').split(',')
  return normalizeIcmbioLayerName(firstLayer)
}

function getIcmbioFeatureLayer(feature, activeLayer) {
  const layerName = getIcmbioFeatureLayerName(feature, activeLayer)
  return ICMBIO_WMS_SOURCE_LAYER_MAP.get(layerName) || activeLayer
}

function hasIcmbioDisplayValue(value) {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return String(value).trim() !== ''
}

function formatIcmbioFeatureValue(value) {
  if (!hasIcmbioDisplayValue(value)) return '-'

  if (Array.isArray(value)) {
    return value.map(formatIcmbioFeatureValue).join(', ')
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  const text = String(value).trim()
  const dateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dateMatch) {
    return `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}`
  }

  return text
}

function getIcmbioFieldLabel(key) {
  if (ICMBIO_FEATURE_FIELD_LABELS[key]) {
    return ICMBIO_FEATURE_FIELD_LABELS[key]
  }

  return String(key)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getIcmbioFeatureDisplayFields(feature, activeLayer) {
  const properties = feature?.properties || {}
  const layerName = getIcmbioFeatureLayerName(feature, activeLayer)
  const priorityFields = ICMBIO_LAYER_FIELD_PRIORITY[layerName] || []
  const fieldKeys = [...priorityFields, ...Object.keys(properties)]
  const seenKeys = new Set()
  const fields = []

  fieldKeys.forEach((key) => {
    const normalizedKey = normalizePropertyKey(key)
    if (seenKeys.has(key) || ICMBIO_FEATURE_INFO_SKIP_KEYS.has(normalizedKey)) return
    seenKeys.add(key)

    const value = properties[key]
    if (!hasIcmbioDisplayValue(value)) return

    fields.push({
      key,
      label: getIcmbioFieldLabel(key),
      value: formatIcmbioFeatureValue(value),
    })
  })

  return fields.slice(0, ICMBIO_FEATURE_INFO_FIELD_LIMIT)
}

function getIcmbioFeatureTitle(feature, activeLayer) {
  const properties = feature?.properties || {}
  return (
    properties.nomeuc ||
    properties.nome_uc ||
    properties.n6 ||
    properties.nm_bioma ||
    properties.nome_area ||
    properties.nome_ap ||
    properties.nome ||
    properties.cod_area ||
    properties.id_ap ||
    properties.numero_emb ||
    properties.numero_ai ||
    getIcmbioFeatureLayer(feature, activeLayer)?.label ||
    'Registro ICMBio'
  )
}

function icmbioFeatureInfoLoadingMarkup(activeLayer) {
  const sourceLabel = getFeatureInfoSourceLabel(activeLayer)

  return `
    <div class="icmbio-feature-popup">
      <div class="icmbio-feature-popup__top">
        <span class="icmbio-feature-popup__eyebrow">${escapeHtml(sourceLabel)}</span>
        <strong>${escapeHtml(activeLayer?.label || 'Camada')}</strong>
      </div>
      <div class="icmbio-feature-popup__body">
        <div class="icmbio-feature-popup__empty">Consultando dados no ponto clicado...</div>
      </div>
    </div>
  `
}

function icmbioFeatureInfoErrorMarkup(activeLayer, message) {
  const sourceLabel = getFeatureInfoSourceLabel(activeLayer)

  return `
    <div class="icmbio-feature-popup">
      <div class="icmbio-feature-popup__top">
        <span class="icmbio-feature-popup__eyebrow">${escapeHtml(sourceLabel)}</span>
        <strong>${escapeHtml(activeLayer?.label || 'Camada')}</strong>
      </div>
      <div class="icmbio-feature-popup__body">
        <div class="icmbio-feature-popup__empty icmbio-feature-popup__empty--error">
          ${escapeHtml(message || 'Nao foi possivel consultar os dados desta camada.')}
        </div>
      </div>
    </div>
  `
}

function icmbioFeatureInfoPopupMarkup(activeLayer, featureCollection) {
  const features = Array.isArray(featureCollection?.features)
    ? featureCollection.features
    : []
  const sourceLabel = getFeatureInfoSourceLabel(activeLayer)

  if (!features.length) {
    return `
      <div class="icmbio-feature-popup">
        <div class="icmbio-feature-popup__top">
          <span class="icmbio-feature-popup__eyebrow">${escapeHtml(sourceLabel)}</span>
          <strong>${escapeHtml(activeLayer?.label || 'Camada')}</strong>
        </div>
        <div class="icmbio-feature-popup__body">
          <div class="icmbio-feature-popup__empty">Nenhum registro encontrado neste ponto.</div>
        </div>
      </div>
    `
  }

  const featureCards = features.slice(0, ICMBIO_FEATURE_INFO_FEATURE_LIMIT).map((feature) => {
    const sourceLayer = getIcmbioFeatureLayer(feature, activeLayer)
    const fields = getIcmbioFeatureDisplayFields(feature, activeLayer)
    const rows = fields.length
      ? fields.map((field) => `
          <div class="icmbio-feature-popup__row">
            <span>${escapeHtml(field.label)}</span>
            <strong>${escapeHtml(field.value)}</strong>
          </div>
        `).join('')
      : '<div class="icmbio-feature-popup__empty">Registro sem atributos publicados.</div>'

    return `
      <section class="icmbio-feature-popup__card">
        <div class="icmbio-feature-popup__card-head">
          <span>${escapeHtml(sourceLayer?.label || 'ICMBio')}</span>
          <strong>${escapeHtml(getIcmbioFeatureTitle(feature, activeLayer))}</strong>
        </div>
        <div class="icmbio-feature-popup__rows">
          ${rows}
        </div>
      </section>
    `
  }).join('')

  return `
    <div class="icmbio-feature-popup">
      <div class="icmbio-feature-popup__top">
        <span class="icmbio-feature-popup__eyebrow">${escapeHtml(sourceLabel)}</span>
        <strong>${escapeHtml(features.length === 1 ? '1 registro encontrado' : `${features.length} registros encontrados`)}</strong>
      </div>
      <div class="icmbio-feature-popup__body">
        ${featureCards}
      </div>
    </div>
  `
}

function formatArea(area) {
  return typeof area === 'number' ? `${area} ha` : '-'
}

function formatEnvironmentalArea(area) {
  const parsed = Number(String(area ?? '').replace(',', '.'))
  if (!Number.isFinite(parsed)) return '-'

  return `${parsed.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha`
}

function formatRelationList(relations = []) {
  return relations
    .map((relation) => relation.datasetName || relation.featureName || null)
    .filter(Boolean)
    .join(' | ')
}

function formatEnvironmentalValidationStatus(validation) {
  if (validation?.status === 'overlap') return 'Sobreposicao com UC'
  if (validation?.status === 'clear') return 'Sem sobreposicao com UC'
  if (validation) return 'UC nao validada'

  return null
}

const CAR_NUMBER_PROPERTY_ALIASES = [
  'numero_car_imovel',
  'numero_car_recibo',
  'n_do_car',
  'n_do_recibo',
  'n_recibo',
  'numero_do_car',
  'numero_car',
  'numero_recibo',
  'num_car',
  'num_recibo',
  'nr_car',
  'nr_recibo',
  'nu_car',
  'nu_recibo',
  'recibo',
  'recibo_car',
  'car',
  'cod_car',
  'cod_imovel',
  'codigo_imovel',
  'codigo_car',
  'codigo_sicar',
  'cod_sicar',
  'id_imovel',
  'id_car',
]
const CAR_NUMBER_PATTERN = /\b[A-Z]{2}-\d{7}-[A-Z0-9]{8,}\b/i
const CAR_NUMBER_KEY_HINTS = ['car', 'recibo', 'imovel', 'sicar']

function normalizePropertyKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizePropertyText(value) {
  const text = String(value ?? '').trim()
  if (!text || text === '-') return null

  return text
}

function findPropertyByAliases(properties = {}, aliases = []) {
  const entries = Object.entries(properties).map(([key, value]) => [
    normalizePropertyKey(key),
    value,
  ])

  for (const alias of aliases) {
    const normalizedAlias = normalizePropertyKey(alias)
    const found = entries.find(([key, value]) =>
      key === normalizedAlias &&
      value !== null &&
      value !== undefined &&
      value !== ''
    )

    if (found) return normalizePropertyText(found[1])
  }

  return null
}

function extractCarNumberFromText(value) {
  const text = normalizePropertyText(value)
  if (!text) return null

  const [match] = text.match(CAR_NUMBER_PATTERN) || []
  return match ? match.toUpperCase() : null
}

function findCarNumberInProperties(properties = {}) {
  const aliasMatch = findPropertyByAliases(properties, CAR_NUMBER_PROPERTY_ALIASES)
  if (aliasMatch) return aliasMatch

  const entries = Object.entries(properties)
  const hintedEntries = entries.filter(([key]) => {
    const normalizedKey = normalizePropertyKey(key)
    return CAR_NUMBER_KEY_HINTS.some((hint) => normalizedKey.includes(hint))
  })

  for (const [, value] of hintedEntries) {
    const match = extractCarNumberFromText(value)
    if (match) return match
  }

  for (const [, value] of entries) {
    const match = extractCarNumberFromText(value)
    if (match) return match
  }

  return null
}

function formatCarValidationStatusLabel(carValidation) {
  const status = carValidation?.status
  const primaryType = carValidation?.primaryMatch?.referenceType || carValidation?.referenceType || 'CAR/KML'

  if (status === 'inside') {
    return `Gleba dentro do ${primaryType}`
  }

  if (status === 'partial') {
    return `Gleba parcialmente dentro do ${primaryType}`
  }

  if (status === 'clear') {
    return `Gleba fora do ${primaryType}`
  }

  return 'Nao analisado'
}

function formatCarValidationMatches(matches = []) {
  return matches
    .map((match) => match.nome || match.datasetName || match.codigo || null)
    .filter(Boolean)
    .join(' | ')
}

function getCarValidationPopupClass(status) {
  if (status === 'inside') return 'popup-cell--gleba-inside'
  if (status === 'partial') return 'popup-cell--gleba-partial'
  return ''
}

function normalizeNumericArea(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.').trim())
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function resolvePopupArea(feature, areaOverride = null) {
  if (typeof areaOverride === 'number') {
    return areaOverride
  }

  const ring =
    feature?.properties?.displayCoordinates ||
    feature?.geometry?.coordinates?.[0] ||
    []
  const calculatedArea = calculatePolygonAreaHectares(ring)

  return typeof calculatedArea === 'number'
    ? calculatedArea
    : feature?.properties?.area
}

function createVertexDragPreviewLayers(leafMap, selectedGleba, ringLonLat, vertexIndex, displayIndex = null) {
  const group = L.layerGroup().addTo(leafMap)
  const style = STATUS_STYLES[selectedGleba.properties.status] || STATUS_STYLES.pendente
  const closedRing = ensureClosedCoordinateRing(ringLonLat)
  const ll = closedRing.map(([lon, lat]) => [lat, lon])
  const activeDisplayIndex = Number.isInteger(displayIndex) ? displayIndex : vertexIndex
  const activeCoordinate =
    selectedGleba.properties.coordinateStatuses?.[activeDisplayIndex] ||
    selectedGleba.properties.coordinateStatuses?.[vertexIndex]
  const activeRole = resolveCoordinateRole(selectedGleba, activeDisplayIndex, activeCoordinate)
  const activeVertexStyle = getEditableVertexPathOptions(activeCoordinate, true, activeRole)
  const companionDisplayIndexes = [resolveClosingDisplayIndex(selectedGleba, activeDisplayIndex)]
    .filter((index, currentIndex, indexes) => (
      Number.isInteger(index) &&
      index !== activeDisplayIndex &&
      index >= 0 &&
      index < ringLonLat.length &&
      indexes.indexOf(index) === currentIndex
    ))

  if (selectedGleba.properties.status === 'invalida' && selectedGleba.properties.originalCoordinates?.length > 1) {
    L.polyline(
      selectedGleba.properties.originalCoordinates.map(([lon, lat]) => [lat, lon]),
      { color: '#fca5a5', weight: 2, dashArray: '8 6', opacity: 0.95, interactive: false }
    ).addTo(group)
  }

  const shape = L.polyline(ll, {
    color: style.color,
    weight: 2.75,
    opacity: 0.96,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  })
  shape.addTo(group)

  const outline = L.polyline(ll, {
    color: '#f8fafc',
    weight: 1.5,
    dashArray: '3 6',
    opacity: 0.65,
    interactive: false,
  })
  outline.addTo(group)

  const helperLine = L.polyline([], {
    color: '#f8fafc',
    weight: 3,
    dashArray: '6 6',
    opacity: 0.95,
    interactive: false,
  })
  helperLine.addTo(group)

  const activeVertex = L.circleMarker(ll[vertexIndex], {
    ...activeVertexStyle.pathOptions,
    radius: activeVertexStyle.radius,
    interactive: false,
  })
  activeVertex.addTo(group)

  const companionVertices = companionDisplayIndexes.map((companionIndex) => {
    const companionCoordinate =
      selectedGleba.properties.coordinateStatuses?.[companionIndex] ||
      activeCoordinate
    const companionRole = resolveCoordinateRole(selectedGleba, companionIndex, companionCoordinate)
    const companionStyle = getEditableVertexPathOptions(companionCoordinate, false, companionRole)
    const companionVertex = L.circleMarker(ll[companionIndex], {
      ...companionStyle.pathOptions,
      radius: companionStyle.radius,
      interactive: false,
    }).addTo(group)

    return {
      marker: companionVertex,
      vertexIndex: companionIndex,
    }
  })

  return { group, shape, outline, helperLine, activeVertex, companionVertices }
}

function updateVertexDragPreviewLayers(layers, selectedGleba, vertexIndex, ringLonLat) {
  if (!layers) return

  const closedRing = ensureClosedCoordinateRing(ringLonLat)
  const ll = closedRing.map(([lon, lat]) => [lat, lon])
  layers.shape.setLatLngs(ll)
  layers.outline.setLatLngs(ll)
  const n = ringLonLat.length
  if (n > 2) {
    const prev = (vertexIndex - 1 + n) % n
    const next = (vertexIndex + 1) % n
    layers.helperLine.setLatLngs([
      [ringLonLat[prev][1], ringLonLat[prev][0]],
      [ringLonLat[vertexIndex][1], ringLonLat[vertexIndex][0]],
      [ringLonLat[next][1], ringLonLat[next][0]],
    ])
  } else {
    layers.helperLine.setLatLngs([])
  }

  layers.activeVertex.setLatLng([
    ringLonLat[vertexIndex][1],
    ringLonLat[vertexIndex][0],
  ])

  layers.companionVertices?.forEach(({ marker, vertexIndex: companionIndex }) => {
    marker.setLatLng([
      ringLonLat[companionIndex][1],
      ringLonLat[companionIndex][0],
    ])
  })
}

function popupMarkup(feature, areaOverride = null) {
  const properties = feature.properties || {}
  const area = resolvePopupArea(feature, areaOverride)
  const carValidation = properties.carOverlapValidation
  const showCarValidation = carValidation?.status && carValidation.status !== 'not_loaded'
  const carStatusLabel = formatCarValidationStatusLabel(carValidation)
  const carMatchLabel = formatCarValidationMatches(carValidation?.inside?.length
    ? carValidation.inside
    : carValidation?.partialOverlaps || []
  )
  const carValidationClass = getCarValidationPopupClass(carValidation?.status)
  const carReferenceType = carValidation?.primaryMatch?.referenceType || carValidation?.referenceType || 'CAR/KML'

  return `
    <div class="gleba-popup">
      <div class="popup-top">
        <div class="popup-nome">${escapeHtml(properties.nome || 'Gleba')}</div>
      </div>
      <div class="popup-grid">
        <div class="popup-cell">
          <span class="pcell-label">Area</span>
          <span class="pcell-val">${escapeHtml(formatArea(area))}</span>
        </div>
        <div class="popup-cell">
          <span class="pcell-label">Municipio</span>
          <span class="pcell-val">${escapeHtml(properties.municipio || '-')}</span>
        </div>
        <div class="popup-cell popup-cell--full">
          <span class="pcell-label">Localizacao</span>
          <span class="pcell-val pcell-mono">${escapeHtml(properties.municipio || '-')} ${properties.uf ? `/ ${escapeHtml(properties.uf)}` : ''}</span>
        </div>
        ${showCarValidation ? `
          <div class="popup-cell popup-cell--full ${carValidationClass}">
            <span class="pcell-label">Validacao ${escapeHtml(carReferenceType)}</span>
            <span class="pcell-val">${escapeHtml(carStatusLabel)}</span>
          </div>
          ${carMatchLabel ? `
            <div class="popup-cell popup-cell--full ${carValidationClass}">
              <span class="pcell-label">Contido em</span>
              <span class="pcell-val">${escapeHtml(carMatchLabel)}</span>
            </div>
          ` : ''}
        ` : ''}
      </div>
    </div>
  `
}

function glebaReferenceTooltipMarkup(feature) {
  const carValidation = feature?.properties?.carOverlapValidation

  if (!['inside', 'partial'].includes(carValidation?.status)) {
    return null
  }

  const statusLabel = formatCarValidationStatusLabel(carValidation)
  const matchLabel = formatCarValidationMatches(carValidation.inside?.length
    ? carValidation.inside
    : carValidation.partialOverlaps || []
  )

  return `
    <div class="gleba-relation-map-badge">
      <strong>${escapeHtml(statusLabel)}</strong>
      ${matchLabel ? `<span>${escapeHtml(matchLabel)}</span>` : ''}
    </div>
  `
}

function carReferencePopupMarkup(feature) {
  const properties = feature.properties || {}
  const reference = getReferencePresentation(feature)
  const containment = properties.kmlContainment || {}
  const insideLabel = formatRelationList(containment.inside || [])
  const containsLabel = formatRelationList(containment.contains || [])
  const carReferenceNumber = findCarNumberInProperties(properties)
  const referenceIdentifier = reference.type === 'KML'
    ? properties.nome || properties.id || '-'
    : carReferenceNumber || '-'
  const showCarReferenceNumber = reference.type === 'KML' && carReferenceNumber
  const municipalityUf = [
    properties.municipio || '-',
    properties.uf || null,
  ].filter(Boolean).join(' / ')
  const datasetName = properties.__carDatasetName || properties.origem_arquivo || null
  const geometryArea =
    feature.geometry?.type === 'Polygon'
      ? calculatePolygonAreaHectares(feature.geometry.coordinates?.[0] || [])
      : feature.geometry?.type === 'MultiPolygon'
        ? Number(
            (feature.geometry.coordinates || []).reduce(
              (total, polygon) => total + (calculatePolygonAreaHectares(polygon?.[0] || []) || 0),
              0
            ).toFixed(2)
          )
        : null
  const resolvedArea = normalizeNumericArea(properties.area) ?? geometryArea

  return `
    <div class="gleba-popup">
      <div class="popup-top">
        <div class="popup-nome">${escapeHtml(reference.popupTitle)}</div>
      </div>
      <div class="popup-grid">
        <div class="popup-cell popup-cell--full">
          <span class="pcell-label">${escapeHtml(reference.identifierLabel)}</span>
          <span class="pcell-val pcell-mono">${escapeHtml(referenceIdentifier)}</span>
        </div>
        ${showCarReferenceNumber ? `
          <div class="popup-cell popup-cell--full">
            <span class="pcell-label">Nº do CAR do imóvel</span>
            <span class="pcell-val pcell-mono">${escapeHtml(carReferenceNumber)}</span>
          </div>
        ` : ''}
        <div class="popup-cell popup-cell--full">
          <span class="pcell-label">Munic&iacute;pio / UF</span>
          <span class="pcell-val">${escapeHtml(municipalityUf)}</span>
        </div>
        ${datasetName ? `
          <div class="popup-cell popup-cell--full">
            <span class="pcell-label">${escapeHtml(reference.fileLabel)}</span>
            <span class="pcell-val">${escapeHtml(datasetName)}</span>
          </div>
        ` : ''}
        <div class="popup-cell popup-cell--full">
          <span class="pcell-label">&Aacute;rea</span>
          <span class="pcell-val">${escapeHtml(formatArea(resolvedArea))}</span>
        </div>
        ${insideLabel ? `
          <div class="popup-cell popup-cell--full popup-cell--contained">
            <span class="pcell-label">${escapeHtml(reference.type)} dentro de</span>
            <span class="pcell-val">${escapeHtml(insideLabel)}</span>
          </div>
        ` : ''}
        ${containsLabel ? `
          <div class="popup-cell popup-cell--full popup-cell--contains">
            <span class="pcell-label">Contém ${escapeHtml(reference.type)}</span>
            <span class="pcell-val">${escapeHtml(containsLabel)}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `
}

function publicCarPopupMarkup(feature) {
  const properties = feature.properties || {}
  const municipalityUf = [
    properties.municipio || '-',
    properties.uf || null,
  ].filter(Boolean).join(' / ')
  const environmentalValidation = properties.environmentalValidation || null
  const environmentalStatus = formatEnvironmentalValidationStatus(environmentalValidation)
  const environmentalClass = environmentalValidation?.status || 'unknown'

  return `
    <div class="gleba-popup public-car-popup">
      <div class="popup-top">
        <div class="popup-nome">CAR consultado</div>
      </div>
      <div class="popup-grid">
        <div class="popup-cell popup-cell--full">
          <span class="pcell-label">CAR</span>
          <span class="pcell-val pcell-mono">${escapeHtml(properties.carCode || '-')}</span>
        </div>
        <div class="popup-cell popup-cell--full public-car-popup__status public-car-popup__status--${escapeHtml(properties.statusTone || 'unknown')}">
          <span class="pcell-label">Status</span>
          <span class="pcell-val">${escapeHtml(properties.statusLabel || 'Status desconhecido')}</span>
        </div>
        <div class="popup-cell popup-cell--full">
          <span class="pcell-label">Municipio / UF</span>
          <span class="pcell-val">${escapeHtml(municipalityUf)}</span>
        </div>
        <div class="popup-cell">
          <span class="pcell-label">Area</span>
          <span class="pcell-val">${escapeHtml(formatArea(properties.area))}</span>
        </div>
        <div class="popup-cell">
          <span class="pcell-label">Tipo</span>
          <span class="pcell-val">${escapeHtml(properties.tipo || '-')}</span>
        </div>
        ${environmentalStatus ? `
          <div class="popup-cell popup-cell--full public-car-popup__environment public-car-popup__environment--${escapeHtml(environmentalClass)}">
            <span class="pcell-label">Unidade de Conservacao</span>
            <span class="pcell-val">${escapeHtml(environmentalValidation.message || environmentalStatus)}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `
}

function environmentalRestrictionPopupMarkup(feature) {
  const properties = feature.properties || {}
  const location = [
    properties.municipio,
    properties.uf,
  ].filter(Boolean).join(' / ')

  return `
    <div class="gleba-popup public-car-popup environmental-popup">
      <div class="popup-top">
        <div class="popup-nome">Reserva ambiental</div>
      </div>
      <div class="popup-grid">
        <div class="popup-cell popup-cell--full public-car-popup__environment public-car-popup__environment--overlap">
          <span class="pcell-label">Unidade de Conservacao</span>
          <span class="pcell-val">${escapeHtml(properties.nome || 'Unidade de Conservacao')}</span>
        </div>
        <div class="popup-cell">
          <span class="pcell-label">Categoria</span>
          <span class="pcell-val">${escapeHtml(properties.categoria || '-')}</span>
        </div>
        <div class="popup-cell">
          <span class="pcell-label">Grupo</span>
          <span class="pcell-val">${escapeHtml(properties.grupo || '-')}</span>
        </div>
        <div class="popup-cell popup-cell--full">
          <span class="pcell-label">Municipio / UF</span>
          <span class="pcell-val">${escapeHtml(location || '-')}</span>
        </div>
        <div class="popup-cell">
          <span class="pcell-label">Area</span>
          <span class="pcell-val">${escapeHtml(formatEnvironmentalArea(properties.area))}</span>
        </div>
        <div class="popup-cell">
          <span class="pcell-label">Fonte</span>
          <span class="pcell-val">${escapeHtml(properties.referenceType || 'CNUC/MMA')}</span>
        </div>
      </div>
    </div>
  `
}

function environmentalRestrictionFeatureStyle(isHovered = false) {
  return {
    ...ENVIRONMENTAL_RESTRICTION_STYLE,
    opacity: 1,
    fillOpacity: isHovered ? 0.34 : 0.18,
    weight: isHovered ? 4.4 : 3.2,
    dashArray: '9 5',
    lineCap: 'round',
  }
}

function publicCarFeatureStyle(feature, isHovered = false) {
  const statusTone = feature?.properties?.statusTone || 'unknown'
  const statusStyle = PUBLIC_CAR_STATUS_STYLES[statusTone] || PUBLIC_CAR_STATUS_STYLES.unknown

  return {
    ...statusStyle,
    opacity: 1,
    fillOpacity: isHovered ? 0.34 : 0.22,
    weight: isHovered ? 4.6 : 3.4,
    dashArray: statusTone === 'active' ? '2 7' : '8 5',
    lineCap: 'round',
    lineJoin: 'round',
  }
}

function featureStyle(feature, selectedId, matchedFeatureIds) {
  const base = STATUS_STYLES[feature.properties.status] || STATUS_STYLES.pendente
  const carValidationStatus = feature.properties.carOverlapValidation?.status
  const relationStyle =
    carValidationStatus === 'inside'
      ? GLEBA_INSIDE_REFERENCE_STYLE
      : carValidationStatus === 'partial'
        ? GLEBA_PARTIAL_REFERENCE_STYLE
        : null

  if (matchedFeatureIds.includes(feature.properties.id)) {
    return relationStyle
      ? { ...base, ...relationStyle, fillOpacity: 0.5, weight: 5 }
      : { ...base, ...MATCHED_OVERRIDES }
  }

  if (feature.properties.id === selectedId) {
    return relationStyle
      ? { ...base, ...relationStyle, fillOpacity: 0.54, weight: 5.2 }
      : { ...base, ...SELECTED_OVERRIDES }
  }

  return relationStyle ? { ...base, ...relationStyle } : base
}

function getCarFeatureLayerKey(datasetId, featureId) {
  if (!featureId) return null
  return datasetId ? `${datasetId}::${featureId}` : featureId
}

function getCarFeatureDisplayName(feature, fallbackIndex = null) {
  const properties = feature?.properties || {}

  return (
    properties.nome ||
    properties.numero_car_recibo ||
    properties.codigo_imovel ||
    properties.cod_imovel ||
    properties.car ||
    properties.id ||
    (Number.isInteger(fallbackIndex) ? `Imovel CAR ${fallbackIndex + 1}` : 'Imovel CAR')
  )
}

function getCarFeatureDisplayCode(feature) {
  const properties = feature?.properties || {}

  return (
    properties.numero_car_recibo ||
    properties.codigo_imovel ||
    properties.cod_imovel ||
    properties.car ||
    null
  )
}

function calculateGeometryAreaHectares(geometry) {
  if (!geometry) return null

  if (geometry.type === 'Polygon') {
    return calculatePolygonAreaHectares(geometry.coordinates?.[0] || [])
  }

  if (geometry.type === 'MultiPolygon') {
    const area = (geometry.coordinates || []).reduce(
      (total, polygon) => total + (calculatePolygonAreaHectares(polygon?.[0] || []) || 0),
      0
    )

    return area ? Number(area.toFixed(2)) : null
  }

  return null
}

function pointOnLonLatSegment(point, start, end, tolerance = COORDINATE_MATCH_TOLERANCE) {
  if (!point || !start || !end) return false

  const cross =
    (point[1] - start[1]) * (end[0] - start[0]) -
    (point[0] - start[0]) * (end[1] - start[1])

  if (Math.abs(cross) > tolerance) return false

  const dot =
    (point[0] - start[0]) * (end[0] - start[0]) +
    (point[1] - start[1]) * (end[1] - start[1])

  if (dot < -tolerance) return false

  const squaredLength =
    (end[0] - start[0]) ** 2 +
    (end[1] - start[1]) ** 2

  return dot - squaredLength <= tolerance
}

function pointInLonLatRing(point, ring = []) {
  if (ring.length < 3) return false

  let inside = false

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index]
    const prior = ring[previous]

    if (pointOnLonLatSegment(point, prior, current)) {
      return true
    }

    const [xi, yi] = current
    const [xj, yj] = prior
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi

    if (intersects) inside = !inside
  }

  return inside
}

function pointInPolygonCoordinates(point, polygon = []) {
  const [outerRing, ...innerRings] = polygon

  if (!pointInLonLatRing(point, outerRing || [])) {
    return false
  }

  return !innerRings.some((ring) => pointInLonLatRing(point, ring))
}

function pointInCarReferenceGeometry(latlng, geometry) {
  if (!latlng || !geometry) return false

  const point = [latlng.lng, latlng.lat]

  if (geometry.type === 'Polygon') {
    return pointInPolygonCoordinates(point, geometry.coordinates || [])
  }

  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates || []).some((polygon) =>
      pointInPolygonCoordinates(point, polygon)
    )
  }

  return false
}

function buildCarFeatureSelectionMeta(feature, area) {
  const properties = feature?.properties || {}
  const datasetName = properties.__carDatasetName || properties.origem_arquivo || null
  const code = getCarFeatureDisplayCode(feature)
  const municipalityUf = [properties.municipio, properties.uf].filter(Boolean).join(' / ')
  const resolvedArea = normalizeNumericArea(properties.area) ?? area
  const areaLabel = typeof resolvedArea === 'number' ? formatArea(resolvedArea) : null

  return [datasetName, code, municipalityUf, areaLabel].filter(Boolean).join(' | ')
}

function getCarSelectionCountLabel(candidates = []) {
  const types = [...new Set(
    candidates
      .map((candidate) => getReferencePresentation(candidate.feature).type)
      .filter(Boolean)
  )]

  if (types.length === 1) {
    return types[0] === 'CAR' ? 'CARs' : 'KMLs'
  }

  return 'poligonos'
}

function collectCarReferenceCandidatesAtLatLng(latlng, featureLayers) {
  if (!latlng || !featureLayers?.size) return []

  const candidates = []

  featureLayers.forEach((layer, layerKey) => {
    const feature = layer.feature
    const properties = feature?.properties || {}
    const featureId = properties.id
    const datasetId = properties.__carDatasetId
    const featureLayerKey =
      properties.__carLayerKey ||
      getCarFeatureLayerKey(datasetId, featureId) ||
      layerKey

    if (!featureId || !datasetId) return
    const bounds = layer.getBounds?.()
    if (!bounds?.contains(latlng)) return
    if (!pointInCarReferenceGeometry(latlng, feature.geometry)) return

    const area = calculateGeometryAreaHectares(feature.geometry)

    candidates.push({
      area,
      datasetId,
      feature,
      featureId,
      layer,
      layerKey: featureLayerKey,
    })
  })

  return candidates.sort((left, right) => {
    const leftArea = typeof left.area === 'number' ? left.area : Number.POSITIVE_INFINITY
    const rightArea = typeof right.area === 'number' ? right.area : Number.POSITIVE_INFINITY

    if (leftArea !== rightArea) {
      return leftArea - rightArea
    }

    return getCarFeatureDisplayName(left.feature).localeCompare(
      getCarFeatureDisplayName(right.feature),
      'pt-BR'
    )
  })
}

function buildCarSelectionPopupContent(candidates, selectedLayerKey, onSelectCandidate) {
  const container = document.createElement('div')
  container.className = 'car-selector-popup'

  L.DomEvent.disableClickPropagation(container)
  L.DomEvent.disableScrollPropagation(container)

  const header = document.createElement('div')
  header.className = 'car-selector-popup__header'

  const title = document.createElement('div')
  title.className = 'car-selector-popup__title'
  title.textContent = `${candidates.length} ${getCarSelectionCountLabel(candidates)} neste ponto`

  const subtitle = document.createElement('div')
  subtitle.className = 'car-selector-popup__subtitle'
  subtitle.textContent = 'Escolha qual poligono deseja ativar.'

  header.append(title, subtitle)
  container.append(header)

  const list = document.createElement('div')
  list.className = 'car-selector-popup__list'

  candidates.forEach((candidate, index) => {
    const button = document.createElement('button')
    const isSelected = candidate.layerKey && candidate.layerKey === selectedLayerKey

    button.type = 'button'
    button.className = `car-selector-popup__option${isSelected ? ' is-selected' : ''}`
    button.setAttribute('aria-pressed', isSelected ? 'true' : 'false')

    const indexNode = document.createElement('span')
    indexNode.className = 'car-selector-popup__index'
    indexNode.textContent = `${getReferencePresentation(candidate.feature).type} ${index + 1}`

    const body = document.createElement('span')
    body.className = 'car-selector-popup__body'

    const name = document.createElement('span')
    name.className = 'car-selector-popup__name'
    name.textContent = getCarFeatureDisplayName(candidate.feature, index)

    const meta = document.createElement('span')
    meta.className = 'car-selector-popup__meta'
    meta.textContent = buildCarFeatureSelectionMeta(candidate.feature, candidate.area) || 'Sem metadados'

    const state = document.createElement('span')
    state.className = 'car-selector-popup__state'
    state.textContent = isSelected ? 'Selecionado' : 'Selecionar'

    body.append(name, meta)
    button.append(indexNode, body, state)
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onSelectCandidate(candidate, { openPopup: true })
    })

    list.append(button)
  })

  container.append(list)
  return container
}

function getCarReferenceDatasetStyle(feature) {
  const datasetIndex = Number(feature?.properties?.__carDatasetIndex)
  const style = CAR_REFERENCE_DATASET_STYLES[
    Number.isInteger(datasetIndex) && datasetIndex >= 0
      ? datasetIndex % CAR_REFERENCE_DATASET_STYLES.length
      : 0
  ]

  return {
    ...CAR_REFERENCE_STYLE,
    ...style,
  }
}

function carReferenceStyle(feature, overlapIdSet, selectedLayerKey, matchedDatasetId = null, overlapLayerKeySet = new Set()) {
  const properties = feature?.properties || {}
  const featureId = properties.id
  const containment = properties.kmlContainment || {}
  const isInsideAnotherKml = Boolean(containment.inside?.length)
  const containsAnotherKml = Boolean(containment.contains?.length)
  const featureLayerKey =
    properties.__carLayerKey ||
    getCarFeatureLayerKey(properties.__carDatasetId, featureId)
  const datasetStyle = getCarReferenceDatasetStyle(feature)
  const isSpatialValidationMatch =
    (featureLayerKey && overlapLayerKeySet.has(featureLayerKey)) ||
    (
      overlapIdSet.has(featureId) &&
      (!matchedDatasetId || properties.__carDatasetId === matchedDatasetId)
    )

  if (selectedLayerKey && featureLayerKey === selectedLayerKey) {
    return isInsideAnotherKml
      ? {
          ...CAR_REFERENCE_SELECTED_STYLE,
          color: CAR_REFERENCE_CONTAINED_STYLE.color,
          fillColor: CAR_REFERENCE_CONTAINED_STYLE.fillColor,
          dashArray: CAR_REFERENCE_CONTAINED_STYLE.dashArray,
        }
      : CAR_REFERENCE_SELECTED_STYLE
  }

  if (isSpatialValidationMatch) {
    return CAR_REFERENCE_MATCHED_STYLE
  }

  if (selectedLayerKey) {
    if (isInsideAnotherKml) {
      return {
        ...CAR_REFERENCE_CONTAINED_STYLE,
        fillOpacity: 0.2,
        opacity: 0.9,
      }
    }

    if (containsAnotherKml) {
      return {
        ...CAR_REFERENCE_DIMMED_STYLE,
        color: datasetStyle.color,
        fillColor: datasetStyle.fillColor,
        fillOpacity: 0.16,
        dashArray: CAR_REFERENCE_CONTAINER_STYLE.dashArray,
        dashOffset: datasetStyle.dashOffset,
        weight: 2.8,
      }
    }

    return {
      ...CAR_REFERENCE_DIMMED_STYLE,
      color: datasetStyle.color,
      fillColor: datasetStyle.fillColor,
      dashArray: datasetStyle.dashArray,
      dashOffset: datasetStyle.dashOffset,
    }
  }

  if (isInsideAnotherKml) {
    return CAR_REFERENCE_CONTAINED_STYLE
  }

  if (containsAnotherKml) {
    return {
      ...datasetStyle,
      ...CAR_REFERENCE_CONTAINER_STYLE,
    }
  }

  if (matchedDatasetId && properties.__carDatasetId === matchedDatasetId) {
    return {
      ...datasetStyle,
      ...CAR_REFERENCE_ACTIVE_DATASET_STYLE,
    }
  }

  return datasetStyle
}

function buildCarReferenceMapGeojson(datasets = []) {
  const features = datasets.flatMap((dataset, datasetIndex) => (
    (dataset.geojson?.features || []).map((feature) => {
      const featureId = feature.properties?.id

      return {
        ...feature,
        properties: {
          ...feature.properties,
          __carDatasetId: dataset.datasetId,
          __carDatasetName: dataset.metadata?.fileName || feature.properties?.origem_arquivo || 'Base CAR/KML',
          __carDatasetSourceType: dataset.metadata?.sourceType || feature.properties?.sourceType || null,
          __carDatasetIndex: datasetIndex,
          __carLayerKey: getCarFeatureLayerKey(dataset.datasetId, featureId),
        },
      }
    })
  ))

  return {
    type: 'FeatureCollection',
    features: features.sort((left, right) => {
      const leftInside = left.properties?.kmlContainment?.inside?.length ? 1 : 0
      const rightInside = right.properties?.kmlContainment?.inside?.length ? 1 : 0

      return leftInside - rightInside
    }),
  }
}

function extendBoundsFromCoordinates(bounds, coordinates) {
  if (!Array.isArray(coordinates)) return

  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === 'number' &&
    typeof coordinates[1] === 'number'
  ) {
    bounds.extend([coordinates[1], coordinates[0]])
    return
  }

  coordinates.forEach((childCoordinates) => {
    extendBoundsFromCoordinates(bounds, childCoordinates)
  })
}

function extendBoundsFromObject(bounds, boundsObject) {
  if (!boundsObject) return false
  const { minLon, minLat, maxLon, maxLat } = boundsObject

  if (
    !Number.isFinite(minLon) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLon) ||
    !Number.isFinite(maxLat)
  ) {
    return false
  }

  bounds.extend([minLat, minLon])
  bounds.extend([maxLat, maxLon])
  return true
}

function datasetBounds(geojson) {
  if (!geojson?.features?.length) return null

  const bounds = L.latLngBounds([])

  geojson.features.forEach((feature) => {
    if (extendBoundsFromObject(bounds, feature.properties?.__bounds)) return
    extendBoundsFromCoordinates(bounds, feature.geometry?.coordinates)
  })

  return bounds.isValid() ? bounds : null
}

function featureBoundsFromGeojson(geojson, datasetId, featureId) {
  if (!featureId || !geojson?.features?.length) return null

  const feature = geojson.features.find((candidate) => {
    const properties = candidate.properties || {}
    const candidateLayerKey =
      properties.__carLayerKey ||
      getCarFeatureLayerKey(properties.__carDatasetId, properties.id)

    return (
      candidateLayerKey === getCarFeatureLayerKey(datasetId, featureId) ||
      properties.id === featureId
    )
  })

  if (!feature) return null

  const bounds = L.latLngBounds([])
  if (extendBoundsFromObject(bounds, feature.properties?.__bounds)) {
    return bounds.isValid() ? bounds : null
  }

  extendBoundsFromCoordinates(bounds, feature.geometry?.coordinates)
  return bounds.isValid() ? bounds : null
}

function featureSetBounds(featureIds, featureLayers) {
  if (!featureIds?.length) return null

  const layers = featureIds
    .map((featureId) => featureLayers.get(featureId))
    .filter(Boolean)

  if (!layers.length) return null

  const bounds = L.latLngBounds([])

  layers.forEach((layer) => {
    const layerBounds = layer.getBounds?.()
    if (layerBounds?.isValid()) {
      bounds.extend(layerBounds)
    }
  })

  return bounds.isValid() ? bounds : null
}

function carReferenceDatasetLayerBounds(datasetId, featureLayers) {
  if (!datasetId || !featureLayers?.size) return null

  const bounds = L.latLngBounds([])

  featureLayers.forEach((layer) => {
    if (layer.feature?.properties?.__carDatasetId !== datasetId) return

    const layerBounds = layer.getBounds?.()
    if (layerBounds?.isValid()) {
      bounds.extend(layerBounds)
    }
  })

  return bounds.isValid() ? bounds : null
}

function GeoJSONLayer({
  glebas,
  onSelect,
  selectedId,
  matchedFeatureIds,
  visibleFeatureIds,
  viewportRequest,
  suppressFeatureId,
}) {
  const leafMap = useMap()
  const featureGroupRef = useRef(null)
  const featureLayersRef = useRef(new Map())
  const lastDatasetKeyRef = useRef(null)
  const lastViewportRequestRef = useRef(null)
  const selectedIdRef = useRef(selectedId)
  const matchedFeatureIdsRef = useRef(matchedFeatureIds)
  const visibleFeatureIdSetRef = useRef(new Set())

  const visibleFeatureIdSet = useMemo(
    () => new Set(visibleFeatureIds),
    [visibleFeatureIds]
  )

  useEffect(() => {
    selectedIdRef.current = selectedId
    matchedFeatureIdsRef.current = matchedFeatureIds
    visibleFeatureIdSetRef.current = visibleFeatureIdSet
  }, [matchedFeatureIds, selectedId, visibleFeatureIdSet])

  useEffect(() => {
    const featureGroup = L.featureGroup().addTo(leafMap)
    featureGroupRef.current = featureGroup

    return () => {
      featureGroup.remove()
      featureGroupRef.current = null
      featureLayersRef.current.clear()
    }
  }, [leafMap])

  useEffect(() => {
    if (!featureGroupRef.current) return

    const datasetKey = JSON.stringify(
      glebas?.features?.map((feature) => ({
        id: feature.properties.id,
        area: feature.properties.area,
        carOverlapStatus: feature.properties.carOverlapValidation?.status || null,
        carOverlapCount: feature.properties.carOverlapValidation?.overlapCount || 0,
        carInsideCount: feature.properties.carOverlapValidation?.insideCount || 0,
        carPartialOverlapCount: feature.properties.carOverlapValidation?.partialOverlapCount || 0,
        carOverlapKeys: feature.properties.carOverlapValidation?.overlaps?.map((overlap) => overlap.layerKey || overlap.id).join('|') || '',
        coordinates: feature.geometry?.coordinates?.[0] || [],
      })) || []
    )

    if (lastDatasetKeyRef.current === datasetKey) {
      return
    }

    lastDatasetKeyRef.current = datasetKey
    featureGroupRef.current.clearLayers()
    featureLayersRef.current.clear()

    if (!glebas?.features?.length) return

    L.geoJSON(glebas, {
      pane: 'gleba-layer',
      onEachFeature: (feature, leafletLayer) => {
        const featureId = feature.properties.id

        leafletLayer.bindPopup(popupMarkup(feature), PERSISTENT_POPUP_OPTIONS)
        const relationTooltip = glebaReferenceTooltipMarkup(feature)
        if (relationTooltip) {
          leafletLayer.bindTooltip(relationTooltip, {
            permanent: true,
            direction: 'center',
            className: 'gleba-relation-tooltip',
            opacity: 1,
          })
        }

        leafletLayer.on({
          mouseover(event) {
            if (!visibleFeatureIdSetRef.current.has(featureId)) return

            event.target.setStyle({
              ...featureStyle(feature, selectedIdRef.current, matchedFeatureIdsRef.current),
              fillOpacity: matchedFeatureIdsRef.current.includes(featureId) ? 0.46 : featureId === selectedIdRef.current ? 0.65 : 0.5,
              weight: matchedFeatureIdsRef.current.includes(featureId) ? 5 : featureId === selectedIdRef.current ? 4 : 3,
            })
            event.target.bringToFront()
          },
          mouseout(event) {
            if (!visibleFeatureIdSetRef.current.has(featureId)) return
            event.target.setStyle(featureStyle(feature, selectedIdRef.current, matchedFeatureIdsRef.current))
          },
          click(event) {
            if (!visibleFeatureIdSetRef.current.has(featureId)) return

            onSelect(feature)
            leafletLayer.openPopup(event.latlng)
          },
        })

        featureGroupRef.current?.addLayer(leafletLayer)
        featureLayersRef.current.set(featureId, leafletLayer)
      },
    })
  }, [glebas, leafMap, onSelect])

  useEffect(() => {
    if (!featureGroupRef.current) return

    featureLayersRef.current.forEach((layer, featureId) => {
      const isVisible = visibleFeatureIdSet.has(featureId)
      const hideForVertexEdit = suppressFeatureId && featureId === suppressFeatureId

      if (!isVisible || hideForVertexEdit) {
        layer.setStyle(HIDDEN_STYLE)
      } else {
        layer.setStyle(
          featureStyle(layer.feature, selectedId, matchedFeatureIds)
        )
      }
    })
  }, [matchedFeatureIds, selectedId, suppressFeatureId, visibleFeatureIdSet])

  useEffect(() => {
    if (!viewportRequest || lastViewportRequestRef.current === viewportRequest.requestKey || lastViewportRequestRef.current === viewportRequest.datasetKey) {
      return
    }

    if (viewportRequest.type === 'dataset') {
      const bounds = datasetBounds(glebas)
      if (bounds?.isValid()) {
        animateToBounds(leafMap, bounds, { maxZoom: 14 })
      }
      lastViewportRequestRef.current = viewportRequest.datasetKey
      return
    }

    if (viewportRequest.type === 'home') {
      leafMap.flyTo(BRAZIL_CENTER, BRAZIL_ZOOM, DEFAULT_FLY_OPTIONS)
      lastViewportRequestRef.current = viewportRequest.requestKey
      return
    }

    if (viewportRequest.type === 'feature-set') {
      const bounds = featureSetBounds(
        viewportRequest.featureIds,
        featureLayersRef.current
      )

      if (bounds?.isValid()) {
        animateToBounds(leafMap, bounds, FLY_FEATURE_BOUNDS_OPTIONS)
      } else if (viewportRequest.point) {
        animateToPoint(leafMap, viewportRequest.point, Math.max(leafMap.getZoom(), 15), { duration: 1.3 })
      }

      lastViewportRequestRef.current = viewportRequest.requestKey
      return
    }

    if (viewportRequest.type === 'feature' && viewportRequest.featureId) {
      const layer = featureLayersRef.current.get(viewportRequest.featureId)
      if (layer) {
        animateToBounds(leafMap, layer.getBounds(), FLY_FEATURE_BOUNDS_OPTIONS)
      } else if (viewportRequest.point) {
        animateToPoint(leafMap, viewportRequest.point, Math.max(leafMap.getZoom(), 16), { duration: 1.3 })
      }
      lastViewportRequestRef.current = viewportRequest.requestKey
      return
    }

    if (viewportRequest.type === 'point' && viewportRequest.point) {
      animateToPoint(leafMap, viewportRequest.point, Math.max(leafMap.getZoom(), 16), { duration: 1.25 })
      lastViewportRequestRef.current = viewportRequest.requestKey
    }
  }, [glebas, leafMap, viewportRequest])

  return null
}

function CarReferenceLayer({
  carGeojson,
  carDatasetKey = null,
  selectedOverlapIds = [],
  selectedOverlapLayerKeys = [],
  selectedFeatureId = null,
  selectedDatasetId = null,
  viewportRequest,
  onSelectFeature,
}) {
  const leafMap = useMap()
  const featureGroupRef = useRef(null)
  const featureLayersRef = useRef(new Map())
  const canvasRendererRef = useRef(null)
  const selectorPopupRef = useRef(null)
  const lastDatasetKeyRef = useRef(null)
  const lastViewportRequestRef = useRef(null)
  const selectedLayerKeyRef = useRef(getCarFeatureLayerKey(selectedDatasetId, selectedFeatureId))
  const selectedDatasetIdRef = useRef(selectedDatasetId)
  const overlapIdSetRef = useRef(new Set())
  const overlapLayerKeySetRef = useRef(new Set())
  const overlapIdSet = useMemo(() => new Set(selectedOverlapIds), [selectedOverlapIds])
  const overlapLayerKeySet = useMemo(() => new Set(selectedOverlapLayerKeys), [selectedOverlapLayerKeys])
  const selectedLayerKey = useMemo(
    () => getCarFeatureLayerKey(selectedDatasetId, selectedFeatureId),
    [selectedDatasetId, selectedFeatureId]
  )

  const closeSelectorPopup = useCallback(() => {
    if (!selectorPopupRef.current) return

    selectorPopupRef.current.remove()
    selectorPopupRef.current = null
  }, [])

  const selectCarCandidate = useCallback((candidate, options = {}) => {
    if (!candidate?.datasetId || !candidate?.featureId) return

    closeSelectorPopup()
    onSelectFeature?.(candidate.datasetId, candidate.featureId, { focusMap: false })

    if (candidate.layer && options.openPopup) {
      candidate.layer.openPopup?.(options.popupLatLng)
    }
  }, [closeSelectorPopup, onSelectFeature])

  const openCarCandidateSelector = useCallback((latlng, candidates) => {
    if (!latlng || candidates.length < 2) return

    closeSelectorPopup()

    const popup = L.popup(CAR_SELECTION_POPUP_OPTIONS)
      .setLatLng(latlng)
      .setContent(
        buildCarSelectionPopupContent(
          candidates,
          selectedLayerKeyRef.current,
          (candidate, options = {}) =>
            selectCarCandidate(candidate, { ...options, popupLatLng: latlng })
        )
      )

    popup.on('remove', () => {
      if (selectorPopupRef.current === popup) {
        selectorPopupRef.current = null
      }
    })

    selectorPopupRef.current = popup
    popup.openOn(leafMap)
  }, [closeSelectorPopup, leafMap, selectCarCandidate])

  useEffect(() => {
    selectedLayerKeyRef.current = selectedLayerKey
    selectedDatasetIdRef.current = selectedDatasetId
    overlapIdSetRef.current = overlapIdSet
    overlapLayerKeySetRef.current = overlapLayerKeySet
  }, [overlapIdSet, overlapLayerKeySet, selectedDatasetId, selectedLayerKey])

  useEffect(() => {
    canvasRendererRef.current = L.canvas({
      pane: 'car-reference',
      padding: 0.5,
      tolerance: 6,
    })

    const featureGroup = L.featureGroup().addTo(leafMap)
    featureGroupRef.current = featureGroup

    return () => {
      closeSelectorPopup()
      featureGroup.remove()
      featureGroupRef.current = null
      canvasRendererRef.current = null
      featureLayersRef.current.clear()
    }
  }, [closeSelectorPopup, leafMap])

  useEffect(() => {
    if (!featureGroupRef.current) return

    const features = carGeojson?.features || []
    const firstFeature = features[0]?.properties || {}
    const lastFeature = features[features.length - 1]?.properties || {}
    const nextDatasetKey = [
      carDatasetKey || 'sem-base',
      features.length,
      firstFeature.__carLayerKey || firstFeature.id || '',
      lastFeature.__carLayerKey || lastFeature.id || '',
    ].join('|')

    if (lastDatasetKeyRef.current === nextDatasetKey) {
      return
    }

    lastDatasetKeyRef.current = nextDatasetKey
    featureGroupRef.current.clearLayers()
    featureLayersRef.current.clear()

    if (!features.length) return

    const carLayer = L.geoJSON(null, {
      pane: 'car-reference',
      renderer: canvasRendererRef.current || undefined,
      style: (feature) => carReferenceStyle(
        feature,
        overlapIdSetRef.current,
        selectedLayerKeyRef.current,
        selectedDatasetIdRef.current,
        overlapLayerKeySetRef.current
      ),
      onEachFeature: (feature, layer) => {
        const properties = feature.properties || {}
        const featureId = properties.id
        const datasetId = properties.__carDatasetId
        const featureLayerKey =
          properties.__carLayerKey ||
          getCarFeatureLayerKey(datasetId, featureId)

        layer.bindPopup(carReferencePopupMarkup(feature), CAR_REFERENCE_POPUP_OPTIONS)

        layer.on({
          mouseover(event) {
            const activeSelectedLayerKey = selectedLayerKeyRef.current
            const isSelected = featureLayerKey && featureLayerKey === activeSelectedLayerKey
            const isMatchedFeature =
              overlapLayerKeySetRef.current.has(featureLayerKey) ||
              (
                overlapIdSetRef.current.has(featureId) &&
                (!selectedDatasetIdRef.current || datasetId === selectedDatasetIdRef.current)
              )
            const baseStyle = carReferenceStyle(
              feature,
              overlapIdSetRef.current,
              activeSelectedLayerKey,
              selectedDatasetIdRef.current,
              overlapLayerKeySetRef.current
            )

            event.target.setStyle(
              isSelected
                ? {
                    ...baseStyle,
                    fillOpacity: 0.28,
                    weight: baseStyle.weight,
                  }
                  : {
                      ...baseStyle,
                      fillOpacity: activeSelectedLayerKey ? 0.2 : isMatchedFeature ? 0.28 : 0.14,
                      weight: activeSelectedLayerKey ? 3.2 : isMatchedFeature ? 3.5 : 2.8,
                    }
            )

          },
          mouseout(event) {
            const activeSelectedLayerKey = selectedLayerKeyRef.current
            event.target.setStyle(carReferenceStyle(
              feature,
              overlapIdSetRef.current,
              activeSelectedLayerKey,
              selectedDatasetIdRef.current,
              overlapLayerKeySetRef.current
            ))
          },
          click(event) {
            if (event.originalEvent) {
              L.DomEvent.stop(event.originalEvent)
            }

            leafMap.fire(ICMBIO_FEATURE_INFO_EVENT, { latlng: event.latlng })

            const candidates = collectCarReferenceCandidatesAtLatLng(
              event.latlng,
              featureLayersRef.current
            )
            const fallbackCandidate = {
              area: calculateGeometryAreaHectares(feature.geometry),
              datasetId,
              feature,
              featureId,
              layer,
              layerKey: featureLayerKey,
            }
            const resolvedCandidates = candidates.length ? candidates : [fallbackCandidate]

            if (resolvedCandidates.length > 1) {
              openCarCandidateSelector(event.latlng, resolvedCandidates)
              return
            }

            selectCarCandidate(resolvedCandidates[0], {
              openPopup: true,
              popupLatLng: event.latlng,
            })
          },
        })

        featureGroupRef.current?.addLayer(layer)
        if (featureLayerKey) {
          featureLayersRef.current.set(featureLayerKey, layer)
        }
      },
    })

    featureGroupRef.current.addLayer(carLayer)

    let isCancelled = false
    let frameId = null
    let nextFeatureIndex = 0

    const renderNextChunk = () => {
      if (isCancelled) return

      const chunkEnd = Math.min(
        nextFeatureIndex + CAR_REFERENCE_RENDER_CHUNK_SIZE,
        features.length
      )

      for (; nextFeatureIndex < chunkEnd; nextFeatureIndex += 1) {
        carLayer.addData(features[nextFeatureIndex])
      }

      if (nextFeatureIndex < features.length) {
        frameId = window.requestAnimationFrame(renderNextChunk)
      }
    }

    frameId = window.requestAnimationFrame(renderNextChunk)

    return () => {
      isCancelled = true
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      carLayer.remove()
    }
  }, [carDatasetKey, carGeojson, leafMap, openCarCandidateSelector, selectCarCandidate])

  useEffect(() => {
    if (!featureGroupRef.current) return

    featureGroupRef.current.eachLayer((layer) => {
      const featureId = layer.feature?.properties?.id
      if (!featureId || typeof layer.setStyle !== 'function') return

      layer.setStyle(carReferenceStyle(layer.feature, overlapIdSet, selectedLayerKey, selectedDatasetId, overlapLayerKeySet))
    })

  }, [overlapIdSet, overlapLayerKeySet, selectedDatasetId, selectedLayerKey])

  useEffect(() => {
    const requestKey = viewportRequest?.requestKey || viewportRequest?.datasetKey

    if (
      !viewportRequest ||
      !['car-reference', 'car-feature'].includes(viewportRequest.type) ||
      lastViewportRequestRef.current === requestKey
    ) {
      return
    }

    if (viewportRequest.type === 'car-feature' && viewportRequest.featureId) {
      const layerKey = getCarFeatureLayerKey(viewportRequest.datasetKey, viewportRequest.featureId)
      const layer = featureLayersRef.current.get(layerKey) || featureLayersRef.current.get(viewportRequest.featureId)
      const bounds =
        layer?.getBounds?.() ||
        featureBoundsFromGeojson(carGeojson, viewportRequest.datasetKey, viewportRequest.featureId)

      if (bounds?.isValid()) {
        animateToBounds(leafMap, bounds, { maxZoom: 18, duration: 1.45, padding: [72, 72] })
      }

      lastViewportRequestRef.current = requestKey
      return
    }

    const bounds =
      carReferenceDatasetLayerBounds(viewportRequest.datasetKey, featureLayersRef.current) ||
      datasetBounds(carGeojson)
    if (bounds?.isValid()) {
      animateToBounds(leafMap, bounds, { maxZoom: 16, duration: 1.9 })
    }

    lastViewportRequestRef.current = requestKey
  }, [carGeojson, leafMap, viewportRequest])

  return null
}

function PublicCarConsultationLayer({
  consultedCar,
  viewportRequest,
}) {
  const leafMap = useMap()
  const featureGroupRef = useRef(null)
  const lastDatasetKeyRef = useRef(null)
  const lastViewportRequestRef = useRef(null)

  useEffect(() => {
    const featureGroup = L.featureGroup().addTo(leafMap)
    featureGroupRef.current = featureGroup

    return () => {
      featureGroup.remove()
      featureGroupRef.current = null
    }
  }, [leafMap])

  useEffect(() => {
    if (!featureGroupRef.current) return

    const features = consultedCar?.geojson?.features || []
    const environmentalFeatures = consultedCar?.environmentalValidation?.geojson?.features || []
    const nextDatasetKey = [
      consultedCar?.code || 'sem-car',
      consultedCar?.fetchedAt || '',
      features.length,
      environmentalFeatures.length,
      consultedCar?.environmentalValidation?.validatedAt || '',
      consultedCar?.geometrySource || '',
    ].join('|')

    if (lastDatasetKeyRef.current === nextDatasetKey) {
      return
    }

    lastDatasetKeyRef.current = nextDatasetKey
    featureGroupRef.current.clearLayers()

    if (!features.length) return

    if (environmentalFeatures.length) {
      const environmentalLayer = L.geoJSON(consultedCar.environmentalValidation.geojson, {
        pane: 'environmental-reserve',
        style: () => environmentalRestrictionFeatureStyle(false),
        onEachFeature: (feature, layer) => {
          layer.bindPopup(environmentalRestrictionPopupMarkup(feature), CAR_REFERENCE_POPUP_OPTIONS)

          layer.on({
            mouseover(event) {
              event.target.setStyle(environmentalRestrictionFeatureStyle(true))
              event.target.bringToFront()
            },
            mouseout(event) {
              event.target.setStyle(environmentalRestrictionFeatureStyle(false))
            },
            click(event) {
              if (event.originalEvent) {
                L.DomEvent.stop(event.originalEvent)
              }

              layer.openPopup(event.latlng)
            },
          })
        },
      })

      featureGroupRef.current.addLayer(environmentalLayer)
    }

    const publicCarLayer = L.geoJSON(consultedCar.geojson, {
      pane: 'queried-car',
      style: (feature) => publicCarFeatureStyle(feature),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(publicCarPopupMarkup(feature), CAR_REFERENCE_POPUP_OPTIONS)

        layer.on({
          mouseover(event) {
            event.target.setStyle(publicCarFeatureStyle(feature, true))
            event.target.bringToFront()
          },
          mouseout(event) {
            event.target.setStyle(publicCarFeatureStyle(feature, false))
          },
          click(event) {
            if (event.originalEvent) {
              L.DomEvent.stop(event.originalEvent)
            }

            layer.openPopup(event.latlng)
          },
        })
      },
    })

    featureGroupRef.current.addLayer(publicCarLayer)
  }, [consultedCar])

  useEffect(() => {
    const requestKey = viewportRequest?.requestKey

    if (
      !viewportRequest ||
      !['consulted-car', 'consulted-car-environmental'].includes(viewportRequest.type) ||
      lastViewportRequestRef.current === requestKey
    ) {
      return
    }

    const bounds = viewportRequest.type === 'consulted-car-environmental'
      ? datasetBounds(consultedCar?.environmentalValidation?.geojson)
      : datasetBounds(consultedCar?.geojson)
    if (bounds?.isValid()) {
      animateToBounds(leafMap, bounds, { maxZoom: 18, duration: 1.45, padding: [76, 76] })
    }

    lastViewportRequestRef.current = requestKey
  }, [consultedCar, leafMap, viewportRequest])

  return null
}

function PointPopupContent({
  feature,
  coordinate,
  displayIndex = null,
  lat = coordinate?.lat,
  lon = coordinate?.lon,
}) {
  const resolvedDisplayIndex = Number.isInteger(displayIndex)
    ? displayIndex
    : Number.isInteger(coordinate?.index)
      ? coordinate.index - 1
      : null
  const roleLabel = describeCoordinateRole(feature, coordinate, resolvedDisplayIndex)

  return (
    <div className="validation-popup">
      <strong>{feature?.properties?.nome || 'Gleba'}</strong>
      <span>Ponto {coordinate?.index || '-'}</span>
      {roleLabel && <span>{roleLabel}</span>}
      <span>Lat {Number.isFinite(lat) ? lat.toFixed(11) : '-'}</span>
      <span>Lon {Number.isFinite(lon) ? lon.toFixed(11) : '-'}</span>
      <span>{coordinate?.isValid ? 'Coordenada correta' : 'Coordenada com erro'}</span>
      {coordinate?.issues?.map((issue, index) => (
        <span key={`${coordinate?.index || 'point'}-issue-${index}`}>{issue.message}</span>
      ))}
    </div>
  )
}

function GlebaPointMarkersLayer({
  glebas,
  selectedId = null,
  visibleFeatureIds = [],
  pointDisplayMode = 'marked',
  activeVertexReference = null,
  onPointSelect,
  onActiveVertexChange,
  onDragStateChange,
  updateFeatureCoordinates,
  suppressFeatureId = null,
}) {
  const leafMap = useMap()
  const visibleFeatureIdSet = useMemo(() => new Set(visibleFeatureIds), [visibleFeatureIds])
  const dragSessionRef = useRef(null)
  const dragFrameRef = useRef(null)
  const pendingDragLatLngRef = useRef(null)

  const clearDragSession = useCallback(() => {
    if (dragFrameRef.current != null) {
      cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }

    pendingDragLatLngRef.current = null

    const currentSession = dragSessionRef.current
    if (currentSession?.preview) {
      currentSession.preview.group.remove()
    }

    leafMap.off('mousemove', handleMapMouseMove)
    leafMap.off('mouseup', handleMapMouseUp)
    window.removeEventListener('mouseup', handleWindowMouseUp)
    leafMap.dragging.enable()
    dragSessionRef.current = null
  }, [leafMap])

  const handleMapMouseMove = useCallback((event) => {
    const currentSession = dragSessionRef.current
    if (!currentSession) return

    if (!currentSession.didMove) {
      const startPoint = leafMap.latLngToContainerPoint(currentSession.startLatLng)
      const currentPoint = leafMap.latLngToContainerPoint(event.latlng)

      if (startPoint.distanceTo(currentPoint) < DRAG_START_THRESHOLD_PX) {
        return
      }

      currentSession.didMove = true
      currentSession.preview = createVertexDragPreviewLayers(
        leafMap,
        currentSession.feature,
        currentSession.ring,
        currentSession.vertexIndex,
        currentSession.displayIndex
      )
      onDragStateChange?.({
        active: true,
        featureId: currentSession.feature.properties.id,
      })
    }

    pendingDragLatLngRef.current = event.latlng
    if (dragFrameRef.current != null) return

    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null

      const session = dragSessionRef.current
      const nextLatLng = pendingDragLatLngRef.current

      if (!session?.didMove || !session.preview || !nextLatLng) return

      session.ring[session.vertexIndex] = [nextLatLng.lng, nextLatLng.lat]
      updateVertexDragPreviewLayers(
        session.preview,
        session.feature,
        session.vertexIndex,
        session.ring
      )
    })
  }, [leafMap, onDragStateChange])

  const finishDragSession = useCallback(async () => {
    const currentSession = dragSessionRef.current
    const finalRing = currentSession?.didMove
      ? currentSession.ring.map((coordinate) => [...coordinate])
      : null

    clearDragSession()
    onDragStateChange?.({
      active: false,
      featureId: currentSession?.feature?.properties?.id || null,
    })

    if (!currentSession?.feature?.properties?.id || !finalRing) {
      return
    }

    await updateFeatureCoordinates?.(currentSession.feature.properties.id, finalRing, { select: true })
  }, [clearDragSession, onDragStateChange, updateFeatureCoordinates])

  const handleMapMouseUp = useCallback(() => {
    finishDragSession()
  }, [finishDragSession])

  const handleWindowMouseUp = useCallback(() => {
    finishDragSession()
  }, [finishDragSession])

  useEffect(() => () => {
    clearDragSession()
    onDragStateChange?.({
      active: false,
      featureId: null,
    })
  }, [clearDragSession, onDragStateChange])

  const featuresToRender = (glebas?.features || []).filter((feature) => {
    const featureId = feature.properties?.id
    if (!featureId) return false
    if (selectedId && featureId === selectedId) return false
    if (suppressFeatureId && featureId === suppressFeatureId) return false
    return visibleFeatureIdSet.has(featureId)
  })

  return (
    <>
      {featuresToRender.flatMap((feature) => {
        const coordinateStatuses = feature.properties?.coordinateStatuses || []
        const visibleIndexes = new Set(
          getVisibleCoordinateIndexes({
            coordinates: coordinateStatuses,
            coordinateStatuses,
            pointDisplayMode,
          })
        )
        const activeDisplayIndex =
          activeVertexReference?.featureId === feature.properties.id
            ? activeVertexReference.displayIndex
            : null

        return sortMarkerDescriptors(
          coordinateStatuses
          .map((coordinate, index) => ({
            coordinate,
            displayIndex: index,
            editableVertexIndex: resolveEditableVertexIndex(feature, index),
          }))
          .filter(({ displayIndex }) => visibleIndexes.has(displayIndex)),
          activeDisplayIndex
        ).map(({ coordinate, displayIndex, editableVertexIndex }) => {
            const markerRole = resolveCoordinateRole(feature, displayIndex, coordinate)
            const markerStyle = getVertexMarkerStyle(
              coordinate,
              activeDisplayIndex === displayIndex,
              markerRole
            )

            return (
              <CircleMarker
                key={`${feature.properties.id}-global-${coordinate.index}`}
                center={[coordinate.lat, coordinate.lon]}
                pane="gleba-points"
                radius={markerStyle.radius}
                bubblingMouseEvents={false}
                pathOptions={{
                  ...markerStyle.pathOptions,
                  className: buildMarkerClassName(
                    'gleba-point-handle',
                    markerRole,
                    activeDisplayIndex === displayIndex
                  ),
                }}
                eventHandlers={{
                  mousedown(event) {
                    clearDragSession()
                    L.DomEvent.stop(event.originalEvent)
                    if (!Number.isInteger(editableVertexIndex)) return
                    onActiveVertexChange?.(
                      buildActiveVertexReference(
                        feature.properties.id,
                        displayIndex,
                        editableVertexIndex
                      )
                    )

                    dragSessionRef.current = {
                      didMove: false,
                      feature,
                      ring: getEditableCoordinates(feature).map((currentCoordinate) => [...currentCoordinate]),
                      startLatLng: event.latlng,
                      displayIndex,
                      vertexIndex: editableVertexIndex,
                      preview: null,
                    }

                    leafMap.dragging.disable()
                    leafMap.on('mousemove', handleMapMouseMove)
                    leafMap.on('mouseup', handleMapMouseUp)
                    window.addEventListener('mouseup', handleWindowMouseUp)
                  },
                  click() {
                    onPointSelect?.(
                      feature,
                      buildActiveVertexReference(
                        feature.properties.id,
                        displayIndex,
                        editableVertexIndex
                      )
                    )
                  },
                }}
              >
                <Popup {...PERSISTENT_POPUP_OPTIONS}>
                  <PointPopupContent
                    feature={feature}
                    coordinate={coordinate}
                    displayIndex={displayIndex}
                  />
                </Popup>
              </CircleMarker>
            )
          })
      })}
    </>
  )
}

function SelectedGlebaVerticesPreview({
  selectedGleba,
  previewCoordinates = null,
  activeVertexIndex = null,
  pointDisplayMode = 'marked',
  showPointMarkers = true,
}) {
  if (!selectedGleba?.properties?.coordinateStatuses?.length) return null

  const displayCoordinates =
    previewCoordinates
      ? ensureClosedCoordinateRing(previewCoordinates)
      : selectedGleba.properties.displayCoordinates ||
    selectedGleba.geometry?.coordinates?.[0] ||
    []
  const coordinateStatuses = previewCoordinates
    ? selectedGleba.properties.coordinateStatuses.map((coordinate, index) => ({
        ...coordinate,
        lat: previewCoordinates[index]?.[1] ?? coordinate.lat,
        lon: previewCoordinates[index]?.[0] ?? coordinate.lon,
      }))
    : selectedGleba.properties.coordinateStatuses
  const selfOverlapSegments = selectedGleba.properties.validationMetrics?.selfOverlapSegments || []
  const visibleIndexes = new Set(
    getVisibleCoordinateIndexes({
      coordinates: coordinateStatuses,
      coordinateStatuses,
      pointDisplayMode,
    })
  )

  return (
    <>
      {selectedGleba.properties.status === 'invalida' && selectedGleba.properties.originalCoordinates?.length > 1 && (
        <Polyline
          positions={selectedGleba.properties.originalCoordinates.map(([lon, lat]) => [lat, lon])}
          pathOptions={{
            color: '#fca5a5',
            weight: 2,
            dashArray: '8 6',
            opacity: 0.95,
          }}
        />
      )}

      <Polyline
        positions={displayCoordinates.map(([lon, lat]) => [lat, lon])}
        pathOptions={{
          color: '#f8fafc',
          weight: 1.5,
          dashArray: '3 6',
          opacity: 0.65,
        }}
      />

      {selfOverlapSegments.map((segment, index) => (
        <Polyline
          key={`${selectedGleba.properties.id}-overlap-${index}`}
          positions={segment.map(([lon, lat]) => [lat, lon])}
          pathOptions={{
            color: '#f97316',
            weight: 7,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      ))}

      {showPointMarkers && coordinateStatuses
        .map((coordinate, index) => ({ coordinate, index }))
        .filter(({ index }) => visibleIndexes.has(index))
        .map(({ coordinate, index }) => {
          const markerRole = resolveCoordinateRole(selectedGleba, index, coordinate)
          const markerStyle = getVertexMarkerStyle(
            coordinate,
            activeVertexIndex === index,
            markerRole
          )

          return (
        <CircleMarker
          key={`${selectedGleba.properties.id}-${coordinate.index}`}
          center={[coordinate.lat, coordinate.lon]}
          pane="selected-vertices"
          bubblingMouseEvents={false}
          radius={markerStyle.radius}
          pathOptions={{
            ...markerStyle.pathOptions,
            className: buildMarkerClassName(
              'gleba-point-handle',
              markerRole,
              activeVertexIndex === index
            ),
          }}
      >
          <Popup {...PERSISTENT_POPUP_OPTIONS}>
            <PointPopupContent
              feature={selectedGleba}
              coordinate={coordinate}
              displayIndex={index}
            />
          </Popup>
        </CircleMarker>
          )
        })}
    </>
  )
}

function EditableSelectedGleba({
  selectedGleba,
  updateSelectedGlebaCoordinates,
  pointDisplayMode = 'marked',
  activeVertexReference = null,
  requestedVertexActivation = null,
  onRequestedVertexActivationApplied,
  draggingFeatureId = null,
  onActiveVertexChange,
  onDragStateChange,
}) {
  const leafMap = useMap()
  const [activeVertexIndex, setActiveVertexIndex] = useState(null)
  const selectedGlebaRef = useRef(selectedGleba)
  const dragRingRef = useRef(null)
  const dragVertexIndexRef = useRef(null)
  const dragDisplayIndexRef = useRef(null)
  const imperativePreviewRef = useRef(null)
  const dragFrameRef = useRef(null)
  const pendingDragLatLngRef = useRef(null)

  useEffect(() => {
    selectedGlebaRef.current = selectedGleba
  }, [selectedGleba])

  useEffect(() => {
    setActiveVertexIndex(null)
  }, [selectedGleba?.properties?.id])

  useEffect(() => {
    if (activeVertexReference?.featureId !== selectedGleba?.properties?.id) {
      setActiveVertexIndex(null)
      return
    }

    setActiveVertexIndex(
      Number.isInteger(activeVertexReference?.vertexIndex)
        ? activeVertexReference.vertexIndex
        : null
    )
  }, [activeVertexReference, selectedGleba?.properties?.id])

  useEffect(() => {
    if (!requestedVertexActivation || !selectedGleba?.properties?.id) return
    if (requestedVertexActivation.featureId !== selectedGleba.properties.id) return

    const editableCoordinates = getEditableCoordinates(selectedGleba)
    const nextVertexIndex = requestedVertexActivation.vertexIndex

    if (
      Number.isInteger(nextVertexIndex) &&
      nextVertexIndex >= 0 &&
      nextVertexIndex < editableCoordinates.length
    ) {
      setActiveVertexIndex(nextVertexIndex)
    }

    onRequestedVertexActivationApplied?.(requestedVertexActivation.requestKey)
  }, [
    onRequestedVertexActivationApplied,
    requestedVertexActivation,
    selectedGleba,
  ])

  const removeImperativePreview = () => {
    if (dragFrameRef.current != null) {
      cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }
    pendingDragLatLngRef.current = null
    if (imperativePreviewRef.current) {
      imperativePreviewRef.current.group.remove()
      imperativePreviewRef.current = null
    }
    dragRingRef.current = null
    dragVertexIndexRef.current = null
    dragDisplayIndexRef.current = null
  }

  useEffect(() => {
    if (!selectedGleba) {
      removeImperativePreview()
      leafMap.dragging.enable()
      setActiveVertexIndex(null)
      onDragStateChange?.({
        active: false,
        featureId: null,
      })
    }

    return () => {
      if (dragFrameRef.current != null) {
        cancelAnimationFrame(dragFrameRef.current)
        dragFrameRef.current = null
      }
      pendingDragLatLngRef.current = null
      if (imperativePreviewRef.current) {
        imperativePreviewRef.current.group.remove()
        imperativePreviewRef.current = null
      }
      dragRingRef.current = null
      dragVertexIndexRef.current = null
      dragDisplayIndexRef.current = null
      leafMap.dragging.enable()
      onDragStateChange?.({
        active: false,
        featureId: null,
      })
    }
  }, [leafMap, onDragStateChange, selectedGleba])

  if (!selectedGleba) return null

  const editableCoordinates = getEditableCoordinates(selectedGleba)
  const coordinateStatuses = selectedGleba.properties.coordinateStatuses || []
  const visibleIndexes = new Set(
    getVisibleCoordinateIndexes({
      coordinates: pointDisplayMode === 'validated' ? coordinateStatuses : editableCoordinates,
      coordinateStatuses,
      pointDisplayMode,
    })
  )

  if (!editableCoordinates.length) return null

  const isDraggingSelectedFeature = draggingFeatureId === selectedGleba.properties.id
  const showEditableMarkers = !isDraggingSelectedFeature
  const activeDisplayIndex =
    activeVertexReference?.featureId === selectedGleba.properties.id
      ? activeVertexReference.displayIndex
      : null
  const markerDescriptors = pointDisplayMode === 'validated'
    ? coordinateStatuses
      .map((coordinate, index) => ({
        coordinate,
        displayIndex: index,
        editableVertexIndex: resolveEditableVertexIndex(selectedGleba, index),
        lat: coordinate.lat,
        lon: coordinate.lon,
      }))
      .filter(({ editableVertexIndex }) => Number.isInteger(editableVertexIndex))
    : editableCoordinates.map((coordinate, index) => ({
      coordinate: coordinateStatuses[index] || {
        index: index + 1,
        isValid: true,
        lat: coordinate[1],
        lon: coordinate[0],
      },
      displayIndex: index,
      editableVertexIndex: index,
      lat: coordinate[1],
        lon: coordinate[0],
      }))
  const orderedMarkerDescriptors = sortMarkerDescriptors(
    markerDescriptors.filter(({ displayIndex }) => visibleIndexes.has(displayIndex)),
    activeDisplayIndex
  )

  // The selected gleba uses the same lightweight manual drag flow as the global points.
  const handleMapMouseMove = (event) => {
    const ring = dragRingRef.current
    const vertexIndex = dragVertexIndexRef.current
    const displayIndex = dragDisplayIndexRef.current

    if (!ring || vertexIndex === null) return

    if (!imperativePreviewRef.current) {
      const startPoint = leafMap.latLngToContainerPoint([
        ring[vertexIndex][1],
        ring[vertexIndex][0],
      ])
      const currentPoint = leafMap.latLngToContainerPoint(event.latlng)

      if (startPoint.distanceTo(currentPoint) < DRAG_START_THRESHOLD_PX) {
        return
      }

      imperativePreviewRef.current = createVertexDragPreviewLayers(
        leafMap,
        selectedGlebaRef.current,
        ring,
        vertexIndex,
        displayIndex
      )
      setActiveVertexIndex(vertexIndex)
      onActiveVertexChange?.(
        buildActiveVertexReference(
          selectedGlebaRef.current?.properties?.id || null,
          displayIndex,
          vertexIndex
        )
      )
      onDragStateChange?.({
        active: true,
        featureId: selectedGlebaRef.current?.properties?.id || null,
      })
    }

    pendingDragLatLngRef.current = event.latlng
    if (dragFrameRef.current != null) return

    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null

      const nextLatLng = pendingDragLatLngRef.current
      const nextRing = dragRingRef.current
      const nextVertexIndex = dragVertexIndexRef.current
      const preview = imperativePreviewRef.current

      if (!nextLatLng || !nextRing || nextVertexIndex === null || !preview) return

      nextRing[nextVertexIndex] = [nextLatLng.lng, nextLatLng.lat]
      updateVertexDragPreviewLayers(
        preview,
        selectedGlebaRef.current,
        nextVertexIndex,
        nextRing
      )
    })
  }

  const finishDragSession = async () => {
    const ring = dragRingRef.current
    const vertexIndex = dragVertexIndexRef.current
    const finalRing = imperativePreviewRef.current && ring && vertexIndex !== null
      ? ring.map((coordinate) => [...coordinate])
      : null

    removeImperativePreview()
    setActiveVertexIndex(null)
    onDragStateChange?.({
      active: false,
      featureId: selectedGlebaRef.current?.properties?.id || null,
    })
    leafMap.dragging.enable()
    leafMap.off('mousemove', handleMapMouseMove)
    leafMap.off('mouseup', finishDragSession)
    window.removeEventListener('mouseup', finishDragSession)

    if (finalRing) {
      await updateSelectedGlebaCoordinates(finalRing)
    }
  }

  return (
    <>
      {!isDraggingSelectedFeature && activeVertexIndex === null && (
        <SelectedGlebaVerticesPreview
          selectedGleba={selectedGleba}
          pointDisplayMode={pointDisplayMode}
          showPointMarkers={!showEditableMarkers}
        />
      )}

      {showEditableMarkers && orderedMarkerDescriptors
        .map((descriptor) => {
          const {
            coordinate,
            displayIndex,
            editableVertexIndex,
            lat,
            lon,
          } = descriptor
          const coincidentDescriptors = getCoincidentMarkerDescriptors(
            orderedMarkerDescriptors,
            descriptor
          )
          const markerRole = resolveCoordinateRole(selectedGleba, displayIndex, coordinate)
          const useDistinctStartClosureHandle = markerRole !== 'default'
          const hasCoincidentDescriptors = coincidentDescriptors.length > 1
          const topCoincidentDisplayIndex = hasCoincidentDescriptors
            ? coincidentDescriptors[coincidentDescriptors.length - 1]?.displayIndex
            : null
          const isTopCoincidentMarker = topCoincidentDisplayIndex === displayIndex
          const isMarkerActive = Number.isInteger(activeDisplayIndex)
            ? activeDisplayIndex === displayIndex
            : activeVertexIndex === editableVertexIndex
          const markerStyle = useDistinctStartClosureHandle
            ? getEditableVertexPathOptions(coordinate, isMarkerActive, markerRole)
            : hasCoincidentDescriptors && !isTopCoincidentMarker
              ? getCompanionVertexPathOptions(coordinate)
              : getEditableVertexPathOptions(coordinate, isMarkerActive)
          const nextCoincidentDescriptor = !useDistinctStartClosureHandle && isMarkerActive
            ? getNextCoincidentMarkerDescriptor(orderedMarkerDescriptors, descriptor)
            : null

          return (
        <CircleMarker
          key={`${selectedGleba.properties.id}-edit-${displayIndex}`}
          center={[lat, lon]}
          pane="selected-vertices"
          bubblingMouseEvents={false}
          radius={markerStyle.radius}
          pathOptions={markerStyle.pathOptions}
          eventHandlers={{
            click() {
              // Generic coincident points can still cycle when they share the same coordinate.
              if (isMarkerActive && nextCoincidentDescriptor) {
                setActiveVertexIndex(nextCoincidentDescriptor.editableVertexIndex)
                onActiveVertexChange?.(
                  buildActiveVertexReference(
                    selectedGleba.properties.id,
                    nextCoincidentDescriptor.displayIndex,
                    nextCoincidentDescriptor.editableVertexIndex
                  )
                )
                return
              }

              if (isMarkerActive) {
                setActiveVertexIndex(null)
                onActiveVertexChange?.(null)
                return
              }

              setActiveVertexIndex(editableVertexIndex)
              onActiveVertexChange?.(
                buildActiveVertexReference(
                  selectedGleba.properties.id,
                  displayIndex,
                  editableVertexIndex
                )
              )
            },
            mousedown(event) {
              removeImperativePreview()
              const ring = getEditableCoordinates(selectedGlebaRef.current).map((c) => [...c])
              dragRingRef.current = ring
              dragVertexIndexRef.current = editableVertexIndex
              dragDisplayIndexRef.current = displayIndex
              pendingDragLatLngRef.current = null
              L.DomEvent.stop(event.originalEvent)
              setActiveVertexIndex(editableVertexIndex)
              onActiveVertexChange?.(
                buildActiveVertexReference(
                  selectedGleba.properties.id,
                  displayIndex,
                  editableVertexIndex
                )
              )
              leafMap.dragging.disable()
              leafMap.on('mousemove', handleMapMouseMove)
              leafMap.on('mouseup', finishDragSession)
              window.addEventListener('mouseup', finishDragSession)
            },
          }}
        >
          <Popup {...PERSISTENT_POPUP_OPTIONS}>
            <PointPopupContent
              feature={selectedGleba}
              coordinate={coordinate}
              displayIndex={displayIndex}
              lat={lat}
              lon={lon}
            />
          </Popup>
        </CircleMarker>
          )
        })}
    </>
  )
}

function ValidationPointMarker({ queryPoint }) {
  if (!queryPoint) return null

  return (
    <CircleMarker
      center={[queryPoint.lat, queryPoint.lon]}
      radius={9}
      pathOptions={{
        color: '#f8fafc',
        weight: 2,
        fillColor: '#38bdf8',
        fillOpacity: 0.95,
      }}
    >
      <Popup {...PERSISTENT_POPUP_OPTIONS}>
        <div className="validation-popup">
          <strong>Coordenada consultada</strong>
          <span>Lat {queryPoint.lat.toFixed(6)}</span>
          <span>Lon {queryPoint.lon.toFixed(6)}</span>
        </div>
      </Popup>
    </CircleMarker>
  )
}

function IconGlobeLayers() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 5.2a10.7 10.7 0 1 0 0 21.4" />
      <path d="M14.7 5.2c-3.1 2.9-4.8 6.6-4.8 10.7s1.7 7.7 4.8 10.7" />
      <path d="M14.7 5.2c2.7 2.6 4.2 5.6 4.6 9.2" />
      <path d="M5.2 15.9h17.5" />
      <path d="M6.9 10.5h14.4" />
      <path d="M6.9 21.3h9.2" />
      <path d="m22.2 17.3 5.3 2.7-5.3 2.7-5.3-2.7 5.3-2.7Z" />
      <path d="m16.9 23.3 5.3 2.7 5.3-2.7" />
    </svg>
  )
}

function MapLayerSwitcher({ activeBasemap, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const controlRef = useRef(null)
  const basemapOptions = useMemo(() => Object.values(BASEMAPS), [])
  const activeBasemapConfig = BASEMAPS[activeBasemap] || BASEMAPS.dark

  const focusMenuItem = useCallback((targetIndex) => {
    window.requestAnimationFrame(() => {
      const items = Array.from(controlRef.current?.querySelectorAll('.basemap-control__option') || [])
      items[targetIndex]?.focus()
    })
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        controlRef.current?.querySelector('.basemap-control__trigger')?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleTriggerKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

    event.preventDefault()
    const activeIndex = Math.max(0, basemapOptions.findIndex((basemap) => basemap.key === activeBasemap))
    const targetIndex = event.key === 'ArrowUp' ? basemapOptions.length - 1 : activeIndex
    setIsOpen(true)
    focusMenuItem(targetIndex)
  }

  const handleMenuKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

    event.preventDefault()
    const items = Array.from(controlRef.current?.querySelectorAll('.basemap-control__option') || [])
    if (!items.length) return

    const currentIndex = items.indexOf(document.activeElement)
    const lastIndex = items.length - 1
    let nextIndex = currentIndex

    if (event.key === 'ArrowDown') nextIndex = currentIndex >= lastIndex ? 0 : currentIndex + 1
    if (event.key === 'ArrowUp') nextIndex = currentIndex <= 0 ? lastIndex : currentIndex - 1
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = lastIndex

    items[nextIndex]?.focus()
  }

  const handleSelect = (basemapKey) => {
    onChange(basemapKey)
  }

  return (
    <div ref={controlRef} className={`basemap-control${isOpen ? ' is-open' : ''}`} role="group" aria-label="Base do mapa">
      <button
        type="button"
        className={`basemap-control__trigger basemap-control__trigger--${activeBasemap}`}
        aria-label={`Selecionar base do mapa. Atual: ${activeBasemapConfig.label}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={`Base atual: ${activeBasemapConfig.label}`}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="basemap-control__trigger-icon" aria-hidden="true">
          <IconGlobeLayers />
        </span>
      </button>

      {isOpen && (
        <div className="basemap-control__menu" role="menu" aria-label="Selecionar base do mapa" onKeyDown={handleMenuKeyDown}>
          {basemapOptions.map((basemap) => {
            const isActive = activeBasemap === basemap.key

            return (
              <button
                key={basemap.key}
                type="button"
                className={`basemap-control__option${isActive ? ' is-active' : ''}`}
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => handleSelect(basemap.key)}
              >
                <span className={`basemap-control__thumb basemap-control__thumb--${basemap.key}`} aria-hidden="true" />
                <span className="basemap-control__label">{basemap.label}</span>
                <span className="basemap-control__option-check" aria-hidden="true" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function IconLayerStack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 17 8 4 8-4" />
    </svg>
  )
}

function IcmbioLayerControl({ activeLayerKeys = [], isCollapsed, onChange, onToggleCollapsed }) {
  const activeLayerKeySet = useMemo(
    () => new Set(activeLayerKeys),
    [activeLayerKeys]
  )
  const activeLayers = useMemo(
    () => activeLayerKeys.map((layerKey) => ICMBIO_WMS_LAYER_MAP.get(layerKey)).filter(Boolean),
    [activeLayerKeys]
  )
  const activeLayerSummary = activeLayers.map((layer) => layer.label).join(' + ')
  const legendItems = useMemo(() => {
    const seen = new Set()

    return activeLayers.flatMap((layer) => layer.legend || []).filter((item) => {
      const key = `${item.label}-${item.color}-${item.borderColor || ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [activeLayers])
  const activeLayerCount = activeLayers.length

  return (
    <div className={`icmbio-layer-control${isCollapsed ? ' is-collapsed' : ''}`} role="group" aria-label="Camadas ICMBio">
      <div className="icmbio-layer-control__header">
        {isCollapsed ? (
          <button
            type="button"
            className="icmbio-layer-control__collapsed-trigger"
            aria-expanded={false}
            aria-label="Expandir Analise Territorial"
            title="Expandir Analise Territorial"
            onClick={onToggleCollapsed}
          >
            <span className="icmbio-layer-control__stack-icon" aria-hidden="true">
              <IconLayerStack />
            </span>
            {activeLayerCount > 0 && (
              <span className="icmbio-layer-control__collapsed-count" aria-hidden="true">
                {activeLayerCount}
              </span>
            )}
          </button>
        ) : (
          <>
            <span className="icmbio-layer-control__stack-icon" aria-hidden="true">
              <IconLayerStack />
            </span>
            <span className="icmbio-layer-control__title-block">
              <span className="icmbio-layer-control__title" title={'An\u00e1lise Territorial'}>
                {'An\u00e1lise Territorial'}
              </span>
              {activeLayerCount > 0 && (
                <span className="icmbio-layer-control__active-summary" title={activeLayerSummary}>
                  {activeLayerSummary}
                </span>
              )}
            </span>
            {activeLayerCount > 0 && (
              <span className="icmbio-layer-control__mode">
                {activeLayerCount}
              </span>
            )}
            <button
              type="button"
              className="icmbio-layer-control__toggle"
              aria-expanded
              aria-label="Esconder camadas ICMBio"
              title="Esconder camadas ICMBio"
              onClick={onToggleCollapsed}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </>
        )}
      </div>
      {!isCollapsed && (
        <div className="icmbio-layer-control__content">
          {ICMBIO_LAYER_CONTROL_GROUPS.map((group) => (
            <section key={group.title} className="icmbio-layer-control__section">
              <div className="icmbio-layer-control__section-title">{group.title}</div>
              <div className="icmbio-layer-control__switch-list">
                {group.items.map((item) => {
                  const layer = ICMBIO_WMS_LAYER_MAP.get(item.layerKey)
                  if (!layer) return null

                  const isActive = activeLayerKeySet.has(item.layerKey)

                  return (
                    <button
                      key={item.layerKey}
                      type="button"
                      title={layer.title}
                      className={`icmbio-layer-control__switch-row${isActive ? ' is-active' : ''}`}
                      aria-pressed={isActive}
                      onClick={() => onChange(item.layerKey)}
                    >
                      <span className="icmbio-layer-control__switch-label">
                        <span
                          className="icmbio-layer-control__swatch"
                          style={{ background: item.swatch }}
                          aria-hidden="true"
                        />
                        <span>{item.label}</span>
                      </span>
                      <span className="icmbio-layer-control__switch" aria-hidden="true">
                        <span className="icmbio-layer-control__switch-thumb" />
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          {activeLayerCount > 0 && (
            <button
              type="button"
              className="icmbio-layer-control__clear"
              onClick={() => onChange(null)}
            >
              Limpar camadas
            </button>
          )}
          {legendItems.length > 0 && (
            <div className="icmbio-layer-control__legend">
              <div className="icmbio-layer-control__legend-title">Legenda</div>
              {legendItems.map((item, index) => (
                <div
                  key={`${item.label}-${index}`}
                  className="icmbio-layer-control__legend-item"
                >
                  <span
                    className="icmbio-layer-control__legend-swatch"
                    style={{
                      background: item.color,
                      borderColor: item.borderColor || item.color,
                    }}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function getReferencePresentation(feature) {
  const properties = feature?.properties || {}
  const sourceType = String(
    properties.__carDatasetSourceType ||
    properties.sourceType ||
    ''
  ).toLowerCase()
  const fileName = String(
    properties.__carDatasetName ||
    properties.origem_arquivo ||
    ''
  ).toLowerCase()
  const isKml =
    sourceType.includes('kml') ||
    sourceType.includes('kmz') ||
    fileName.endsWith('.kml') ||
    fileName.endsWith('.kmz')

  return isKml
    ? {
        type: 'KML',
        popupTitle: 'Área do KML',
        identifierLabel: 'Identificação KML',
        fileLabel: fileName.endsWith('.kmz') ? 'Arquivo KMZ' : 'Arquivo KML',
      }
    : {
        type: 'CAR',
        popupTitle: 'Imóvel do CAR',
        identifierLabel: 'Nº do CAR',
        fileLabel: 'Arquivo CAR/SHP',
      }
}

function shouldShowDetailedMapForViewport(viewportRequest) {
  if (!viewportRequest) return false

  return [
    'dataset',
    'feature',
    'feature-set',
    'point',
    'car-reference',
    'car-feature',
    'consulted-car',
    'consulted-car-environmental',
  ].includes(viewportRequest.type)
}

export default function MapView({
  glebas,
  carReferenceDataset,
  carReferenceDatasets = [],
  activeCarReferenceDatasetId = null,
  selectedCarReferenceFeatureId = null,
  onSelectCarReferenceFeature,
  selectedGleba,
  setSelectedGleba,
  activeVertexReference,
  onActiveVertexChange,
  queryPoint,
  matchedFeatureIds = [],
  visibleFeatureIds = [],
  viewportRequest,
  updateFeatureCoordinates,
  updateSelectedGlebaCoordinates,
  layoutRevision = 0,
  pointDisplayMode = 'marked',
  consultedCar = null,
}) {
  const selectedId = selectedGleba?.properties?.id
  const [draggingFeatureId, setDraggingFeatureId] = useState(null)
  const [activeBasemap, setActiveBasemap] = useState('satellite')
  const [activeIcmbioLayerKeys, setActiveIcmbioLayerKeys] = useState([])
  const [isIcmbioControlCollapsed, setIsIcmbioControlCollapsed] = useState(true)
  const [satelliteSourceIndex, setSatelliteSourceIndex] = useState(0)
  const [requestedVertexActivation, setRequestedVertexActivation] = useState(null)
  const [mapZoom, setMapZoom] = useState(BRAZIL_ZOOM)
  const [isIntroActive, setIsIntroActive] = useState(true)
  const [isStartupGlobePinned, setIsStartupGlobePinned] = useState(true)
  const isGlobalGlobeMode = mapZoom <= 3
  const isGlobeVisible = isStartupGlobePinned || isIntroActive || isGlobalGlobeMode
  const selectedCarOverlapIds = useMemo(
    () => selectedGleba?.properties?.carOverlapValidation?.overlaps?.map((overlap) => overlap.id).filter(Boolean) || [],
    [selectedGleba]
  )
  const selectedCarOverlapLayerKeys = useMemo(
    () => selectedGleba?.properties?.carOverlapValidation?.overlaps
      ?.map((overlap) => overlap.layerKey || getCarFeatureLayerKey(overlap.datasetId, overlap.id))
      .filter(Boolean) || [],
    [selectedGleba]
  )
  const carReferenceMapGeojson = useMemo(
    () => buildCarReferenceMapGeojson(carReferenceDatasets),
    [carReferenceDatasets]
  )
  const carReferenceFeatureCount = carReferenceMapGeojson.features?.length || 0
  const shouldRenderGlobe =
    isGlobeVisible && carReferenceFeatureCount <= GLOBE_CAR_FEATURE_LIMIT
  const carReferenceMapKey = useMemo(
    () => carReferenceDatasets.map((dataset) => dataset.datasetId).join('|'),
    [carReferenceDatasets]
  )
  const activeIcmbioLayers = useMemo(
    () => activeIcmbioLayerKeys.map((layerKey) => ICMBIO_WMS_LAYER_MAP.get(layerKey)).filter(Boolean),
    [activeIcmbioLayerKeys]
  )
  const activeIcmbioWmsLayers = activeIcmbioLayers
  const activeIcmbioFeatureInfoLayer = useMemo(
    () => activeIcmbioWmsLayers[activeIcmbioWmsLayers.length - 1] || null,
    [activeIcmbioWmsLayers]
  )
  const hasActiveIcmbioLayer = activeIcmbioLayers.length > 0

  const handlePointMarkerSelect = useCallback((feature, pointReference) => {
    setSelectedGleba(feature)
    onActiveVertexChange?.(
      pointReference || buildActiveVertexReference(feature?.properties?.id || null, null, null)
    )

    if (!feature?.properties?.id || !Number.isInteger(pointReference?.vertexIndex)) {
      setRequestedVertexActivation(null)
      return
    }

    setRequestedVertexActivation({
      featureId: feature.properties.id,
      vertexIndex: pointReference.vertexIndex,
      requestKey: `${feature.properties.id}-${pointReference.vertexIndex}-${Date.now()}`,
    })
  }, [onActiveVertexChange, setSelectedGleba])

  const handleRequestedVertexActivationApplied = useCallback((requestKey) => {
    setRequestedVertexActivation((currentRequest) => (
      currentRequest?.requestKey === requestKey ? null : currentRequest
    ))
  }, [])

  const handleDragStateChange = useCallback((nextState) => {
    setDraggingFeatureId(nextState?.active ? nextState.featureId || null : null)
  }, [])

  const completeIntroOnGlobe = useCallback(() => {
    setIsIntroActive(false)
    setIsStartupGlobePinned(true)
  }, [])

  const skipIntro = useCallback(() => {
    completeIntroOnGlobe()
  }, [completeIntroOnGlobe])

  const finishIntro = useCallback(() => {
    completeIntroOnGlobe()
  }, [completeIntroOnGlobe])

  const handleBasemapChange = useCallback((nextBasemap) => {
    setIsIntroActive(false)
    setActiveBasemap(nextBasemap)
  }, [])

  const handleIcmbioLayerChange = useCallback((nextLayerKey) => {
    if (!nextLayerKey) {
      setActiveIcmbioLayerKeys([])
      return
    }

    setActiveIcmbioLayerKeys((currentLayerKeys) => (
      currentLayerKeys.includes(nextLayerKey)
        ? currentLayerKeys.filter((layerKey) => layerKey !== nextLayerKey)
        : [...currentLayerKeys, nextLayerKey]
    ))

    if (nextLayerKey) {
      setIsIntroActive(false)
      setIsStartupGlobePinned(false)
    }
  }, [])

  const handleIcmbioControlToggle = useCallback(() => {
    setIsIcmbioControlCollapsed((current) => !current)
  }, [])

  useEffect(() => {
    if (selectedGleba?.properties?.id) {
      return
    }

    onActiveVertexChange?.(null)
  }, [onActiveVertexChange, selectedGleba])

  useEffect(() => {
    if (activeBasemap !== 'satellite') return
    setSatelliteSourceIndex(0)
  }, [activeBasemap])

  useEffect(() => {
    if (!viewportRequest) return

    if (shouldShowDetailedMapForViewport(viewportRequest)) {
      setIsIntroActive(false)
      setIsStartupGlobePinned(false)
      return
    }

    if (viewportRequest.type === 'home') {
      setIsIntroActive(false)
      setIsStartupGlobePinned(true)
    }
  }, [viewportRequest])

  const currentBasemap = useMemo(() => {
    if (activeBasemap !== 'satellite') {
      return BASEMAPS.dark
    }

    const satelliteSources = BASEMAPS.satellite.sources || []
    return satelliteSources[satelliteSourceIndex] || satelliteSources[0]
  }, [activeBasemap, satelliteSourceIndex])

  const handleTileError = () => {
    if (activeBasemap !== 'satellite') return

    const satelliteSources = BASEMAPS.satellite.sources || []
    setSatelliteSourceIndex((current) => (
      current < satelliteSources.length - 1 ? current + 1 : current
    ))
  }

  const handleCarReferenceFeatureSelect = useCallback((datasetId, featureId, options = {}) => {
    if (!datasetId || !featureId) return
    onSelectCarReferenceFeature?.(datasetId, featureId, options)
  }, [onSelectCarReferenceFeature])

  return (
    <div className={`map-wrapper${shouldRenderGlobe ? ' map-wrapper--globe' : ''}${isIntroActive && shouldRenderGlobe ? ' map-wrapper--intro' : ''}${hasActiveIcmbioLayer ? ' map-wrapper--icmbio' : ''}${isIcmbioControlCollapsed ? '' : ' map-wrapper--icmbio-control-expanded'}`}>
      <MapLayerSwitcher
        activeBasemap={activeBasemap}
        onChange={handleBasemapChange}
      />
      <IcmbioLayerControl
        activeLayerKeys={activeIcmbioLayerKeys}
        isCollapsed={isIcmbioControlCollapsed}
        onChange={handleIcmbioLayerChange}
        onToggleCollapsed={handleIcmbioControlToggle}
      />

      <MapContainer
        center={BRAZIL_CENTER}
        zoom={BRAZIL_ZOOM}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        doubleClickZoom={false}
        closePopupOnClick={false}
      >
        <MapInvalidateOnLayout revision={layoutRevision} />
        <MapInvalidateOnContainerResize />
        <MapZoomTracker onZoomChange={setMapZoom} />
        <IcmbioFeatureInfoHandler activeLayer={activeIcmbioFeatureInfoLayer} />
        <Pane name="icmbio-wms" style={{ zIndex: 345 }} />
        <Pane name="car-reference" style={{ zIndex: 360 }} />
        <Pane name="environmental-reserve" style={{ zIndex: 425 }} />
        <Pane name="queried-car" style={{ zIndex: 430 }} />
        <Pane name="gleba-layer" style={{ zIndex: 460 }} />
        <Pane name="gleba-points" style={{ zIndex: 620 }} />
        <Pane name="selected-vertices" style={{ zIndex: 650 }} />

        {currentBasemap && (
          <TileLayer
            key={`${activeBasemap}-${currentBasemap.key}`}
            attribution={currentBasemap.attribution}
            url={currentBasemap.url}
            subdomains={currentBasemap.subdomains}
            maxZoom={currentBasemap.maxZoom}
            eventHandlers={{
              tileerror: handleTileError,
            }}
          />
        )}

        {activeBasemap === 'satellite' && BASEMAPS.satellite.labels && (
          <TileLayer
            key={BASEMAPS.satellite.labels.key}
            attribution={BASEMAPS.satellite.labels.attribution}
            url={BASEMAPS.satellite.labels.url}
            maxZoom={BASEMAPS.satellite.labels.maxZoom}
            pane="overlayPane"
            opacity={0.95}
          />
        )}

        {activeIcmbioWmsLayers.map((activeIcmbioLayer) => (
          <WMSTileLayer
            key={activeIcmbioLayer.key}
            url={activeIcmbioLayer.url || ICMBIO_WMS_URL}
            layers={activeIcmbioLayer.layers}
            styles={activeIcmbioLayer.styles || ''}
            format="image/png"
            transparent={true}
            version={activeIcmbioLayer.version || '1.3.0'}
            crs={activeIcmbioLayer.crs}
            opacity={activeIcmbioLayer.opacity}
            className="icmbio-wms-tiles"
            pane="icmbio-wms"
            maxZoom={20}
            attribution={activeIcmbioLayer.attribution || 'ICMBio / INDE'}
          />
        ))}

        <CarReferenceLayer
          carGeojson={carReferenceMapGeojson}
          carDatasetKey={carReferenceMapKey}
          selectedOverlapIds={selectedCarOverlapIds}
          selectedOverlapLayerKeys={selectedCarOverlapLayerKeys}
          selectedFeatureId={selectedCarReferenceFeatureId}
          selectedDatasetId={activeCarReferenceDatasetId}
          viewportRequest={viewportRequest}
          onSelectFeature={handleCarReferenceFeatureSelect}
        />

        <PublicCarConsultationLayer
          consultedCar={consultedCar}
          viewportRequest={viewportRequest}
        />

        <GeoJSONLayer
          glebas={glebas}
          onSelect={setSelectedGleba}
          selectedId={selectedId}
          matchedFeatureIds={matchedFeatureIds}
          visibleFeatureIds={visibleFeatureIds}
          viewportRequest={viewportRequest}
          suppressFeatureId={draggingFeatureId}
        />

        <GlebaPointMarkersLayer
          glebas={glebas}
          selectedId={selectedId}
          visibleFeatureIds={visibleFeatureIds}
          pointDisplayMode={pointDisplayMode}
          activeVertexReference={activeVertexReference}
          onPointSelect={handlePointMarkerSelect}
          onActiveVertexChange={onActiveVertexChange}
          onDragStateChange={handleDragStateChange}
          updateFeatureCoordinates={updateFeatureCoordinates}
          suppressFeatureId={draggingFeatureId}
        />

        <EditableSelectedGleba
          selectedGleba={selectedGleba}
          updateSelectedGlebaCoordinates={updateSelectedGlebaCoordinates}
          pointDisplayMode={pointDisplayMode}
          activeVertexReference={activeVertexReference}
          requestedVertexActivation={requestedVertexActivation}
          onRequestedVertexActivationApplied={handleRequestedVertexActivationApplied}
          draggingFeatureId={draggingFeatureId}
          onActiveVertexChange={onActiveVertexChange}
          onDragStateChange={handleDragStateChange}
        />
        <ValidationPointMarker queryPoint={queryPoint} />
        <Legend />
      </MapContainer>

      {shouldRenderGlobe && (
        <Suspense fallback={<div className="globe-view globe-view--loading">Carregando visualizacao global...</div>}>
          <GlobeView
            glebas={glebas}
            carGeojson={carReferenceMapGeojson}
            visibleFeatureIds={visibleFeatureIds}
            selectedId={selectedId}
            selectedCarLayerKeys={selectedCarOverlapLayerKeys}
            viewportRequest={viewportRequest}
            variant={activeBasemap === 'dark' ? 'map' : 'satellite'}
            introAnimation={isIntroActive}
            onIntroComplete={finishIntro}
            onIntroSkip={skipIntro}
          />
        </Suspense>
      )}
    </div>
  )
}
