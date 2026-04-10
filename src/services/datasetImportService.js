import { parseExcelGeoFile } from './excelGeoService'
import { validateSicorPolygon } from './sicorGlebaValidationService'
import { enrichFeatureProperties } from './glebaEnrichmentService'

function normalizeFileList(input) {
  if (!input) return []
  return Array.isArray(input) ? input.filter(Boolean) : [input]
}

function withDatasetMetadata(dataset, files) {
  const normalizedFiles = normalizeFileList(files)
  const fileNames = normalizedFiles.map((file) => file.name)
  const sourceTypes = [...new Set(
    [dataset.metadata?.sourceType].flat().filter(Boolean)
  )]
  const importedAt = dataset.metadata?.importedAt || new Date().toISOString()

  return {
    ...dataset,
    metadata: {
      ...dataset.metadata,
      fileCount: fileNames.length || 1,
      fileNames: fileNames.length ? fileNames : [dataset.metadata?.fileName].filter(Boolean),
      fileName: fileNames.length > 1
        ? `${fileNames.length} arquivos`
        : (fileNames[0] || dataset.metadata?.fileName || 'Arquivo importado'),
      sourceTypes,
      sourceType: sourceTypes.length > 1 ? 'mixed' : (sourceTypes[0] || dataset.metadata?.sourceType || 'desconhecido'),
      importedAt,
      datasetKey: `dataset-${importedAt}`,
    },
  }
}

function buildUniqueFeatureId(baseId, idUsageMap) {
  const normalizedBaseId = String(baseId || 'GLEBA').trim() || 'GLEBA'
  const currentCount = idUsageMap.get(normalizedBaseId) || 0
  idUsageMap.set(normalizedBaseId, currentCount + 1)

  if (currentCount === 0) {
    return normalizedBaseId
  }

  return `${normalizedBaseId} (${currentCount + 1})`
}

function mergeImportedDatasets(datasets) {
  const idUsageMap = new Map()
  const features = datasets.flatMap((dataset) =>
    (dataset.geojson?.features || []).map((feature) => {
      const originalFeatureId = feature.properties?.id || null
      const nextFeatureId = buildUniqueFeatureId(originalFeatureId, idUsageMap)

      return {
        ...feature,
        properties: {
          ...feature.properties,
          id: nextFeatureId,
          originalFeatureId,
        },
      }
    })
  )

  const fileNames = datasets.flatMap((dataset) => dataset.metadata?.fileNames || dataset.metadata?.fileName || [])
  const sourceTypes = [...new Set(datasets.flatMap((dataset) => dataset.metadata?.sourceTypes || dataset.metadata?.sourceType || []))]
  const importedAt = new Date().toISOString()

  return {
    geojson: {
      type: 'FeatureCollection',
      features,
    },
    metadata: {
      fileCount: fileNames.length,
      fileNames,
      fileName: `${fileNames.length} arquivos`,
      sheetName: null,
      rowCount: datasets.reduce((total, dataset) => total + (dataset.metadata?.rowCount || 0), 0),
      glebaCount: features.length,
      importedAt,
      sourceTypes,
      sourceType: sourceTypes.length > 1 ? 'mixed' : (sourceTypes[0] || 'desconhecido'),
      datasetKey: `dataset-${importedAt}`,
    },
  }
}

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

export async function importDatasetFiles(files) {
  const normalizedFiles = normalizeFileList(files)

  if (!normalizedFiles.length) {
    throw new Error('Nenhum arquivo foi selecionado.')
  }

  const importedDatasets = await Promise.all(
    normalizedFiles.map(async (file) => {
      try {
        return await importDatasetFile(file)
      } catch (error) {
        throw new Error(`${file.name}: ${error.message || 'Nao foi possivel importar este arquivo.'}`)
      }
    })
  )

  if (importedDatasets.length === 1) {
    return withDatasetMetadata(importedDatasets[0], normalizedFiles)
  }

  return mergeImportedDatasets(
    importedDatasets.map((dataset, index) => withDatasetMetadata(dataset, normalizedFiles[index]))
  )
}
