/**
 * useGlebas.js
 * Hook customizado que centraliza o estado das glebas,
 * filtros ativos, importacao Excel e validacao por coordenadas.
 */
import { useCallback, useMemo, useState } from 'react'
import { getStats } from '../services/validationService'
import { importDatasetFiles } from '../services/datasetImportService'
import { validateCoordinateAgainstDataset } from '../services/coordinateValidationService'
import { buildValidationReport, downloadValidationReport } from '../services/reportService'
import { parseCarReferenceFile } from '../services/kmlGeoService'
import { normalizeCarReferenceDataset } from '../services/carReferenceFeatureService'
import { analyzeCarReferenceContainment } from '../services/carContainmentAnalysisService'
import {
  applyCarOverlapValidationToFeature,
  applyCarOverlapValidationToFeatureCollection,
} from '../services/carOverlapValidationService'
import {
  buildFeatureWithCoordinatesPreview,
  rebuildFeatureWithCoordinates,
} from '../services/featureGeometryService'

const EMPTY_DATASET = {
  type: 'FeatureCollection',
  features: [],
}

const STORAGE_PREFIX = 'glebasgeo:'

function clearProjectBrowserStorage() {
  if (typeof window === 'undefined') return

  ;[window.localStorage, window.sessionStorage].forEach((storage) => {
    if (!storage) return

    try {
      const keysToRemove = []
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key?.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(key)
        }
      }

      keysToRemove.forEach((key) => storage.removeItem(key))
    } catch {
      // Navegadores podem bloquear Storage em modos restritos; a limpeza em memoria continua.
    }
  })
}

function createCarDatasetId(dataset) {
  return `${dataset.metadata.fileName}-${dataset.metadata.importedAt}`
}

function createImportedDatasetViewportKey(dataset) {
  if (!dataset?.metadata) {
    return `dataset-${Date.now()}`
  }

  return dataset.metadata.datasetKey || `${dataset.metadata.fileName}-${dataset.metadata.importedAt}`
}

function removeFeatureFromGeojson(geojson, featureId) {
  if (!geojson?.features?.length || !featureId) return geojson

  return {
    ...geojson,
    features: geojson.features.filter((feature) => feature.properties?.id !== featureId),
  }
}

function countGeojsonRows(geojson) {
  return (geojson?.features || []).reduce(
    (total, feature) => total + (
      feature.properties?.coordinateStatuses?.length ||
      feature.geometry?.coordinates?.[0]?.length ||
      0
    ),
    0
  )
}

function updateDatasetMetadataForGeojson(metadata = {}, geojson) {
  const features = geojson?.features || []

  return {
    ...metadata,
    rowCount: countGeojsonRows(geojson),
    glebaCount: features.length,
  }
}

function getSingleCarReferenceFeatureId(dataset) {
  const features = dataset?.geojson?.features || []

  if (features.length !== 1) {
    return null
  }

  return features[0]?.properties?.id || null
}

function normalizeFileList(input) {
  if (!input) return []
  if (Array.isArray(input)) return input.filter(Boolean)
  if (typeof input !== 'string' && typeof input.length === 'number') {
    return Array.from(input).filter(Boolean)
  }

  return [input].filter(Boolean)
}

function getFileExtension(file) {
  const fileName = file?.name || ''
  const extensionStart = fileName.lastIndexOf('.')

  return extensionStart >= 0 ? fileName.slice(extensionStart + 1).toLowerCase() : ''
}

function getFileBaseName(file) {
  return String(file?.name || '')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
}

function buildCarReferenceImportItems(files = []) {
  const dbfFilesByBaseName = new Map()

  files.forEach((file) => {
    if (getFileExtension(file) === 'dbf') {
      dbfFilesByBaseName.set(getFileBaseName(file), file)
    }
  })

  return files
    .filter((file) => getFileExtension(file) !== 'dbf')
    .map((file) => {
      if (getFileExtension(file) !== 'shp') {
        return { file, options: {}, fileName: file.name }
      }

      const dbfFile = dbfFilesByBaseName.get(getFileBaseName(file)) || null

      return {
        file,
        options: { dbfFile },
        fileName: dbfFile ? `${file.name} + ${dbfFile.name}` : file.name,
      }
    })
}

async function buildCarReferenceDatasetFromImportItem(importItem) {
  const parsedDataset = await parseCarReferenceFile(importItem.file, importItem.options)

  return normalizeCarReferenceDataset({
    ...parsedDataset,
    datasetId: createCarDatasetId(parsedDataset),
  })
}

