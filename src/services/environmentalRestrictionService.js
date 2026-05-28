const MMA_WFS_BASE = '/mma-wfs'
const ICMBIO_WFS_BASE = '/icmbio-wms'
const ICMBIO_UC_LAYER = 'limiteucsfederais_a'
const CONSERVATION_UNIT_SOURCES = [
  {
    baseUrl: MMA_WFS_BASE,
    referenceType: 'Unidade de Conservacao CNUC/MMA',
    layerCandidates: [
      'MMA:cnuc_2026_03_atualizado',
      'MMA:cnuc_2026_03',
      'MMA:cnuc_2025_08',
      'MMA:cnuc_04_2024',
    ],
  },
  {
    baseUrl: ICMBIO_WFS_BASE,
    referenceType: 'Unidade de Conservacao Federal',
    layerCandidates: [
      ICMBIO_UC_LAYER,
      `ICMBio:${ICMBIO_UC_LAYER}`,
    ],
  },
]
const TOLERANCE = 1e-10
const MAX_UC_FEATURES = 80

function nearlyEqual(left, right, tolerance = TOLERANCE) {
  return Math.abs(left - right) <= tolerance
}

function coordinatesEqual(left, right, tolerance = TOLERANCE) {
  if (!left || !right) return false

  return nearlyEqual(left[0], right[0], tolerance) && nearlyEqual(left[1], right[1], tolerance)
}

function normalizeRing(ring = []) {
  if (!ring.length) return []

  const normalized = ring
    .map(([lon, lat]) => [Number(lon), Number(lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))

  if (normalized.length < 2) return normalized

  const first = normalized[0]
  const last = normalized[normalized.length - 1]

  return coordinatesEqual(first, last)
    ? normalized.slice(0, -1)
    : normalized
}

function geometryToPolygons(geometry) {
  if (!geometry) return []

  if (geometry.type === 'Polygon') {
    return [geometry.coordinates || []]
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates || []
  }

  return []
}

function geometryToRings(geometry) {
  return geometryToPolygons(geometry).flatMap((polygon) =>
    (polygon || [])
      .map((ring) => normalizeRing(ring))
      .filter((ring) => ring.length >= 3)
  )
}

function calculateGeometryBounds(geometry) {
  const rings = geometryToRings(geometry)
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity

  rings.forEach((ring) => {
    ring.forEach(([lon, lat]) => {
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    })
  })

  return Number.isFinite(minLon) && Number.isFinite(minLat)
    ? { minLon, minLat, maxLon, maxLat }
    : null
}

function expandBounds(bounds, padding = 0.00025) {
  if (!bounds) return null

  return {
    minLon: bounds.minLon - padding,
    minLat: bounds.minLat - padding,
    maxLon: bounds.maxLon + padding,
    maxLat: bounds.maxLat + padding,
  }
}

function calculateGeojsonBounds(geojson) {
  const featureBounds = (geojson?.features || [])
    .map((feature) => calculateGeometryBounds(feature.geometry))
    .filter(Boolean)

  if (!featureBounds.length) return null

  return {
    minLon: Math.min(...featureBounds.map((bounds) => bounds.minLon)),
    minLat: Math.min(...featureBounds.map((bounds) => bounds.minLat)),
    maxLon: Math.max(...featureBounds.map((bounds) => bounds.maxLon)),
    maxLat: Math.max(...featureBounds.map((bounds) => bounds.maxLat)),
  }
}

function boundsIntersect(leftBounds, rightBounds, tolerance = TOLERANCE) {
  if (!leftBounds || !rightBounds) return false

  return (
    leftBounds.minLon <= rightBounds.maxLon + tolerance &&
    leftBounds.maxLon >= rightBounds.minLon - tolerance &&
    leftBounds.minLat <= rightBounds.maxLat + tolerance &&
    leftBounds.maxLat >= rightBounds.minLat - tolerance
  )
}

function crossProduct(origin, left, right) {
  return (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0])
}

function pointOnSegment(point, start, end, tolerance = TOLERANCE) {
  const cross = crossProduct(start, end, point)
  if (Math.abs(cross) > tolerance) return false

  const minLon = Math.min(start[0], end[0]) - tolerance
  const maxLon = Math.max(start[0], end[0]) + tolerance
  const minLat = Math.min(start[1], end[1]) - tolerance
  const maxLat = Math.max(start[1], end[1]) + tolerance

  return (
    point[0] >= minLon &&
    point[0] <= maxLon &&
    point[1] >= minLat &&
    point[1] <= maxLat
  )
}

