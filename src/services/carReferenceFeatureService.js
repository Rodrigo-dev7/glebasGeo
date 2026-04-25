export function getCarReferenceFeatureKey(feature) {
  const properties = feature?.properties || {}

  return (
    properties.id ||
    properties.numero_car_recibo ||
    properties.cod_imovel ||
    properties.codigo_imovel ||
    properties.car ||
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

export function dedupeCarReferenceFeatures(features = []) {
  const seenKeys = new Set()
  const seenGeometryKeys = new Set()

  return features.filter((feature) => {
    const key = getCarReferenceFeatureKey(feature)
    const geometryKey = getCarReferenceGeometryKey(feature)

    if ((key && seenKeys.has(key)) || (geometryKey && seenGeometryKeys.has(geometryKey))) {
      return false
    }

    if (key) {
      seenKeys.add(key)
    }

    if (geometryKey) {
      seenGeometryKeys.add(geometryKey)
    }

    return true
  })
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