function buildCarReferenceValidationDataset(datasets = []) {
  const features = datasets.flatMap((dataset) =>
    (dataset.geojson?.features || []).map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        __carDatasetId: dataset.datasetId,
        __carDatasetName: dataset.metadata?.fileName || feature.properties?.origem_arquivo || 'Base CAR/KML',
        __carDatasetSourceType: dataset.metadata?.sourceType || feature.properties?.sourceType || null,
        __carLayerKey: dataset.datasetId && feature.properties?.id
          ? `${dataset.datasetId}::${feature.properties.id}`
          : feature.properties?.id || null,
      },
    }))
  )

  if (!features.length) {
    return null
  }

  return {
    datasetId: '__all-car-reference-datasets__',
    geojson: {
      type: 'FeatureCollection',
      features,
    },
    metadata: {
      fileName: datasets.length === 1
        ? datasets[0].metadata?.fileName || 'Base CAR/KML'
        : `${datasets.length} bases CAR/KML`,
      sourceType: 'car_reference_collection',
      rowCount: features.length,
      glebaCount: features.length,
      datasetCount: datasets.length,
    },
  }
}

export function useGlebas() {
  const [activeFilter, setActiveFilter] = useState('todas')
  const [selectedGleba, setSelectedGleba] = useState(null)
  const [importedDataset, setImportedDataset] = useState(null)
  const [importError, setImportError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [carReferenceDatasets, setCarReferenceDatasets] = useState([])
  const [activeCarReferenceDatasetId, setActiveCarReferenceDatasetId] = useState(null)
  const [selectedCarReferenceFeatureId, setSelectedCarReferenceFeatureId] = useState(null)
  const [carImportError, setCarImportError] = useState('')
  const [isImportingCar, setIsImportingCar] = useState(false)
  const [validationResult, setValidationResult] = useState(null)
  const [queryPoint, setQueryPoint] = useState(null)
  const [matchedFeatureIds, setMatchedFeatureIds] = useState([])
  const [mapViewportRequest, setMapViewportRequest] = useState(null)

  const carReferenceDatasetsWithContainment = useMemo(
    () => analyzeCarReferenceContainment(carReferenceDatasets),
    [carReferenceDatasets]
  )

  const activeCarReferenceDataset = useMemo(
    () => carReferenceDatasetsWithContainment.find((dataset) => dataset.datasetId === activeCarReferenceDatasetId) || null,
    [activeCarReferenceDatasetId, carReferenceDatasetsWithContainment]
  )

  const carReferenceValidationDataset = useMemo(
    () => buildCarReferenceValidationDataset(carReferenceDatasetsWithContainment),
    [carReferenceDatasetsWithContainment]
  )

  const selectedCarReferenceFeature = useMemo(
    () => (
      activeCarReferenceDataset?.geojson?.features?.find(
        (feature) => feature.properties?.id === selectedCarReferenceFeatureId
      ) || null
    ),
    [activeCarReferenceDataset, selectedCarReferenceFeatureId]
  )

  const activeDataset = importedDataset?.geojson || EMPTY_DATASET

  const applyCarValidationToDataset = useCallback(
    (geojson, carDataset = carReferenceValidationDataset) =>
      applyCarOverlapValidationToFeatureCollection(geojson, carDataset),
    [carReferenceValidationDataset]
  )

  const applyCarValidationToFeature = useCallback(
    (feature, carDataset = carReferenceValidationDataset) =>
      applyCarOverlapValidationToFeature(feature, carDataset),
    [carReferenceValidationDataset]
  )

  const syncValidationStateForGeojson = useCallback((geojson) => {
    if (!queryPoint) return

    const nextValidationResult = validateCoordinateAgainstDataset(queryPoint, geojson)
    setValidationResult(nextValidationResult)
    setMatchedFeatureIds(
      nextValidationResult.containingFeatures.map((feature) => feature.properties.id)
    )
  }, [queryPoint])

  const syncCarValidationState = useCallback((carDataset = carReferenceValidationDataset) => {
    setImportedDataset((currentDataset) => {
      if (!currentDataset?.geojson) return currentDataset

      return {
        ...currentDataset,
        geojson: applyCarOverlapValidationToFeatureCollection(currentDataset.geojson, carDataset),
      }
    })

    setSelectedGleba((currentSelectedGleba) => (
      currentSelectedGleba
        ? applyCarOverlapValidationToFeature(currentSelectedGleba, carDataset)
        : currentSelectedGleba
    ))
  }, [carReferenceValidationDataset])

  const filteredData = useMemo(() => {
    if (activeFilter === 'todas') return activeDataset

    return {
      ...activeDataset,
      features: activeDataset.features.filter(
        (feature) => feature.properties.status === activeFilter
      ),
    }
  }, [activeDataset, activeFilter])

  const visibleFeatureIds = useMemo(() => {
    const ids = new Set(
      filteredData.features.map((feature) => feature.properties.id)
    )

    matchedFeatureIds.forEach((featureId) => ids.add(featureId))

    if (selectedGleba?.properties?.id) {
      ids.add(selectedGleba.properties.id)
    }

    return [...ids]
  }, [filteredData, matchedFeatureIds, selectedGleba])

  const filteredFeatureIds = useMemo(
    () => filteredData.features.map((feature) => feature.properties.id),
    [filteredData]
  )

  const stats = useMemo(
    () => getStats(activeDataset.features),
    [activeDataset]
  )

  const handleFilterChange = useCallback((filter) => {
    setActiveFilter(filter)

    setSelectedGleba((currentSelectedGleba) => {
      if (
        currentSelectedGleba &&
        filter !== 'todas' &&
        currentSelectedGleba.properties.status !== filter
      ) {
        return null
      }

      return currentSelectedGleba
    })
  }, [])

  const importDataset = useCallback(async (files) => {
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [files].filter(Boolean)
    if (!normalizedFiles.length) return

    setIsImporting(true)
    setImportError('')

    try {
      const dataset = await importDatasetFiles(normalizedFiles)
      const datasetWithCarValidation = {
        ...dataset,
        sourceGeojson: dataset.geojson,
        geojson: applyCarValidationToDataset(dataset.geojson),
      }

      setImportedDataset(datasetWithCarValidation)
      setActiveFilter('todas')
      setSelectedGleba(null)
      setValidationResult(null)
      setQueryPoint(null)
      setMatchedFeatureIds([])
      setMapViewportRequest({
        type: 'dataset',
        datasetKey: createImportedDatasetViewportKey(datasetWithCarValidation),
      })
    } catch (error) {
      setImportError(error.message || 'Nao foi possivel processar o(s) arquivo(s) informado(s).')
    } finally {
      setIsImporting(false)
    }
  }, [applyCarValidationToDataset])

  const resetImportedDatasetCoordinates = useCallback(() => {
    if (!importedDataset?.sourceGeojson?.features?.length) {
      return false
    }

    const restoredGeojson = applyCarValidationToDataset(importedDataset.sourceGeojson)

    setImportedDataset((currentDataset) => (
      currentDataset
        ? {
            ...currentDataset,
            geojson: restoredGeojson,
          }
        : currentDataset
    ))

    setSelectedGleba((currentSelectedGleba) => {
      if (!currentSelectedGleba?.properties?.id) {
        return currentSelectedGleba
      }

      return restoredGeojson.features.find(
        (feature) => feature.properties.id === currentSelectedGleba.properties.id
      ) || null
    })

    syncValidationStateForGeojson(restoredGeojson)
    return true
  }, [applyCarValidationToDataset, importedDataset, syncValidationStateForGeojson])

  const importCarReferenceDataset = useCallback(async (input) => {
    const files = normalizeFileList(input)
    if (!files.length) return

    setIsImportingCar(true)
    setCarImportError('')

    try {
      const importItems = buildCarReferenceImportItems(files)

      if (!importItems.length) {
        throw new Error('Selecione ao menos um arquivo KML, KMZ ou SHP. O DBF deve ser importado junto com o SHP correspondente.')
      }

      const importResults = await Promise.all(
        importItems.map(async (importItem) => {
          try {
            return {
              dataset: await buildCarReferenceDatasetFromImportItem(importItem),
              fileName: importItem.fileName,
              error: null,
            }
          } catch (error) {
            return {
              dataset: null,
              fileName: importItem.fileName || 'Arquivo CAR',
              error,
            }
          }
        })
      )
      const importedCarDatasets = importResults
        .map((result) => result.dataset)
        .filter(Boolean)
      const failedImports = importResults.filter((result) => result.error)

      if (!importedCarDatasets.length) {
        const [firstFailure] = failedImports
        throw new Error(
          firstFailure
            ? `${firstFailure.fileName}: ${firstFailure.error?.message || 'Nao foi possivel processar este arquivo.'}`
            : 'Nao foi possivel processar os arquivos KML/KMZ do CAR informados.'
        )
      }

      const importedDatasetIds = new Set(
        importedCarDatasets.map((dataset) => dataset.datasetId)
      )
      const nextCarDataset = importedCarDatasets[0]
      const nextCarDatasets = [
        ...importedCarDatasets,
        ...carReferenceDatasets.filter((dataset) => !importedDatasetIds.has(dataset.datasetId)),
      ]
      setCarReferenceDatasets(nextCarDatasets)
      setActiveCarReferenceDatasetId(nextCarDataset.datasetId)
      const defaultFeatureId = getSingleCarReferenceFeatureId(nextCarDataset)
      setSelectedCarReferenceFeatureId(defaultFeatureId)
      syncCarValidationState(buildCarReferenceValidationDataset(nextCarDatasets))
      setMapViewportRequest(
        defaultFeatureId
          ? {
              type: 'car-feature',
              datasetKey: nextCarDataset.datasetId,
              featureId: defaultFeatureId,
              requestKey: `${nextCarDataset.datasetId}-${defaultFeatureId}-${Date.now()}`,
            }
          : {
              type: 'car-reference',
              datasetKey: nextCarDataset.datasetId,
              requestKey: `${nextCarDataset.datasetId}-${Date.now()}`,
            }
      )

      if (failedImports.length) {
        setCarImportError(
          `Alguns arquivos nao foram importados: ${failedImports
            .map((result) => `${result.fileName}: ${result.error?.message || 'erro desconhecido'}`)
            .join(' | ')}`
        )
      }
    } catch (error) {
      setCarImportError(error.message || 'Nao foi possivel processar o(s) arquivo(s) KML/KMZ do CAR informado(s).')
    } finally {
      setIsImportingCar(false)
    }
  }, [carReferenceDatasets, syncCarValidationState])

  const selectCarReferenceDataset = useCallback((datasetId) => {
    const nextCarDataset = carReferenceDatasets.find((dataset) => dataset.datasetId === datasetId)
    if (!nextCarDataset) return

    setActiveCarReferenceDatasetId(nextCarDataset.datasetId)
    const defaultFeatureId = getSingleCarReferenceFeatureId(nextCarDataset)
    setSelectedCarReferenceFeatureId(defaultFeatureId)
    setCarImportError('')
    syncCarValidationState()
  }, [carReferenceDatasets, syncCarValidationState])

  const selectCarReferenceFeature = useCallback((datasetId, featureId) => {
    const nextCarDataset = carReferenceDatasets.find((dataset) => dataset.datasetId === datasetId)
    const nextFeature = nextCarDataset?.geojson?.features?.find(
      (feature) => feature.properties?.id === featureId
    )

    if (!nextCarDataset || !nextFeature?.properties?.id) return

    setActiveCarReferenceDatasetId(nextCarDataset.datasetId)
    setSelectedCarReferenceFeatureId(nextFeature.properties.id)
    setCarImportError('')
    syncCarValidationState()
  }, [carReferenceDatasets, syncCarValidationState])

  const removeCarReferenceDataset = useCallback((datasetId) => {
    const remainingDatasets = carReferenceDatasets.filter((dataset) => dataset.datasetId !== datasetId)
    const removedWasActive = activeCarReferenceDatasetId === datasetId
    const nextActiveCarDataset = removedWasActive
      ? remainingDatasets[0] || null
      : activeCarReferenceDataset

    setCarReferenceDatasets(remainingDatasets)
    setActiveCarReferenceDatasetId(nextActiveCarDataset?.datasetId || null)
    if (removedWasActive) {
      setSelectedCarReferenceFeatureId(getSingleCarReferenceFeatureId(nextActiveCarDataset))
    }
    syncCarValidationState(buildCarReferenceValidationDataset(remainingDatasets))

    if (nextActiveCarDataset) {
      const defaultFeatureId = getSingleCarReferenceFeatureId(nextActiveCarDataset)
      setMapViewportRequest(
        defaultFeatureId
          ? {
              type: 'car-feature',
              datasetKey: nextActiveCarDataset.datasetId,
              featureId: defaultFeatureId,
              requestKey: `${nextActiveCarDataset.datasetId}-${defaultFeatureId}-${Date.now()}`,
            }
          : {
              type: 'car-reference',
              datasetKey: nextActiveCarDataset.datasetId,
              requestKey: `${nextActiveCarDataset.datasetId}-${Date.now()}`,
            }
      )
      return
    }

    if (importedDataset?.geojson?.features?.length) {
      setMapViewportRequest({
        type: 'dataset',
        datasetKey: `${createImportedDatasetViewportKey(importedDataset)}-${Date.now()}`,
      })
      return
    }

    setMapViewportRequest({
      type: 'home',
      requestKey: `home-${Date.now()}`,
    })
  }, [
    activeCarReferenceDataset,
    activeCarReferenceDatasetId,
    carReferenceDatasets,
    importedDataset,
    syncCarValidationState,
  ])

  const clearCarReferenceDataset = useCallback(() => {
    setCarReferenceDatasets([])
    setActiveCarReferenceDatasetId(null)
    setSelectedCarReferenceFeatureId(null)
    setCarImportError('')
    syncCarValidationState(null)

    if (importedDataset?.geojson?.features?.length) {
      setMapViewportRequest({
        type: 'dataset',
        datasetKey: `${createImportedDatasetViewportKey(importedDataset)}-${Date.now()}`,
      })
      return
    }

    setMapViewportRequest({
      type: 'home',
      requestKey: `home-${Date.now()}`,
    })
  }, [importedDataset, syncCarValidationState])

  const clearImportedDataset = useCallback(() => {
    setImportedDataset(null)
    setImportError('')
    setValidationResult(null)
    setQueryPoint(null)
    setSelectedGleba(null)
    setActiveFilter('todas')
    setMatchedFeatureIds([])
    setMapViewportRequest({
      type: 'home',
      requestKey: `home-${Date.now()}`,
    })
  }, [])

  const clearApplicationData = useCallback(() => {
    clearProjectBrowserStorage()
    setImportedDataset(null)
    setImportError('')
    setCarReferenceDatasets([])
    setActiveCarReferenceDatasetId(null)
    setSelectedCarReferenceFeatureId(null)
    setCarImportError('')
    setValidationResult(null)
    setQueryPoint(null)
    setSelectedGleba(null)
    setActiveFilter('todas')
    setMatchedFeatureIds([])
    setMapViewportRequest({
      type: 'home',
      requestKey: `home-${Date.now()}`,
    })
  }, [])

  const removeGleba = useCallback((featureId) => {
    if (!featureId) return false
    if (!importedDataset?.geojson?.features?.length) return false

    const hasFeature = importedDataset.geojson.features.some(
      (feature) => feature.properties?.id === featureId
    )
    if (!hasFeature) return false

    const nextGeojson = removeFeatureFromGeojson(importedDataset.geojson, featureId)

    setImportedDataset((currentDataset) => {
      if (!currentDataset?.geojson?.features?.length) return currentDataset

      const currentHasFeature = currentDataset.geojson.features.some(
        (feature) => feature.properties?.id === featureId
      )
      if (!currentHasFeature) return currentDataset

      const geojson = removeFeatureFromGeojson(currentDataset.geojson, featureId)
      const sourceGeojson = removeFeatureFromGeojson(currentDataset.sourceGeojson, featureId)

      return {
        ...currentDataset,
        geojson,
        sourceGeojson,
        metadata: updateDatasetMetadataForGeojson(currentDataset.metadata, geojson),
      }
    })

    setMatchedFeatureIds((currentIds) => currentIds.filter((id) => id !== featureId))
    setSelectedGleba((currentSelectedGleba) => (
      currentSelectedGleba?.properties?.id === featureId ? null : currentSelectedGleba
    ))

    syncValidationStateForGeojson(nextGeojson)

    if (!nextGeojson.features.length) {
      setValidationResult(null)
      setQueryPoint(null)
      setActiveFilter('todas')
      setMapViewportRequest({
        type: 'home',
        requestKey: `home-${Date.now()}`,
      })
    }

    return true
  }, [importedDataset, syncValidationStateForGeojson])

  const validateCoordinate = useCallback(({ lat, lon }) => {
    const point = { lat, lon }
    setQueryPoint(point)

    const result = validateCoordinateAgainstDataset(point, activeDataset)
    setValidationResult(result)

    const nextMatchedFeatureIds = result.containingFeatures.map(
      (feature) => feature.properties.id
    )
    setMatchedFeatureIds(nextMatchedFeatureIds)

    const highlightedFeature =
      result.exactMatches[0] ||
      result.containingFeatures[0] ||
      null

    setSelectedGleba(highlightedFeature)
    setMapViewportRequest(
      highlightedFeature
        ? {
            type: 'feature',
            featureId: highlightedFeature.properties.id,
            point,
            requestKey: `${highlightedFeature.properties.id}-${Date.now()}`,
          }
        : {
            type: 'feature-set',
            featureIds: filteredFeatureIds,
            point,
            requestKey: `feature-set-${Date.now()}`,
          }
    )

    return result
  }, [activeDataset, filteredFeatureIds])

  const updateFeatureCoordinates = useCallback(async (featureId, coordinates, options = {}) => {
    if (!featureId || !importedDataset?.geojson?.features?.length) {
      return null
    }

    const featureToUpdate = importedDataset.geojson.features.find(
      (feature) => feature.properties?.id === featureId
    )

    if (!featureToUpdate) {
      return null
    }

    const replaceFeature = (geojson, featureToApply) => ({
      ...geojson,
      features: geojson.features.map((feature) =>
        feature.properties.id === featureToApply.properties.id ? featureToApply : feature
      ),
    })

    const optimisticFeature = applyCarValidationToFeature(
      buildFeatureWithCoordinatesPreview(featureToUpdate, coordinates)
    )
    const optimisticGeojson = replaceFeature(importedDataset.geojson, optimisticFeature)

    setImportedDataset((currentDataset) => (
      currentDataset
        ? {
            ...currentDataset,
            geojson: replaceFeature(currentDataset.geojson, optimisticFeature),
          }
        : currentDataset
    ))
    setSelectedGleba((currentSelectedGleba) => (
      currentSelectedGleba?.properties?.id === optimisticFeature.properties.id || options.select
        ? optimisticFeature
        : currentSelectedGleba
    ))

    syncValidationStateForGeojson(optimisticGeojson)

    try {
      const enrichedFeature = applyCarValidationToFeature(
        await rebuildFeatureWithCoordinates(optimisticFeature, coordinates)
      )
      const enrichedGeojson = replaceFeature(optimisticGeojson, enrichedFeature)

      setImportedDataset((currentDataset) => (
        currentDataset
          ? {
              ...currentDataset,
              geojson: replaceFeature(currentDataset.geojson, enrichedFeature),
            }
          : currentDataset
      ))
      setSelectedGleba((currentSelectedGleba) => (
        currentSelectedGleba?.properties?.id === enrichedFeature.properties.id || options.select
          ? enrichedFeature
          : currentSelectedGleba
      ))

      syncValidationStateForGeojson(enrichedGeojson)

      return enrichedFeature
    } catch {
      return optimisticFeature
    }
  }, [applyCarValidationToFeature, importedDataset, syncValidationStateForGeojson])

  const updateSelectedGlebaCoordinates = useCallback(async (coordinates) => {
    if (!selectedGleba?.properties?.id) {
      return null
    }

    return updateFeatureCoordinates(selectedGleba.properties.id, coordinates, { select: true })
  }, [selectedGleba, updateFeatureCoordinates])

  const exportReport = useCallback(() => {
    const report = buildValidationReport({
      dataset: importedDataset,
      carReferenceDataset: activeCarReferenceDataset,
      validationResult,
      queryPoint,
      stats,
    })

    downloadValidationReport(report)
  }, [activeCarReferenceDataset, importedDataset, queryPoint, stats, validationResult])

  return {
    glebas: filteredData,
    allGlebas: activeDataset,
    validatedData: activeDataset,
    visibleFeatureIds,
    stats,
    selectedGleba,
    setSelectedGleba,
    activeFilter,
    setActiveFilter: handleFilterChange,
    importedDataset,
    importError,
    isImporting,
    importDataset,
    resetImportedDatasetCoordinates,
    removeGleba,
    clearImportedDataset,
    clearApplicationData,
    carReferenceDataset: activeCarReferenceDataset,
    carReferenceDatasets: carReferenceDatasetsWithContainment,
    activeCarReferenceDatasetId,
    selectedCarReferenceFeature,
    selectedCarReferenceFeatureId,
    carImportError,
    isImportingCar,
    importCarReferenceDataset,
    selectCarReferenceDataset,
    selectCarReferenceFeature,
    removeCarReferenceDataset,
    clearCarReferenceDataset,
    validationResult,
    validateCoordinate,
    queryPoint,
    exportReport,
    matchedFeatureIds,
    mapViewportRequest,
    updateFeatureCoordinates,
    updateSelectedGlebaCoordinates,
  }
}
