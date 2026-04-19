const TOLERANCE = 1e-10

function nearlyEqual(left, right, tolerance = TOLERANCE) {
  return Math.abs(left - right) <= tolerance
}

function coordinatesEqual(left, right, tolerance = TOLERANCE) {
  if (!left || !right) return false

  return nearlyEqual(left[0], right[0], tolerance) && nearlyEqual(left[1], right[1], tolerance)
}

function normalizeRing(ring = []) {
  const normalized = ring
    .map(([lon, lat]) => [Number(lon), Number(lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))

  if (normalized.length < 2) {
    return normalized
  }

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

function collectGeometrySamplePoints(geometry) {
  return geometryToPolygons(geometry).flatMap((polygon) => {
    return normalizeRing(polygon?.[0] || [])
  })
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

function pointInRing(point, ring = []) {
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
    properties.id ||
    fallback
  )
}

function buildRelation(dataset, feature) {
  return {
    datasetId: dataset.datasetId,
    datasetName: dataset.metadata?.fileName || 'Arquivo KML/KMZ',
    featureId: feature.properties?.id || null,
    featureName: getFeatureName(feature),
  }
}

function addUniqueRelation(list, relation) {
  if (!relation?.datasetId || !relation?.featureId) return

  const exists = list.some((current) =>
    current.datasetId === relation.datasetId &&
    current.featureId === relation.featureId
  )

  if (!exists) {
    list.push(relation)
  }
}

function buildEmptyFeatureAnalysis() {
  return {
    inside: [],
    contains: [],
  }
}

function summarizeDatasetContainment(features = []) {
  const summary = {
    inside: [],
    contains: [],
  }

  features.forEach((feature) => {
    const analysis = feature.properties?.kmlContainment || buildEmptyFeatureAnalysis()

    analysis.inside.forEach((relation) => addUniqueRelation(summary.inside, relation))
    analysis.contains.forEach((relation) => addUniqueRelation(summary.contains, relation))
  })

  return summary
}

export function analyzeCarReferenceContainment(datasets = []) {
  const features = datasets.flatMap((dataset) =>
    (dataset.geojson?.features || []).map((feature) => ({
      dataset,
      feature,
      featureId: feature.properties?.id || null,
      analysis: buildEmptyFeatureAnalysis(),
    }))
  )

  for (let leftIndex = 0; leftIndex < features.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < features.length; rightIndex += 1) {
      if (leftIndex === rightIndex) continue

      const inner = features[leftIndex]
      const container = features[rightIndex]

      if (!inner.featureId || !container.featureId) continue
      if (inner.dataset.datasetId === container.dataset.datasetId) continue
      if (!geometryContainsGeometry(container.feature.geometry, inner.feature.geometry)) continue

      addUniqueRelation(inner.analysis.inside, buildRelation(container.dataset, container.feature))
      addUniqueRelation(container.analysis.contains, buildRelation(inner.dataset, inner.feature))
    }
  }

  return datasets.map((dataset) => {
    const nextFeatures = (dataset.geojson?.features || []).map((feature) => {
      const featureAnalysis = features.find((candidate) =>
        candidate.dataset.datasetId === dataset.datasetId &&
        candidate.featureId === feature.properties?.id
      )?.analysis || buildEmptyFeatureAnalysis()

      return {
        ...feature,
        properties: {
          ...feature.properties,
          kmlContainment: featureAnalysis,
        },
      }
    })

    return {
      ...dataset,
      geojson: {
        ...dataset.geojson,
        features: nextFeatures,
      },
      metadata: {
        ...dataset.metadata,
        kmlContainment: summarizeDatasetContainment(nextFeatures),
      },
    }
  })
}
