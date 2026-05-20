const BUSINESS_IDENTIFIER_KEYS = [
  'numero_car_recibo',
  'numero_car_imovel',
  'cod_imovel',
  'codigo_imovel',
  'car',
]

function normalizeBusinessIdentifier(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

  return normalized || null
}

function getCarReferenceBusinessKey(feature) {
  const properties = feature?.properties || {}

  for (const key of BUSINESS_IDENTIFIER_KEYS) {
    const normalizedValue = normalizeBusinessIdentifier(properties[key])
    if (normalizedValue) return `${key}:${normalizedValue}`
  }

  return null
}

export function getCarReferenceFeatureKey(feature) {
  const properties = feature?.properties || {}

  return (
    getCarReferenceBusinessKey(feature) ||
    getCarReferenceGeometryKey(feature) ||
    properties.id ||
    properties.nome ||
    JSON.stringify(feature?.geometry || null)
  )
}

function formatCoordinateValue(value) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return null

  return numericValue.toFixed(10)
}

function coordinateKey(coordinate) {
  const [lon, lat] = coordinate || []
  const lonKey = formatCoordinateValue(lon)
  const latKey = formatCoordinateValue(lat)

  return lonKey && latKey ? `${lonKey},${latKey}` : null
}

function normalizeRing(ring = []) {
  const coordinateKeys = ring
    .map(coordinateKey)
    .filter(Boolean)

  if (coordinateKeys.length > 1 && coordinateKeys[0] === coordinateKeys[coordinateKeys.length - 1]) {
    coordinateKeys.pop()
  }

  return coordinateKeys
}

function rotateList(values, startIndex) {
  return [
    ...values.slice(startIndex),
    ...values.slice(0, startIndex),
  ]
}

function findSmallestCoordinateIndex(coordinateKeys = []) {
  let smallestIndex = 0

  for (let index = 1; index < coordinateKeys.length; index += 1) {
    if (coordinateKeys[index] < coordinateKeys[smallestIndex]) {
      smallestIndex = index
    }
  }

  return smallestIndex
}

function canonicalCoordinateSequenceKey(coordinateKeys = []) {
  if (!coordinateKeys.length) return ''

  return rotateList(
    coordinateKeys,
    findSmallestCoordinateIndex(coordinateKeys)
  ).join(';')
}

function canonicalRingKey(ring = []) {
  const coordinateKeys = normalizeRing(ring)
  if (!coordinateKeys.length) return ''

  const reversedKeys = [...coordinateKeys].reverse()
  const candidates = [
    canonicalCoordinateSequenceKey(coordinateKeys),
    canonicalCoordinateSequenceKey(reversedKeys),
  ]

  return candidates.sort()[0]
}

function canonicalPolygonKey(polygon = []) {
  const [outerRing, ...innerRings] = polygon
  const outerKey = canonicalRingKey(outerRing || [])
  const innerKeys = innerRings
    .map(canonicalRingKey)
    .filter(Boolean)
    .sort()

  return [outerKey, ...innerKeys].filter(Boolean).join('|')
}

function getCarReferenceGeometryKey(feature) {
  const geometry = feature?.geometry
  if (!geometry) return null

  if (geometry.type === 'Polygon') {
    const polygonKey = canonicalPolygonKey(geometry.coordinates || [])
    return polygonKey ? `Polygon:${polygonKey}` : null
  }

  if (geometry.type === 'MultiPolygon') {
    const polygonKeys = (geometry.coordinates || [])
      .map(canonicalPolygonKey)
      .filter(Boolean)
      .sort()

    return polygonKeys.length ? `MultiPolygon:${polygonKeys.join('||')}` : null
  }

  return JSON.stringify(geometry)
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

function mergeFeatureGeometries(features = []) {
  const seenPolygonKeys = new Set()
  const polygons = []

  features.forEach((feature) => {
    geometryToPolygons(feature.geometry).forEach((polygon) => {
      const polygonKey = canonicalPolygonKey(polygon)
      if (polygonKey && seenPolygonKeys.has(polygonKey)) return

      if (polygonKey) {
        seenPolygonKeys.add(polygonKey)
      }
      polygons.push(polygon)
    })
  })

  if (!polygons.length) {
    return features[0]?.geometry || null
  }

  return polygons.length === 1
    ? {
        type: 'Polygon',
        coordinates: polygons[0],
      }
    : {
        type: 'MultiPolygon',
        coordinates: polygons,
      }
}

function mergeCarReferenceFeatureGroup(features = []) {
  if (features.length <= 1) {
    return features[0] || null
  }

  const [firstFeature] = features
  const mergedGeometry = mergeFeatureGeometries(features)

  return {
    ...firstFeature,
    properties: {
      ...firstFeature.properties,
      duplicateFeatureCount: features.length - 1,
      mergedFeatureIds: features
        .map((feature) => feature.properties?.id)
        .filter(Boolean),
    },
    geometry: mergedGeometry,
  }
}

export function dedupeCarReferenceFeatures(features = []) {
  const groupedByBusinessKey = new Map()
  const featuresWithoutBusinessKey = []

  features.forEach((feature) => {
    const businessKey = getCarReferenceBusinessKey(feature)

    if (!businessKey) {
      featuresWithoutBusinessKey.push(feature)
      return
    }

    if (!groupedByBusinessKey.has(businessKey)) {
      groupedByBusinessKey.set(businessKey, [])
    }

    groupedByBusinessKey.get(businessKey).push(feature)
  })

  const mergedBusinessFeatures = [...groupedByBusinessKey.values()]
    .map(mergeCarReferenceFeatureGroup)
    .filter(Boolean)
  const dedupedFeatures = [...mergedBusinessFeatures]
  const seenGeometryKeys = new Set()

  mergedBusinessFeatures.forEach((feature) => {
    const geometryKey = getCarReferenceGeometryKey(feature)
    if (geometryKey) {
      seenGeometryKeys.add(geometryKey)
    }
  })

  featuresWithoutBusinessKey.forEach((feature) => {
    const geometryKey = getCarReferenceGeometryKey(feature)
    if (geometryKey && seenGeometryKeys.has(geometryKey)) {
      return
    }

    if (geometryKey) {
      seenGeometryKeys.add(geometryKey)
    }
    dedupedFeatures.push(feature)
  })

  return dedupedFeatures
}

export function normalizeCarReferenceDataset(dataset) {
  if (!dataset?.geojson?.features?.length) {
    return dataset
  }

  const features = dedupeCarReferenceFeatures(dataset.geojson.features)

  return {
    ...dataset,
    geojson: {
      ...dataset.geojson,
      features,
    },
    metadata: {
      ...dataset.metadata,
      rowCount: features.length,
      glebaCount: features.length,
      duplicateCount: dataset.geojson.features.length - features.length,
    },
  }
}
