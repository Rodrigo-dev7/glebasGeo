/**
 * useGlebas.js
 * Hook customizado que centraliza o estado das glebas,
 * filtros ativos, importacao Excel e validacao por coordenadas.
 */
import { useCallback, useMemo, useState } from 'react'
import { getStats } from '../services/validationService'
import { importDatasetFile } from '../services/datasetImportService'
import { validateCoordinateAgainstDataset } from '../services/coordinateValidationService'
import { buildValidationReport, downloadValidationReport } from '../services/reportService'
import { rebuildFeatureWithCoordinates } from '../services/featureGeometryService'

const EMPTY_DATASET = {
  type: 'FeatureCollection',
  features: [],
}

export function useGlebas() {
  const [activeFilter, setActiveFilter] = useState('todas')
  const [selectedGleba, setSelectedGleba] = useState(null)
  const [importedDataset, setImportedDataset] = useState(null)
  const [importError, setImportError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [validationResult, setValidationResult] = useState(null)
  const [queryPoint, setQueryPoint] = useState(null)
  const [matchedFeatureIds, setMatchedFeatureIds] = useState([])
  const [mapViewportRequest, setMapViewportRequest] = useState(null)

  const activeDataset = importedDataset?.geojson || EMPTY_DATASET

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

  const importDataset = useCallback(async (file) => {
    if (!file) return

    setIsImporting(true)
    setImportError('')

    try {
      const dataset = await importDatasetFile(file)

      setImportedDataset(dataset)
      setActiveFilter('todas')
      setSelectedGleba(null)
      setValidationResult(null)
      setQueryPoint(null)
      setMatchedFeatureIds([])
      setMapViewportRequest({
        type: 'dataset',
        datasetKey: `${dataset.metadata.fileName}-${dataset.metadata.importedAt}`,
      })
    } catch (error) {
      setImportError(error.message || 'Nao foi possivel processar o arquivo informado.')
    } finally {
      setIsImporting(false)
    }
  }, [])

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

  const updateSelectedGlebaCoordinates = useCallback(async (coordinates) => {
    if (!selectedGleba?.properties?.id || !importedDataset?.geojson?.features?.length) {
      return null
    }

    const updatedFeature = await rebuildFeatureWithCoordinates(selectedGleba, coordinates)

    const nextFeatures = importedDataset.geojson.features.map((feature) =>
      feature.properties.id === updatedFeature.properties.id ? updatedFeature : feature
    )

    const nextGeojson = {
      ...importedDataset.geojson,
      features: nextFeatures,
    }

    setImportedDataset((currentDataset) => (
      currentDataset
        ? {
            ...currentDataset,
            geojson: nextGeojson,
          }
        : currentDataset
    ))
    setSelectedGleba(updatedFeature)

    if (queryPoint) {
      const nextValidationResult = validateCoordinateAgainstDataset(queryPoint, nextGeojson)
      setValidationResult(nextValidationResult)
      setMatchedFeatureIds(
        nextValidationResult.containingFeatures.map((feature) => feature.properties.id)
      )
    }

    return updatedFeature
  }, [importedDataset, queryPoint, selectedGleba])

  const exportReport = useCallback(() => {
    const report = buildValidationReport({
      dataset: importedDataset,
      validationResult,
      queryPoint,
      stats,
    })

    downloadValidationReport(report)
  }, [importedDataset, queryPoint, stats, validationResult])

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
    clearImportedDataset,
    validationResult,
    validateCoordinate,
    queryPoint,
    exportReport,
    matchedFeatureIds,
    mapViewportRequest,
    updateSelectedGlebaCoordinates,
  }
}
