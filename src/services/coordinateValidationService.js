const DEFAULT_TOLERANCE = 0.00001

function nearlyEqual(a, b, tolerance = DEFAULT_TOLERANCE) {
  return Math.abs(a - b) <= tolerance
}

function pointMatchesVertex(point, vertex, tolerance = DEFAULT_TOLERANCE) {
  const [vertexLon, vertexLat] = vertex
  return nearlyEqual(point.lon, vertexLon, tolerance) && nearlyEqual(point.lat, vertexLat, tolerance)
}

function pointOnSegment(point, start, end, tolerance = DEFAULT_TOLERANCE) {
  const [x, y] = [point.lon, point.lat]
  const [x1, y1] = start
  const [x2, y2] = end

  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1)
  if (Math.abs(cross) > tolerance) return false

  const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)
  if (dot < -tolerance) return false

  const squaredLength = (x2 - x1) ** 2 + (y2 - y1) ** 2
  if (dot - squaredLength > tolerance) return false

  return true
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
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi || Number.EPSILON) + xi

    if (intersects) inside = !inside
  }

  return inside
}

function pointInBoundingBox(point, ring) {
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }

  return (
    point.lon >= minLon &&
    point.lon <= maxLon &&
    point.lat >= minLat &&
    point.lat <= maxLat
  )
}

export function validateCoordinateAgainstDataset(point, geojson, tolerance = DEFAULT_TOLERANCE) {
  if (!geojson?.features?.length) {
    return {
      status: 'empty',
      isMatch: false,
      message: 'Nenhum dado geoespacial foi carregado para validar a coordenada.',
      exactMatches: [],
      containingFeatures: [],
      query: point,
    }
  }

  const exactMatches = []
  const containingFeatures = []

  for (const feature of geojson.features) {
    const ring = feature.geometry?.coordinates?.[0] || []
    if (!ring.length) continue

    const hasExactMatch = ring.some((vertex) => pointMatchesVertex(point, vertex, tolerance))
    const isInside =
      hasExactMatch ||
      (pointInBoundingBox(point, ring) && pointInRing(point, ring))

    if (hasExactMatch) {
      exactMatches.push(feature)
    }

    if (isInside) {
      containingFeatures.push(feature)
    }
  }

  if (exactMatches.length) {
    return {
      status: 'matched',
      isMatch: true,
      matchType: 'direct',
      message: 'Coordenada encontrada diretamente nos vértices importados da base.',
      exactMatches,
      containingFeatures,
      query: point,
    }
  }

  if (containingFeatures.length) {
    return {
      status: 'matched',
      isMatch: true,
      matchType: 'area',
      message: 'Coordenada localizada dentro de uma gleba importada da base.',
      exactMatches,
      containingFeatures,
      query: point,
    }
  }

  return {
    status: 'missing',
    isMatch: false,
    matchType: 'none',
    message: 'Coordenada fora das áreas e sem correspondência direta nos dados importados.',
    exactMatches,
    containingFeatures,
    query: point,
  }
}
