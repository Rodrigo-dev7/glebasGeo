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
  const displayCoordinates =
    feature?.properties?.displayCoordinates ||
    feature?.geometry?.coordinates?.[0] ||
    []

  if (displayCoordinates.length > 1) {
    const first = displayCoordinates[0]
    const last = displayCoordinates[displayCoordinates.length - 1]

    if (coordinatesEqual(first, last)) {
      return displayCoordinates.slice(0, -1).map(([lon, lat]) => [Number(lon), Number(lat)])
    }
  }

  return displayCoordinates.map(([lon, lat]) => [Number(lon), Number(lat)])
}

function buildFeatureGeometryState(editableCoordinates) {
  const normalizedCoordinates = editableCoordinates.map(([lon, lat]) => [Number(lon), Number(lat)])
  const displayCoordinates = ensureClosedRing(normalizedCoordinates)
  const originalCoordinates = [...displayCoordinates]
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
