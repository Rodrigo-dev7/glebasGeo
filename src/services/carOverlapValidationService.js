const TOLERANCE = 1e-10

function nearlyEqual(a, b, tolerance = TOLERANCE) {
  return Math.abs(a - b) <= tolerance
}

function coordinatesEqual(left, right, tolerance = TOLERANCE) {
  if (!left || !right) return false

  return nearlyEqual(left[0], right[0], tolerance) && nearlyEqual(left[1], right[1], tolerance)
}

function normalizeRing(ring = []) {
  if (!ring.length) return []

  const normalized = ring.map(([lon, lat]) => [Number(lon), Number(lat)])
  const first = normalized[0]
  const last = normalized[normalized.length - 1]

  if (coordinatesEqual(first, last)) {
    return normalized.slice(0, -1)
  }

  return normalized
}

function geometryToRings(geometry) {
  if (!geometry) return []

  if (geometry.type === 'Polygon') {
    return [normalizeRing(geometry.coordinates?.[0] || [])]
  }

  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates || []).map((polygon) => normalizeRing(polygon?.[0] || []))
  }

  return []
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
  let inside = false

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index]
    const prior = ring[previous]

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
    const nextLeftIndex = (leftIndex + 1) % leftRing.length
    const leftStart = leftRing[leftIndex]
    const leftEnd = leftRing[nextLeftIndex]

    for (let rightIndex = 0; rightIndex < rightRing.length; rightIndex += 1) {
      const nextRightIndex = (rightIndex + 1) % rightRing.length
      const rightStart = rightRing[rightIndex]
      const rightEnd = rightRing[nextRightIndex]

      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) {
        return true
      }
    }
  }

  if (leftRing.some((point) => pointInRing(point, rightRing))) {
    return true
  }

  if (rightRing.some((point) => pointInRing(point, leftRing))) {
    return true
  }

  return false
}

function geometriesOverlap(leftGeometry, rightGeometry) {
  const leftRings = geometryToRings(leftGeometry)
  const rightRings = geometryToRings(rightGeometry)

  return leftRings.some((leftRing) =>
    rightRings.some((rightRing) => ringsOverlap(leftRing, rightRing))
  )
}

function summarizeCarFeature(feature) {
  return {
    id: feature.properties?.id || null,
    nome: feature.properties?.nome || 'Imovel CAR',
    codigo: feature.properties?.cod_imovel || feature.properties?.codigo_imovel || null,
  }
}

export function buildCarOverlapValidation(feature, carGeojson, metadata = null) {
  if (!carGeojson?.features?.length) {
    return {
      status: 'not_loaded',
      overlapCount: 0,
      overlaps: [],
      referenceFileName: metadata?.fileName || null,
      message: 'Nenhuma base KML do CAR foi carregada para a analise de sobreposicao.',
      validatedAt: new Date().toISOString(),
    }
  }

  const overlaps = carGeojson.features
    .filter((carFeature) => geometriesOverlap(feature.geometry, carFeature.geometry))
    .map(summarizeCarFeature)

  return {
    status: overlaps.length ? 'overlap' : 'clear',
    overlapCount: overlaps.length,
    overlaps,
    referenceFileName: metadata?.fileName || null,
    message: overlaps.length
      ? `Sobreposicao detectada com ${overlaps.length} imovel(is) do CAR.`
      : 'Nenhuma sobreposicao encontrada com a base KML do CAR.',
    validatedAt: new Date().toISOString(),
  }
}

export function applyCarOverlapValidationToFeatureCollection(geojson, carDataset) {
  if (!geojson?.features) {
    return geojson
  }

  const validatedFeatures = geojson.features.map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      carOverlapValidation: buildCarOverlapValidation(
        feature,
        carDataset?.geojson || null,
        carDataset?.metadata || null
      ),
    },
  }))

  return {
    ...geojson,
    features: validatedFeatures,
  }
}

export function applyCarOverlapValidationToFeature(feature, carDataset) {
  return {
    ...feature,
    properties: {
      ...feature.properties,
      carOverlapValidation: buildCarOverlapValidation(
        feature,
        carDataset?.geojson || null,
        carDataset?.metadata || null
      ),
    },
  }
}
