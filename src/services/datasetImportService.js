import { parseExcelGeoFile } from './excelGeoService'
import { validateSicorPolygon } from './sicorGlebaValidationService'
import { enrichFeatureProperties } from './glebaEnrichmentService'

function closeRingForDisplay(coordinates) {
  if (coordinates.length < 3) return coordinates

  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]
  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates
  }

  return [...coordinates, first]
}

function normalizePolygonCoordinates(feature) {
  const raw = feature.geometry?.coordinates?.[0] || []
  return raw.map(([lon, lat]) => [Number(lon), Number(lat)])
}

async function normalizeGeoJsonFeature(feature, index, fileName) {
  const originalCoordinates = normalizePolygonCoordinates(feature)
  const displayCoordinates = closeRingForDisplay(originalCoordinates)
  const sicor = validateSicorPolygon({
    originalCoordinates,
    displayCoordinates,
  })
  const enrichment = await enrichFeatureProperties({
    feature,
    originalCoordinates,
    existingProperties: feature.properties || {},
  })

  return {
    ...feature,
    properties: {
      id: feature.properties?.id || `GEOJSON-${index + 1}`,
      nome: feature.properties?.nome || feature.properties?.name || `Gleba ${index + 1}`,
      tipo_uso: feature.properties?.tipo_uso || feature.properties?.uso || 'Importada via GeoJSON',
      situacao_cadastral: feature.properties?.situacao_cadastral || 'Importada via GeoJSON',
      origem_arquivo: fileName,
      sourceType: 'geojson',
      errors: sicor.errors,
      warnings: sicor.warnings,
      status: sicor.status,
      area: enrichment.area,
      municipio: enrichment.municipio,
      uf: enrichment.uf,
      coordinateStatuses: sicor.coordinateStatuses,
      validationMetrics: sicor.metrics,
      enrichment,
      originalCoordinates,
      displayCoordinates,
      ...feature.properties,
    },
    geometry: {
      ...feature.geometry,
      coordinates: [displayCoordinates],
    },
  }
}

async function parseGeoJsonFile(file) {
  const text = await file.text()
  let parsed

  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('O arquivo GeoJSON/JSON nao possui um conteudo JSON valido.')
  }

  const asCollection =
    parsed?.type === 'FeatureCollection'
      ? parsed
      : parsed?.type === 'Feature'
        ? { type: 'FeatureCollection', features: [parsed] }
        : null

  if (!asCollection?.features?.length) {
    throw new Error('O arquivo informado nao possui features para validar.')
  }

  const normalized = {
    type: 'FeatureCollection',
    features: await Promise.all(
      asCollection.features.map((feature, index) =>
        normalizeGeoJsonFeature(feature, index, file.name)
      )
    ),
  }

  return {
    geojson: normalized,
    metadata: {
      fileName: file.name,
      sheetName: null,
      rowCount: normalized.features.reduce(
        (total, feature) => total + (feature.properties.coordinateStatuses?.length || 0),
        0
      ),
      glebaCount: normalized.features.length,
      importedAt: new Date().toISOString(),
      sourceType: 'geojson',
    },
  }
}

export async function importDatasetFile(file) {
  const fileName = file?.name?.toLowerCase() || ''

  if (!file) {
    throw new Error('Nenhum arquivo foi selecionado.')
  }

  if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
    const dataset = await parseExcelGeoFile(file)
    return {
      ...dataset,
      metadata: {
        ...dataset.metadata,
        sourceType: 'excel',
      },
    }
  }

  if (fileName.endsWith('.geojson') || fileName.endsWith('.json')) {
    return parseGeoJsonFile(file)
  }

  throw new Error('Formato nao suportado. Use Excel (.xls/.xlsx) ou GeoJSON (.geojson/.json).')
}