function pointInRing(point, ring) {
  const normalizedRing = normalizeRing(ring)
  if (normalizedRing.length < 3) return false

  let inside = false

  for (let index = 0, previous = normalizedRing.length - 1; index < normalizedRing.length; previous = index++) {
    const current = normalizedRing[index]
    const prior = normalizedRing[previous]

    if (pointOnSegment(point, prior, current)) {
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

function segmentsIntersect(startA, endA, startB, endB) {
  if (
    pointOnSegment(startA, startB, endB) ||
    pointOnSegment(endA, startB, endB) ||
    pointOnSegment(startB, startA, endA) ||
    pointOnSegment(endB, startA, endA)
  ) {
    return true
  }

  const orientation1 = crossProduct(startA, endA, startB)
  const orientation2 = crossProduct(startA, endA, endB)
  const orientation3 = crossProduct(startB, endB, startA)
  const orientation4 = crossProduct(startB, endB, endA)

  return (
    (orientation1 > 0) !== (orientation2 > 0) &&
    (orientation3 > 0) !== (orientation4 > 0)
  )
}

function ringsOverlap(leftRing, rightRing) {
  if (leftRing.length < 3 || rightRing.length < 3) {
    return false
  }

  for (let leftIndex = 0; leftIndex < leftRing.length; leftIndex += 1) {
    const leftStart = leftRing[leftIndex]
    const leftEnd = leftRing[(leftIndex + 1) % leftRing.length]

    for (let rightIndex = 0; rightIndex < rightRing.length; rightIndex += 1) {
      const rightStart = rightRing[rightIndex]
      const rightEnd = rightRing[(rightIndex + 1) % rightRing.length]

      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) {
        return true
      }
    }
  }

  return (
    leftRing.some((point) => pointInRing(point, rightRing)) ||
    rightRing.some((point) => pointInRing(point, leftRing))
  )
}

function geometriesOverlap(leftGeometry, rightGeometry) {
  const leftBounds = calculateGeometryBounds(leftGeometry)
  const rightBounds = calculateGeometryBounds(rightGeometry)

  if (!boundsIntersect(leftBounds, rightBounds)) {
    return false
  }

  const leftRings = geometryToRings(leftGeometry)
  const rightRings = geometryToRings(rightGeometry)

  return leftRings.some((leftRing) =>
    rightRings.some((rightRing) => ringsOverlap(leftRing, rightRing))
  )
}

function buildUcWfsUrl(baseUrl, layerName, bounds) {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '1.0.0',
    request: 'GetFeature',
    typeName: layerName,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    maxFeatures: String(MAX_UC_FEATURES),
    bbox: [
      bounds.minLon,
      bounds.minLat,
      bounds.maxLon,
      bounds.maxLat,
      'EPSG:4326',
    ].join(','),
  })

  return `${baseUrl}?${params.toString()}`
}

