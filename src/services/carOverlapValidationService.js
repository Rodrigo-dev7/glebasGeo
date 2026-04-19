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
    (polygon || []).map((ring) => normalizeRing(ring))
  )
}

function geometryOuterRings(geometry) {
  return geometryToPolygons(geometry)
    .map((polygon) => normalizeRing(polygon?.[0] || []))
    .filter((ring) => ring.length >= 3)
}

function collectGeometrySamplePoints(geometry) {
  return geometryOuterRings(geometry).flat()
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

function pointInPolygon(point, polygon = []) {
  const [outerRing, ...innerRings] = polygon

  if (!pointInRing(point, outerRing || [])) {
    return false
  }

  return !innerRings.some((ring) => pointInRing(point, ring))
}

function pointInGeometry(point, geometry) {
  return geometryToPolygons(geometry).some((polygon) => pointInPolygon(point, polygon))
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

function geometryContainsGeometry(containerGeometry, innerGeometry) {
  const samplePoints = collectGeometrySamplePoints(innerGeometry)

  if (!samplePoints.length) {
    return false
  }

  return samplePoints.every((point) => pointInGeometry(point, containerGeometry))
}

function getFeatureName(feature, fallback = 'Imovel CAR') {
  const properties = feature?.properties || {}

  return (
    properties.nome ||
    properties.numero_car_recibo ||
    properties.codigo_imovel ||
    properties.cod_imovel ||
    properties.car ||
    properties.id ||
    fallback
  )
}

function resolveReferenceType(feature, metadata = null) {
  const properties = feature?.properties || {}
  const sourceType = String(
    properties.__carDatasetSourceType ||
    properties.sourceType ||
    metadata?.sourceType ||
    ''
  ).toLowerCase()

  if (
    properties.numero_car_recibo ||
    properties.codigo_imovel ||
    properties.cod_imovel ||
    sourceType.includes('car') ||
    sourceType.includes('shp')
  ) {
    return 'CAR'
  }

  return 'KML'
}

function getLayerKey(feature) {
  const properties = feature?.properties || {}
  const featureId = properties.id || null
  const datasetId = properties.__carDatasetId || null

  if (properties.__carLayerKey) return properties.__carLayerKey
  if (!featureId) return null

  return datasetId ? `${datasetId}::${featureId}` : featureId
}

function summarizeCarFeature(feature, relation, metadata = null) {
  const properties = feature.properties || {}
  const referenceType = resolveReferenceType(feature, metadata)

  return {
    id: properties.id || null,
    nome: getFeatureName(feature),
    codigo: properties.numero_car_recibo || properties.cod_imovel || properties.codigo_imovel || null,
    datasetId: properties.__carDatasetId || metadata?.datasetId || null,
    datasetName: properties.__carDatasetName || properties.origem_arquivo || metadata?.fileName || null,
    layerKey: getLayerKey(feature),
    relation,
    relationLabel: relation === 'inside'
      ? `Gleba dentro do ${referenceType}`
      : `Gleba parcialmente dentro do ${referenceType}`,
    referenceType,
  }
}

function formatReferenceList(matches = []) {
  return matches
    .map((match) => match.nome || match.datasetName || null)
    .filter(Boolean)
    .join(' | ')
}

function formatRelationshipMessage(inside = [], partial = []) {
  if (inside.length) {
    const [primary] = inside
    const typeLabel = primary.referenceType || 'CAR/KML'
    const names = formatReferenceList(inside)

    return inside.length === 1
      ? `Gleba dentro do ${typeLabel}: ${names || 'imovel identificado'}.`
      : `Gleba dentro de ${inside.length} poligono(s) CAR/KML: ${names}.`
  }

  if (partial.length) {
    const [primary] = partial
    const typeLabel = primary.referenceType || 'CAR/KML'
    const names = formatReferenceList(partial)

    return partial.length === 1
      ? `Gleba parcialmente dentro do ${typeLabel}: ${names || 'imovel identificado'}.`
      : `Gleba parcialmente dentro de ${partial.length} poligono(s) CAR/KML: ${names}.`
  }

  return 'Nenhuma relacao espacial encontrada com as bases CAR/KML carregadas.'
}

export function buildCarOverlapValidation(feature, carGeojson, metadata = null) {
  if (!carGeojson?.features?.length) {
    return {
      status: 'not_loaded',
      overlapCount: 0,
      insideCount: 0,
      partialOverlapCount: 0,
      overlaps: [],
      inside: [],
      partialOverlaps: [],
      primaryMatch: null,
      referenceFileName: metadata?.fileName || null,
      message: 'Nenhuma base CAR/KML foi carregada para a analise espacial.',
      validatedAt: new Date().toISOString(),
    }
  }

  const relations = carGeojson.features
    .map((carFeature) => {
      if (geometryContainsGeometry(carFeature.geometry, feature.geometry)) {
        return summarizeCarFeature(carFeature, 'inside', metadata)
      }

      if (geometriesOverlap(feature.geometry, carFeature.geometry)) {
        return summarizeCarFeature(carFeature, 'partial', metadata)
      }

      return null
    })
    .filter(Boolean)

  const inside = relations.filter((relation) => relation.relation === 'inside')
  const partialOverlaps = relations.filter((relation) => relation.relation === 'partial')
  const status = inside.length ? 'inside' : partialOverlaps.length ? 'partial' : 'clear'

  return {
    status,
    overlapCount: relations.length,
    insideCount: inside.length,
    partialOverlapCount: partialOverlaps.length,
    overlaps: relations,
    inside,
    partialOverlaps,
    primaryMatch: inside[0] || partialOverlaps[0] || null,
    referenceFileName: metadata?.fileName || null,
    message: formatRelationshipMessage(inside, partialOverlaps),
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
