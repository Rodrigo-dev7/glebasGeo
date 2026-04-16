import { validateSicorPolygon } from './sicorGlebaValidationService'
import { calculatePolygonAreaHectares, enrichFeatureProperties } from './glebaEnrichmentService'

function coordinatesEqual(left, right) {
  if (!left || !right) return false
  return left[0] === right[0] && left[1] === right[1]
}

function ensureClosedRing(coordinates = []) {
  if (coordinates.length < 3) return coordinates

  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]

  return coordinatesEqual(first, last) ? coordinates : [...coordinates, first]
}

export function getEditableCoordinates(feature) {
  const originalCoordinates = feature?.properties?.originalCoordinates || []
  const coordinateStatuses = feature?.properties?.coordinateStatuses || []

  if (originalCoordinates.length) {
    return originalCoordinates.map(([lon, lat]) => [Number(lon), Number(lat)])
  }

  if (coordinateStatuses.length) {
    return coordinateStatuses.map(({ lon, lat }) => [Number(lon), Number(lat)])
  }

  const displayCoordinates =
    feature?.properties?.displayCoordinates ||
    feature?.geometry?.coordinates?.[0] ||
    []

  return displayCoordinates.map(([lon, lat]) => [Number(lon), Number(lat)])
}

function buildFeatureGeometryState(editableCoordinates) {
  const normalizedCoordinates = editableCoordinates.map(([lon, lat]) => [Number(lon), Number(lat)])
  const originalCoordinates = normalizedCoordinates.map(([lon, lat]) => [lon, lat])
  const displayCoordinates = ensureClosedRing(normalizedCoordinates)
  const sicor = validateSicorPolygon({
    originalCoordinates,
    displayCoordinates,
  })

  return {
    normalizedCoordinates,
    displayCoordinates,
    originalCoordinates,
    sicor,
  }
}

export function buildFeatureWithCoordinatesPreview(feature, editableCoordinates) {
  const {
    normalizedCoordinates,
    displayCoordinates,
    originalCoordinates,
    sicor,
  } = buildFeatureGeometryState(editableCoordinates)
  const calculatedArea = calculatePolygonAreaHectares(normalizedCoordinates)

  return {
    ...feature,
    properties: {
      ...feature.properties,
      area: calculatedArea,
      status: sicor.status,
      errors: sicor.errors,
      warnings: sicor.warnings,
      coordinateStatuses: sicor.coordinateStatuses,
      validationMetrics: sicor.metrics,
      originalCoordinates,
      displayCoordinates,
      total_pontos: normalizedCoordinates.length,
      enrichment: {
        ...feature.properties?.enrichment,
        areaSource: 'calculated',
        areaCalculatedHa: calculatedArea,
      },
    },
    geometry: {
      ...feature.geometry,
      coordinates: [displayCoordinates],
    },
  }
}

export async function rebuildFeatureWithCoordinates(feature, editableCoordinates) {
  const previewFeature = buildFeatureWithCoordinatesPreview(feature, editableCoordinates)
  const enrichment = await enrichFeatureProperties({
    feature: previewFeature,
    originalCoordinates: previewFeature.properties.originalCoordinates,
    existingProperties: previewFeature.properties || {},
  })

  return {
    ...previewFeature,
    properties: {
      ...previewFeature.properties,
      area: enrichment.area,
      municipio: enrichment.municipio,
      uf: enrichment.uf,
      enrichment,
    },
  }
}
