import { validateConservationUnitOverlap } from './environmentalRestrictionService'

const CAR_PUBLIC_API_BASE = '/car-public-api'
const CAR_PUBLIC_WFS_BASE = '/car-public-wfs'

const CAR_PROPERTY_LAYERS = [
  { typeName: 'consulta_publica:iru', typeCode: 'IRU', typeLabel: 'Imovel rural' },
  { typeName: 'consulta_publica:ast', typeCode: 'AST', typeLabel: 'Assentamento da Reforma Agraria' },
  { typeName: 'consulta_publica:pct', typeCode: 'PCT', typeLabel: 'Povos e Comunidades Tradicionais' },
]

const STATUS_CODE_LABELS = {
  AT: 'Ativo',
  PE: 'Pendente',
  CA: 'Cancelado',
  IN: 'Inativo',
  SU: 'Suspenso',
}

const TYPE_CODE_LABELS = {
  IRU: 'Imovel rural',
  AST: 'Assentamento da Reforma Agraria',
  PCT: 'Povos e Comunidades Tradicionais',
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function normalizeCarCode(input) {
  const compactCode = String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  if (!compactCode) return ''

  const uf = compactCode.slice(0, 2)
  const municipalityCode = compactCode.slice(2, 9)
  const identifier = compactCode.slice(9)

  if (
    !/^[A-Z]{2}$/.test(uf) ||
    !/^\d{7}$/.test(municipalityCode) ||
    !identifier ||
    !/^[A-Z0-9]+$/.test(identifier)
  ) {
    return ''
  }

  return `${uf}-${municipalityCode}-${identifier}`
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null

  const raw = value.trim()
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function escapeCqlLiteral(value) {
  return String(value ?? '').replace(/'/g, "''")
}

async function fetchJson(url, options = {}) {
  let response

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    })
  } catch {
    throw new Error('Falha de conexao com a consulta publica do CAR. Tente novamente em instantes.')
  }

  if (!response.ok) {
    throw new Error(`Servico do CAR respondeu com HTTP ${response.status}. Tente novamente mais tarde.`)
  }

  const text = await response.text()
  if (!text.trim()) return null

  try {
    return JSON.parse(text)
  } catch {
    throw new Error('A consulta publica do CAR retornou uma resposta inesperada.')
  }
}

function parseWktPolygon(wkt) {
  const text = String(wkt ?? '').trim()
  const match = text.match(/^POLYGON\s*\(\((.+)\)\)$/i)
  if (!match) return null

  const ring = match[1]
    .split(',')
    .map((pair) => pair.trim().split(/\s+/).map(Number))
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))

  if (ring.length < 4) return null

  return {
    type: 'Polygon',
    coordinates: [ring],
  }
}

function resolveStatusTone(statusValue, analysisValue) {
  const normalizedStatus = normalizeText(statusValue)
  const normalizedAnalysis = normalizeText(analysisValue)

  if (
    ['at', 'ativo', 'regular', 'aprovado', 'certificado'].includes(normalizedStatus) ||
    normalizedStatus.includes('regular') ||
    normalizedStatus.includes('ativo')
  ) {
    return 'active'
  }

  if (
    normalizedStatus.includes('pend') ||
    normalizedStatus.includes('analise') ||
    normalizedAnalysis.includes('aguard') ||
    normalizedAnalysis.includes('analise') ||
    normalizedAnalysis.includes('pend')
  ) {
    return 'pending'
  }

  if (
    ['ca', 'in', 'su'].includes(normalizedStatus) ||
    normalizedStatus.includes('cancel') ||
    normalizedStatus.includes('inativ') ||
    normalizedStatus.includes('invalid') ||
    normalizedStatus.includes('suspens')
  ) {
    return 'invalid'
  }

  return 'unknown'
}

function resolveStatusLabel(statusValue, analysisValue) {
  const raw = String(statusValue ?? '').trim()
  const upper = raw.toUpperCase()

  if (STATUS_CODE_LABELS[upper]) return STATUS_CODE_LABELS[upper]
  if (raw) return raw

  return String(analysisValue ?? '').trim() || 'Status desconhecido'
}

function resolveTypeLabel(value, fallback = null) {
  const raw = String(value ?? fallback ?? '').trim()
  if (!raw) return null

  return TYPE_CODE_LABELS[raw.toUpperCase()] || raw
}

async function fetchCarDetails(carCode, signal) {
  const url = `${CAR_PUBLIC_API_BASE}/totalizer/getDeatilsByIdentifier/${encodeURIComponent(carCode)}`
  const data = await fetchJson(url, { signal })

  if (!data || !Object.keys(data).length) {
    return null
  }

  return data
}

async function fetchCarLayerGeojson(carCode, layer, signal) {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '1.0.0',
    request: 'GetFeature',
    typeName: layer.typeName,
    outputFormat: 'application/json',
    CQL_FILTER: `cod_imovel='${escapeCqlLiteral(carCode)}'`,
  })
  const data = await fetchJson(`${CAR_PUBLIC_WFS_BASE}?${params.toString()}`, { signal })
  const features = Array.isArray(data?.features) ? data.features : []

  return {
    ...data,
    features: features.map((feature) => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        __publicCarLayer: layer.typeName,
        __publicCarTypeCode: layer.typeCode,
        __publicCarTypeLabel: layer.typeLabel,
      },
    })),
  }
}

