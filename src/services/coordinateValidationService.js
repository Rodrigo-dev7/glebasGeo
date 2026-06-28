const EARTH_RADIUS_METERS = 6371008.8
const DEFAULT_TOLERANCE_METERS = 10

function toRadians(value) {
  return (Number(value) * Math.PI) / 180
}

function haversineDistanceMeters(left, right) {
  const leftLat = Number(left.lat ?? left[1])
  const leftLon = Number(left.lon ?? left[0])
  const rightLat = Number(right.lat ?? right[1])
  const rightLon = Number(right.lon ?? right[0])

  if (
    !Number.isFinite(leftLat) ||
    !Number.isFinite(leftLon) ||
    !Number.isFinite(rightLat) ||
    !Number.isFinite(rightLon)
  ) {
    return Infinity
  }

  const deltaLat = toRadians(rightLat - leftLat)
  const deltaLon = toRadians(rightLon - leftLon)
  const leftLatRad = toRadians(leftLat)
  const rightLatRad = toRadians(rightLat)
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(leftLatRad) * Math.cos(rightLatRad) * Math.sin(deltaLon / 2) ** 2

  return 2 * EARTH_RADIUS_METERS * Math.atan2(
    Math.sqrt(haversine),
    Math.sqrt(Math.max(0, 1 - haversine))
  )
}

function longitudeScaleAtLatitude(lat) {
  return Math.max(Math.cos(toRadians(lat)), 0.000001)
}

function projectCoordinateToMeters(coordinate, originLat) {
  const lon = Number(coordinate.lon ?? coordinate[0])
  const lat = Number(coordinate.lat ?? coordinate[1])

  return {
    x: toRadians(lon) * EARTH_RADIUS_METERS * longitudeScaleAtLatitude(originLat),
    y: toRadians(lat) * EARTH_RADIUS_METERS,
  }
}

function distancePointToSegmentMeters(point, start, end) {
  const originLat = Number(point.lat)
  const projectedPoint = projectCoordinateToMeters(point, originLat)
  const projectedStart = projectCoordinateToMeters(start, originLat)
  const projectedEnd = projectCoordinateToMeters(end, originLat)
  const segmentX = projectedEnd.x - projectedStart.x
  const segmentY = projectedEnd.y - projectedStart.y
  const segmentLengthSquared = segmentX ** 2 + segmentY ** 2

  if (segmentLengthSquared <= Number.EPSILON) {
    return Math.hypot(projectedPoint.x - projectedStart.x, projectedPoint.y - projectedStart.y)
  }

  const rawProjection =
    ((projectedPoint.x - projectedStart.x) * segmentX +
      (projectedPoint.y - projectedStart.y) * segmentY) /
    segmentLengthSquared
  const projection = Math.max(0, Math.min(1, rawProjection))
  const closestPoint = {
    x: projectedStart.x + projection * segmentX,
    y: projectedStart.y + projection * segmentY,
  }

  return Math.hypot(projectedPoint.x - closestPoint.x, projectedPoint.y - closestPoint.y)
}

function toleranceToDegreePadding(toleranceMeters, referenceLat) {
  const latPadding = (toleranceMeters / EARTH_RADIUS_METERS) * (180 / Math.PI)
  const lonPadding = latPadding / longitudeScaleAtLatitude(referenceLat)

  return { latPadding, lonPadding }
}

function pointMatchesVertex(point, vertex, toleranceMeters = DEFAULT_TOLERANCE_METERS) {
  const [vertexLon, vertexLat] = vertex
  return haversineDistanceMeters(point, { lon: vertexLon, lat: vertexLat }) <= toleranceMeters
}

function pointOnSegment(point, start, end, toleranceMeters = DEFAULT_TOLERANCE_METERS) {
  return distancePointToSegmentMeters(point, start, end) <= toleranceMeters
}

function pointInRing(point, ring, toleranceMeters = DEFAULT_TOLERANCE_METERS) {
  let inside = false

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index]
    const prior = ring[previous]

    if (pointOnSegment(point, prior, current, toleranceMeters)) {
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

function pointInBoundingBox(point, ring, toleranceMeters = DEFAULT_TOLERANCE_METERS) {
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

  const { latPadding, lonPadding } = toleranceToDegreePadding(toleranceMeters, point.lat)

  return (
    point.lon >= minLon - lonPadding &&
    point.lon <= maxLon + lonPadding &&
    point.lat >= minLat - latPadding &&
    point.lat <= maxLat + latPadding
  )
}

export function validateCoordinateAgainstDataset(
  point,
  geojson,
  tolerance = DEFAULT_TOLERANCE_METERS
) {
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
  const toleranceMeters = Number.isFinite(Number(tolerance))
    ? Math.max(0, Number(tolerance))
    : DEFAULT_TOLERANCE_METERS

  for (const feature of geojson.features) {
    const ring = feature.geometry?.coordinates?.[0] || []
    if (!ring.length) continue

    const hasExactMatch = ring.some((vertex) => pointMatchesVertex(point, vertex, toleranceMeters))
    const isInside =
      hasExactMatch ||
      (pointInBoundingBox(point, ring, toleranceMeters) &&
        pointInRing(point, ring, toleranceMeters))

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
      message: `Coordenada encontrada nos vertices importados da base, considerando tolerancia de ${toleranceMeters} m.`,
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
      message: `Coordenada localizada dentro da gleba importada ou a ate ${toleranceMeters} m da borda.`,
      exactMatches,
      containingFeatures,
      query: point,
    }
  }

  return {
    status: 'missing',
    isMatch: false,
    matchType: 'none',
    message: `Coordenada fora das areas e sem correspondencia direta nos dados importados dentro da tolerancia de ${toleranceMeters} m.`,
    exactMatches,
    containingFeatures,
    query: point,
  }
}
