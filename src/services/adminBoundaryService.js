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

export function lookupMunicipalityAndState(coordinates = []) {
  if (!adminBoundaries?.features?.length) {
    return null
  }

  const centroid = computeCentroid(coordinates)
  if (!centroid) return null

  const matchedBoundary = adminBoundaries.features.find((feature) =>
    pointInPolygon(centroid, feature.geometry)
  )

  return matchedBoundary ? extractBoundaryInfo(matchedBoundary) : null
}

export function getAdminBoundaryStats() {
  return {
    featureCount: adminBoundaries?.features?.length || 0,
    isConfigured: Boolean(adminBoundaries?.features?.length),
  }
}