async function fetchCarGeometry(carCode, signal) {
  const results = await Promise.allSettled(
    CAR_PROPERTY_LAYERS.map((layer) => fetchCarLayerGeojson(carCode, layer, signal))
  )
  const features = results.flatMap((result) => (
    result.status === 'fulfilled' ? result.value.features || [] : []
  ))

  return {
    type: 'FeatureCollection',
    features,
  }
}

function buildFallbackFeature(detail, publicProperties) {
  const geometry = parseWktPolygon(detail.bounderBox)
  if (!geometry) return null

  return {
    type: 'Feature',
    properties: {
      ...publicProperties,
      geometrySource: 'bounderBox',
    },
    geometry,
  }
}

function buildPublicProperties(detail, featureProperties = {}) {
  const code = detail.codeProperty || featureProperties.cod_imovel || null
  const statusRaw = featureProperties.status_imovel || detail.status || null
  const analysisStatus = featureProperties.situacao_analise || detail.situacaoAnalise || null
  const type = resolveTypeLabel(
    featureProperties.tipo_imovel,
    featureProperties.__publicCarTypeLabel
  )
  const area =
    parseNumber(detail.haRegisteredArea) ??
    parseNumber(featureProperties.area) ??
    null

  return {
    id: code ? `public-car-${code}` : `public-car-${Date.now()}`,
    carCode: code,
    statusLabel: resolveStatusLabel(statusRaw, analysisStatus),
    statusRaw,
    statusTone: resolveStatusTone(statusRaw, analysisStatus),
    analysisStatus,
    municipio: detail.nameCity || featureProperties.municipio || null,
    uf: detail.idState || featureProperties.uf || null,
    area,
    tipo: type,
    sourceType: 'consulta_publica_car',
    geometrySource: 'wfs',
  }
}

function sanitizeFeature(feature, detail, index) {
  const properties = buildPublicProperties(detail, feature.properties || {})

  return {
    type: 'Feature',
    id: feature.id || `${properties.id}-${index + 1}`,
    properties: {
      ...properties,
      id: `${properties.id}-${index + 1}`,
    },
    geometry: feature.geometry,
  }
}

export async function consultPublicCarByCode(inputCarCode, options = {}) {
  const requestedCode = normalizeCarCode(inputCarCode)

  if (!String(inputCarCode ?? '').trim()) {
    throw new Error('Informe o numero do CAR antes de consultar.')
  }

  if (!requestedCode) {
    throw new Error('Codigo CAR invalido. Verifique o numero informado e tente novamente.')
  }

  const detail = await fetchCarDetails(requestedCode, options.signal)
  if (!detail?.codeProperty) {
    throw new Error('Nenhum registro CAR foi localizado para o numero informado.')
  }

  const canonicalCode = normalizeCarCode(detail.codeProperty) || requestedCode
  let geometryCollection = { type: 'FeatureCollection', features: [] }

  try {
    geometryCollection = await fetchCarGeometry(canonicalCode, options.signal)
  } catch {
    geometryCollection = { type: 'FeatureCollection', features: [] }
  }

  const primaryFeatureProperties = geometryCollection.features[0]?.properties || {}
  const publicProperties = buildPublicProperties(detail, primaryFeatureProperties)
  const sanitizedFeatures = geometryCollection.features
    .filter((feature) => feature.geometry)
    .map((feature, index) => sanitizeFeature(feature, detail, index))

  if (!sanitizedFeatures.length) {
    const fallbackFeature = buildFallbackFeature(detail, publicProperties)
    if (fallbackFeature) {
      sanitizedFeatures.push(fallbackFeature)
    }
  }

  if (!sanitizedFeatures.length) {
    throw new Error('O CAR foi encontrado, mas a geometria publica nao esta disponivel no momento.')
  }

  let consultedGeojson = {
    type: 'FeatureCollection',
    features: sanitizedFeatures,
  }
  const environmentalValidation = await validateConservationUnitOverlap(consultedGeojson, {
    signal: options.signal,
  })
  consultedGeojson = {
    ...consultedGeojson,
    features: consultedGeojson.features.map((feature) => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        environmentalValidation,
      },
    })),
  }

  const resolvedProperties = sanitizedFeatures[0].properties || publicProperties

  return {
    code: canonicalCode,
    requestedCode,
    statusLabel: resolvedProperties.statusLabel,
    statusTone: resolvedProperties.statusTone,
    analysisStatus: resolvedProperties.analysisStatus,
    municipio: resolvedProperties.municipio,
    uf: resolvedProperties.uf,
    area: resolvedProperties.area,
    tipo: resolvedProperties.tipo,
    geometrySource: resolvedProperties.geometrySource,
    environmentalValidation,
    fetchedAt: new Date().toISOString(),
    geojson: consultedGeojson,
  }
}