async function fetchUcLayerCandidates(source, layerName, bounds, options = {}) {
  const response = await fetch(buildUcWfsUrl(source.baseUrl, layerName, bounds), {
    credentials: 'omit',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`${source.referenceType} WFS HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()
  if (!text.trim()) {
    return []
  }

  if (!contentType.includes('application/json') && !text.trim().startsWith('{')) {
    throw new Error(`${source.referenceType} WFS nao retornou GeoJSON.`)
  }

  const parsed = JSON.parse(text)
  return (Array.isArray(parsed?.features) ? parsed.features : []).map((feature) => ({
    ...feature,
    properties: {
      ...(feature.properties || {}),
      __environmentalReferenceType: source.referenceType,
      __environmentalLayerName: layerName,
    },
  }))
}

function dedupeFeatures(features = []) {
  const seen = new Set()

  return features.filter((feature) => {
    const key = feature?.id || [
      feature?.properties?.nomeuc,
      feature?.properties?.nome_uc,
      feature?.properties?.nome,
      feature?.properties?.uc_id,
      feature?.properties?.cnuc,
    ].filter(Boolean).join('|')

    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function fetchUcCandidates(bounds, options = {}) {
  let lastError = null
  let hasSuccessfulQuery = false
  const features = []

  for (const source of CONSERVATION_UNIT_SOURCES) {
    for (const layerName of source.layerCandidates) {
      try {
        features.push(...await fetchUcLayerCandidates(source, layerName, bounds, options))
        hasSuccessfulQuery = true
        break
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw error
        }

        lastError = error
      }
    }
  }

  if (features.length || hasSuccessfulQuery || !lastError) {
    return {
      type: 'FeatureCollection',
      features: dedupeFeatures(features),
    }
  }

  throw lastError || new Error('Nao foi possivel consultar as Unidades de Conservacao.')
}

function getProperty(properties, keys = []) {
  for (const key of keys) {
    const value = properties?.[key]
    if (value !== null && value !== undefined && String(value).trim()) {
      return value
    }
  }

  return null
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function isConservationUnitFeature(feature) {
  const properties = feature?.properties || {}
  const boundaryType = normalizeText(getProperty(properties, ['limite', 'tipo_limite', 'tipo', 'n32']) || '')

  if (!boundaryType) return true

  return boundaryType === 'uc' || boundaryType.includes('unidade')
}

function summarizeUcFeature(feature) {
  const properties = feature?.properties || {}

  return {
    id: feature?.id || getProperty(properties, ['id', 'cnuc', 'codigo']) || null,
    nome: getProperty(properties, ['nomeuc', 'nome_uc', 'nome', 'nome_area', 'n6']) || 'Unidade de Conservacao',
    codigo: getProperty(properties, ['cnuc', 'codigo', 'cod_uc', 'n10', 'n5']) || null,
    categoria: getProperty(properties, ['siglacateg', 'categoria', 'categori', 'n22']) || null,
    grupo: getProperty(properties, ['grupouc', 'grupo', 'grupo_uc', 'n21']) || null,
    uf: getProperty(properties, ['ufabrang', 'uf', 'n18']) || null,
    municipio: getProperty(properties, ['municipio', 'n19']) || null,
    bioma: getProperty(properties, ['biomas', 'bioma']) || null,
    area: getProperty(properties, ['areahaalb', 'area_ha', 'area', 'n26', 'n15']) || null,
    referenceType: properties.__environmentalReferenceType || 'Unidade de Conservacao',
  }
}

function buildEnvironmentalOverlapGeojson(features = []) {
  return {
    type: 'FeatureCollection',
    features: features.map((feature, index) => {
      const summary = summarizeUcFeature(feature)
      const featureId = summary.id || feature?.id || `unidade-conservacao-${index + 1}`

      return {
        type: 'Feature',
        id: featureId,
        properties: {
          ...summary,
          id: featureId,
          sourceType: 'conservation_unit',
        },
        geometry: feature.geometry,
      }
    }),
  }
}

function createResult(status, overrides = {}) {
  const now = new Date().toISOString()

  return {
    status,
    referenceType: 'Unidade de Conservacao Federal',
    overlapCount: 0,
    matches: [],
    geojson: {
      type: 'FeatureCollection',
      features: [],
    },
    message: '',
    validatedAt: now,
    ...overrides,
  }
}

export async function validateConservationUnitOverlap(geojson, options = {}) {
  const bounds = expandBounds(calculateGeojsonBounds(geojson))

  if (!bounds) {
    return createResult('unavailable', {
      message: 'Nao foi possivel validar Unidade de Conservacao porque a geometria do CAR nao esta disponivel.',
    })
  }

  try {
    const candidateCollection = await fetchUcCandidates(bounds, options)
    const carFeatures = (geojson?.features || []).filter((feature) => feature.geometry)
    const matchingFeatures = (candidateCollection.features || [])
      .filter((ucFeature) => ucFeature.geometry)
      .filter(isConservationUnitFeature)
      .filter((ucFeature) =>
        carFeatures.some((carFeature) => geometriesOverlap(carFeature.geometry, ucFeature.geometry))
      )
    const matches = matchingFeatures.map(summarizeUcFeature)

    if (matches.length) {
      return createResult('overlap', {
        referenceType: matches[0]?.referenceType || 'Unidade de Conservacao',
        overlapCount: matches.length,
        matches,
        geojson: buildEnvironmentalOverlapGeojson(matchingFeatures),
        message: 'SICOR: Gleba ou CAR informados sobrepoem Unidade de Conservacao.',
      })
    }

    return createResult('clear', {
      message: 'Nenhuma sobreposicao com Unidade de Conservacao Federal foi localizada.',
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }

    return createResult('unavailable', {
      error: error?.message || 'Falha ao consultar o ICMBio.',
      message: 'Nao foi possivel validar a sobreposicao com Unidade de Conservacao no momento.',
    })
  }
}
