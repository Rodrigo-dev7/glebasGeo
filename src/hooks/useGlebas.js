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

function createCarDatasetId(dataset) {
  return `${dataset.metadata.fileName}-${dataset.metadata.importedAt}`
}

function createImportedDatasetViewportKey(dataset) {
  if (!dataset?.metadata) {
    return `dataset-${Date.now()}`
  }

  return dataset.metadata.datasetKey || `${dataset.metadata.fileName}-${dataset.metadata.importedAt}`
}

export function useGlebas() {
  const [activeFilter, setActiveFilter] = useState('todas')
  const [selectedGleba, setSelectedGleba] = useState(null)
  const [importedDataset, setImportedDataset] = useState(null)
  const [importError, setImportError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [carReferenceDatasets, setCarReferenceDatasets] = useState([])
  const [activeCarReferenceDatasetId, setActiveCarReferenceDatasetId] = useState(null)
  const [carImportError, setCarImportError] = useState('')
  const [isImportingCar, setIsImportingCar] = useState(false)
  const [validationResult, setValidationResult] = useState(null)
  const [queryPoint, setQueryPoint] = useState(null)
  const [matchedFeatureIds, setMatchedFeatureIds] = useState([])
  const [mapViewportRequest, setMapViewportRequest] = useState(null)

  const activeCarReferenceDataset = useMemo(
    () => carReferenceDatasets.find((dataset) => dataset.datasetId === activeCarReferenceDatasetId) || null,
    [activeCarReferenceDatasetId, carReferenceDatasets]
  )

  const activeDataset = importedDataset?.geojson || EMPTY_DATASET

  const applyCarValidationToDataset = useCallback(
    (geojson, carDataset = activeCarReferenceDataset) =>
      applyCarOverlapValidationToFeatureCollection(geojson, carDataset),
    [activeCarReferenceDataset]
  )

  const applyCarValidationToFeature = useCallback(
    (feature, carDataset = activeCarReferenceDataset) =>
      applyCarOverlapValidationToFeature(feature, carDataset),
    [activeCarReferenceDataset]
  )

  const syncValidationStateForGeojson = useCallback((geojson) => {
    if (!queryPoint) return

    const nextValidationResult = validateCoordinateAgainstDataset(queryPoint, geojson)
    setValidationResult(nextValidationResult)
    setMatchedFeatureIds(
      nextValidationResult.containingFeatures.map((feature) => feature.properties.id)
    )
  }, [queryPoint])

  const syncCarValidationState = useCallback((carDataset = activeCarReferenceDataset) => {
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
  }, [activeCarReferenceDataset])

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

  const importCarReferenceDataset = useCallback(async (file) => {
    if (!file) return

    setIsImportingCar(true)
    setCarImportError('')

    try {
      const parsedDataset = await parseCarReferenceFile(file)
      const nextCarDataset = {
        ...parsedDataset,
        datasetId: createCarDatasetId(parsedDataset),
      }

      setCarReferenceDatasets((currentDatasets) => [
        nextCarDataset,
        ...currentDatasets.filter((dataset) => dataset.datasetId !== nextCarDataset.datasetId),
      ])
      setActiveCarReferenceDatasetId(nextCarDataset.datasetId)
      syncCarValidationState(nextCarDataset)
      setMapViewportRequest({
        type: 'car-reference',
        datasetKey: nextCarDataset.datasetId,
      })
    } catch (error) {
      setCarImportError(error.message || 'Nao foi possivel processar o arquivo KML/KMZ do CAR informado.')
    } finally {
      setIsImportingCar(false)
    }
  }, [syncCarValidationState])

  const selectCarReferenceDataset = useCallback((datasetId) => {
    const nextCarDataset = carReferenceDatasets.find((dataset) => dataset.datasetId === datasetId)
    if (!nextCarDataset) return

    setActiveCarReferenceDatasetId(nextCarDataset.datasetId)
    setCarImportError('')
    syncCarValidationState(nextCarDataset)
    setMapViewportRequest({
      type: 'car-reference',
      datasetKey: `${nextCarDataset.datasetId}-${Date.now()}`,
    })
  }, [carReferenceDatasets, syncCarValidationState])

  const removeCarReferenceDataset = useCallback((datasetId) => {
    const remainingDatasets = carReferenceDatasets.filter((dataset) => dataset.datasetId !== datasetId)
    const removedWasActive = activeCarReferenceDatasetId === datasetId
    const nextActiveCarDataset = removedWasActive
      ? remainingDatasets[0] || null
      : activeCarReferenceDataset

    setCarReferenceDatasets(remainingDatasets)
    setActiveCarReferenceDatasetId(nextActiveCarDataset?.datasetId || null)
    syncCarValidationState(nextActiveCarDataset)

    if (nextActiveCarDataset) {
      setMapViewportRequest({
        type: 'car-reference',
        datasetKey: `${nextActiveCarDataset.datasetId}-${Date.now()}`,
      })
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
    clearImportedDataset,
    carReferenceDataset: activeCarReferenceDataset,
    carReferenceDatasets,
    activeCarReferenceDatasetId,
    carImportError,
    isImportingCar,
    importCarReferenceDataset,
    selectCarReferenceDataset,
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
