import adminBoundaries from '../data/municipios-uf.json'

const MUNICIPALITY_FIELD_ALIASES = [
  'municipio',
  'nome_municipio',
  'nomemunicipio',
  'nm_mun',
  'nm_municipio',
  'nome_mun',
  'nomemunicipio',
  'nome',
  'name',
  'municipality',
  'city',
]

const STATE_FIELD_ALIASES = [
  'uf',
  'sigla_uf',
  'siglauf',
  'nm_uf',
  'nome_uf',
  'estado',
  'state',
  'uf_nome',
]

let runtimeBoundariesPromise = null
let runtimeBoundariesCache = null
const reverseGeocodeCache = new Map()

function normalizeRing(coordinates = []) {
  if (!coordinates.length) return []

  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]

  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    return coordinates.slice(0, -1)
  }

  return coordinates
}

function computeCentroid(coordinates = []) {
  const ring = normalizeRing(coordinates)
  if (!ring.length) return null

  const sum = ring.reduce(
    (accumulator, [lon, lat]) => ({
      lon: accumulator.lon + Number(lon),
      lat: accumulator.lat + Number(lat),
    }),
    { lon: 0, lat: 0 }
  )

  return {
    lon: sum.lon / ring.length,
    lat: sum.lat / ring.length,
  }
}

function pointInRing(point, ring) {
  let inside = false

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index]
    const [xj, yj] = ring[previous]

    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi

    if (intersects) inside = !inside
  }

  return inside
}

function pointInPolygon(point, geometry) {
  if (!geometry) return false

  if (geometry.type === 'Polygon') {
    const outerRing = geometry.coordinates?.[0] || []
    return outerRing.length ? pointInRing(point, outerRing) : false
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates?.some((polygon) => {
      const outerRing = polygon?.[0] || []
      return outerRing.length ? pointInRing(point, outerRing) : false
    }) || false
  }

  return false
}

function pointInRuntimeFeature(point, feature) {
  const [minLon, minLat, maxLon, maxLat] = feature?.bbox || []
  if (
    minLon === undefined ||
    point.lon < minLon ||
    point.lon > maxLon ||
    point.lat < minLat ||
    point.lat > maxLat
  ) {
    return false
  }

  return (feature.rings || []).some((ring) => pointInRing(point, ring))
}

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function getPropertyByAliases(properties, aliases) {
  const entries = Object.entries(properties).map(([key, value]) => [
    normalizeKey(key),
    value,
  ])

  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias)
    const found = entries.find(([normalizedKey]) => normalizedKey === normalizedAlias)

    if (found?.[1]) {
      return found[1]
    }
  }

  return null
}

function extractBoundaryInfo(feature) {
  const properties = feature?.properties || {}

  return {
    municipio: getPropertyByAliases(properties, MUNICIPALITY_FIELD_ALIASES),
    uf: getPropertyByAliases(properties, STATE_FIELD_ALIASES),
  }
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const STATE_NAME_TO_UF = {
  rondonia: 'RO',
  acre: 'AC',
  amazonas: 'AM',
  roraima: 'RR',
  para: 'PA',
  amapa: 'AP',
  tocantins: 'TO',
  maranhao: 'MA',
  piaui: 'PI',
  ceara: 'CE',
  riograndedonorte: 'RN',
  paraiba: 'PB',
  pernambuco: 'PE',
  alagoas: 'AL',
  sergipe: 'SE',
  bahia: 'BA',
  minasgerais: 'MG',
  espiritosanto: 'ES',
  riodejaneiro: 'RJ',
  saopaulo: 'SP',
  parana: 'PR',
  santacatarina: 'SC',
  riograndedosul: 'RS',
  matogrossodosul: 'MS',
  matogrosso: 'MT',
  goias: 'GO',
  distritofederal: 'DF',
}

function normalizeUfFromStateName(value) {
  const normalized = normalizeText(value).replace(/[^a-z0-9]/g, '')
  return STATE_NAME_TO_UF[normalized] || null
}

async function reverseGeocodeMunicipalityAndState(point) {
  const cacheKey = `${point.lat.toFixed(4)},${point.lon.toFixed(4)}`
  if (reverseGeocodeCache.has(cacheKey)) {
    return reverseGeocodeCache.get(cacheKey)
  }

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', String(point.lat))
    url.searchParams.set('lon', String(point.lon))
    url.searchParams.set('zoom', '10')
    url.searchParams.set('addressdetails', '1')

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    })

    if (!response.ok) {
      reverseGeocodeCache.set(cacheKey, null)
      return null
    }

    const data = await response.json()
    const address = data?.address || {}
    const municipio =
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.county ||
      null
    const uf = normalizeUfFromStateName(address.state)

    const result = municipio || uf ? { municipio, uf } : null
    reverseGeocodeCache.set(cacheKey, result)
    return result
  } catch {
    reverseGeocodeCache.set(cacheKey, null)
    return null
  }
}

async function loadRuntimeBoundaries() {
  if (runtimeBoundariesCache) return runtimeBoundariesCache
  if (!runtimeBoundariesPromise) {
    runtimeBoundariesPromise = fetch('/base-geoserver-municipios-index.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Falha ao carregar base local (${response.status})`)
        }
        return response.json()
      })
      .then((data) => {
        runtimeBoundariesCache = data
        return data
      })
      .catch(() => {
        runtimeBoundariesCache = { type: 'FeatureCollection', features: [] }
        return runtimeBoundariesCache
      })
  }

  return runtimeBoundariesPromise
}

export async function lookupMunicipalityAndState(coordinates = []) {
  const centroid = computeCentroid(coordinates)
  if (!centroid) return null

  if (adminBoundaries?.features?.length) {
    const matchedBoundary = adminBoundaries.features.find((feature) =>
      pointInPolygon(centroid, feature.geometry)
    )

    if (matchedBoundary) {
      return extractBoundaryInfo(matchedBoundary)
    }
  }

  const runtimeBoundaries = await loadRuntimeBoundaries()
  if (!runtimeBoundaries?.features?.length) {
    return null
  }

  const matchedRuntimeBoundary = runtimeBoundaries.features.find((feature) =>
    pointInRuntimeFeature(centroid, feature)
  )

  if (!matchedRuntimeBoundary) {
    return reverseGeocodeMunicipalityAndState(centroid)
  }

  return {
    municipio: matchedRuntimeBoundary.municipio || null,
    uf: matchedRuntimeBoundary.uf || null,
  }
}

export function getAdminBoundaryStats() {
  const staticCount = adminBoundaries?.features?.length || 0
  const runtimeCount = runtimeBoundariesCache?.features?.length || 0
  const featureCount = staticCount || runtimeCount

  return {
    featureCount,
    isConfigured: Boolean(featureCount || runtimeBoundariesPromise),
  }
}
