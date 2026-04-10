/**
 * MapView.jsx
 * Mapa interativo com poligonos, vertices e destaque das criticas SICOR.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Pane, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import Legend from './Legend'
import { getEditableCoordinates } from '../services/featureGeometryService'
import { calculatePolygonAreaHectares } from '../services/glebaEnrichmentService'

const BRAZIL_CENTER = [-14.235, -51.9253]
const BRAZIL_ZOOM = 4

const BASEMAPS = {
  dark: {
    key: 'dark',
    label: 'Mapa',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
  },
  satellite: {
    key: 'satellite',
    label: 'Satélite',
    labels: {
      key: 'esri-boundaries-places',
      attribution: 'Labels &copy; Esri, Garmin, HERE, OpenStreetMap contributors, and the GIS user community',
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 19,
    },
    sources: [
      {
        key: 'google-satellite',
        attribution: 'Map data &copy; Google',
        url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20,
      },
      {
        key: 'esri-world-imagery',
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 19,
      },
    ],
  },
}

function MapInvalidateOnLayout({ revision }) {
  const map = useMap()
  useEffect(() => {
    const id = requestAnimationFrame(() => map.invalidateSize())
    const t = setTimeout(() => map.invalidateSize(), 400)
    return () => {
      cancelAnimationFrame(id)
      clearTimeout(t)
    }
  }, [revision, map])
  return null
}

export const STATUS_STYLES = {
  valida: {
    fillColor: '#22c55e',
    color: '#16a34a',
    fillOpacity: 0.28,
    weight: 2.5,
  },
  invalida: {
    fillColor: '#ef4444',
    color: '#dc2626',
    fillOpacity: 0.32,
    weight: 2.8,
  },
  pendente: {
    fillColor: '#f59e0b',
    color: '#d97706',
    fillOpacity: 0.3,
    weight: 2.5,
  },
}

const SELECTED_OVERRIDES = {
  fillOpacity: 0.58,
  weight: 4,
}

const MATCHED_OVERRIDES = {
  color: '#38bdf8',
  fillColor: '#38bdf8',
  fillOpacity: 0.38,
  weight: 4.5,
}

const CAR_REFERENCE_STYLE = {
  color: '#c084fc',
  fillColor: '#a855f7',
  fillOpacity: 0.08,
  opacity: 0.95,
  weight: 2.2,
  dashArray: '10 6',
}

const CAR_REFERENCE_MATCHED_STYLE = {
  color: '#f59e0b',
  fillColor: '#f59e0b',
  fillOpacity: 0.2,
  opacity: 1,
  weight: 3,
  dashArray: '8 4',
}

const HIDDEN_STYLE = {
  color: 'transparent',
  fillColor: 'transparent',
  opacity: 0,
  fillOpacity: 0,
  weight: 0.1,
}

const DEFAULT_FLY_OPTIONS = {
  animate: true,
  duration: 1.6,
  easeLinearity: 0.18,
}

const FLY_BOUNDS_OPTIONS = {
  ...DEFAULT_FLY_OPTIONS,
  padding: [50, 50],
}

const FLY_FEATURE_BOUNDS_OPTIONS = {
  ...DEFAULT_FLY_OPTIONS,
  padding: [60, 60],
  maxZoom: 17,
}

const PERSISTENT_POPUP_OPTIONS = {
  className: 'custom-popup',
  maxWidth: 280,
  autoClose: false,
  closeOnClick: false,
}

// Small threshold to keep a simple click from entering the heavier drag path.
const DRAG_START_THRESHOLD_PX = 3
const COORDINATE_MATCH_TOLERANCE = 1e-10

function animateToBounds(map, bounds, options = {}) {
  if (!bounds?.isValid()) return
  map.flyToBounds(bounds, { ...FLY_BOUNDS_OPTIONS, ...options })
}

function animateToPoint(map, point, zoom = null, options = {}) {
  if (!point) return

  const targetZoom = Number.isFinite(zoom) ? zoom : map.getZoom()
  map.flyTo([point.lat, point.lon], targetZoom, {
    ...DEFAULT_FLY_OPTIONS,
    ...options,
  })
}

function getVisibleCoordinateIndexes({
  coordinates = [],
  coordinateStatuses = [],
  pointDisplayMode = 'marked',
}) {
  if (!coordinates.length) return []

  if (pointDisplayMode !== 'validated') {
    return coordinates.map((_, index) => index)
  }

  if (coordinates.length === 1) {
    return [0]
  }

  const visibleIndexes = new Set([0, coordinates.length - 1])

  coordinateStatuses.forEach((coordinate, index) => {
    if (coordinate?.isValid === false) {
      visibleIndexes.add(index)
    }
  })

  return [...visibleIndexes].sort((left, right) => left - right)
}

function coordinateHasOverlapIssue(coordinate) {
  return coordinate?.issues?.some((issue) => issue.code === 'GEOMETRIA_SOBREPOSTA')
}

function coordinatesMatch(left, right, tolerance = COORDINATE_MATCH_TOLERANCE) {
  if (!left || !right) return false

  return (
    Math.abs(Number(left[0]) - Number(right[0])) <= tolerance &&
    Math.abs(Number(left[1]) - Number(right[1])) <= tolerance
  )
}

function resolveEditableVertexIndex(feature, displayIndex) {
  const editableCoordinates = getEditableCoordinates(feature)
  const coordinateStatuses = feature?.properties?.coordinateStatuses || []
  const coordinate = coordinateStatuses[displayIndex]

  if (!editableCoordinates.length || !Number.isInteger(displayIndex) || displayIndex < 0) {
    return null
  }

  if (displayIndex < editableCoordinates.length) {
    return displayIndex
  }

  if (coordinate?.isLast && coordinate?.isRepeatedStart) {
    return 0
  }

  const matchedEditableIndex = editableCoordinates.findIndex((editableCoordinate) => (
    coordinatesMatch(editableCoordinate, [coordinate?.lon, coordinate?.lat])
  ))

  return matchedEditableIndex >= 0 ? matchedEditableIndex : null
}

function getVertexMarkerStyle(coordinate, isActive = false) {
  const hasOverlap = coordinateHasOverlapIssue(coordinate)

  return {
    radius: isActive
      ? (hasOverlap ? 11 : 8)
      : (hasOverlap ? 9 : 6),
    pathOptions: {
      color: hasOverlap ? '#fdba74' : coordinate?.isValid === false ? '#fecaca' : '#bbf7d0',
      weight: hasOverlap ? 3 : 2,
      fillColor: hasOverlap ? '#f97316' : coordinate?.isValid === false ? '#ef4444' : '#22c55e',
      fillOpacity: 1,
    },
  }
}

function getEditableVertexPathOptions(coordinate, isActive = false) {
  const markerStyle = getVertexMarkerStyle(coordinate, isActive)

  return {
    radius: markerStyle.radius + (isActive ? 1 : 1.5),
    pathOptions: {
      ...markerStyle.pathOptions,
      className: `gleba-edit-handle${isActive ? ' is-active' : ''}`,
    },
  }
}

function escapeHtml(value) {
  return String(value ?? '-')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatArea(area) {
  return typeof area === 'number' ? `${area} ha` : '-'
}

function normalizeNumericArea(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.').trim())
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function resolvePopupArea(feature, areaOverride = null) {
  if (typeof areaOverride === 'number') {
    return areaOverride
  }

  const ring =
    feature?.properties?.displayCoordinates ||
    feature?.geometry?.coordinates?.[0] ||
    []
  const calculatedArea = calculatePolygonAreaHectares(ring)

  return typeof calculatedArea === 'number'
    ? calculatedArea
    : feature?.properties?.area
}

function createVertexDragPreviewLayers(leafMap, selectedGleba, ringLonLat, vertexIndex) {
  const group = L.layerGroup().addTo(leafMap)
  const style = STATUS_STYLES[selectedGleba.properties.status] || STATUS_STYLES.pendente
  const ll = ringLonLat.map(([lon, lat]) => [lat, lon])
  const activeCoordinate = selectedGleba.properties.coordinateStatuses?.[vertexIndex]
  const activeVertexStyle = getVertexMarkerStyle(activeCoordinate, true)

  if (selectedGleba.properties.status === 'invalida' && selectedGleba.properties.originalCoordinates?.length > 1) {
    L.polyline(
      selectedGleba.properties.originalCoordinates.map(([lon, lat]) => [lat, lon]),
      { color: '#fca5a5', weight: 2, dashArray: '8 6', opacity: 0.95, interactive: false }
    ).addTo(group)
  }

  const shape = L.polyline([...ll, ll[0]], {
    color: style.color,
    weight: 2.75,
    opacity: 0.96,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  })
  shape.addTo(group)

  const outline = L.polyline([...ll, ll[0]], {
    color: '#f8fafc',
    weight: 1.5,
    dashArray: '3 6',
    opacity: 0.65,
    interactive: false,
  })
  outline.addTo(group)

  const helperLine = L.polyline([], {
    color: '#f8fafc',
    weight: 3,
    dashArray: '6 6',
    opacity: 0.95,
    interactive: false,
  })
  helperLine.addTo(group)

  const activeVertex = L.circleMarker(ll[vertexIndex], {
    ...activeVertexStyle.pathOptions,
    radius: activeVertexStyle.radius,
    interactive: false,
  })
  activeVertex.addTo(group)

  return { group, shape, outline, helperLine, activeVertex }
}

function updateVertexDragPreviewLayers(layers, selectedGleba, vertexIndex, ringLonLat) {
  if (!layers) return

  const ll = ringLonLat.map(([lon, lat]) => [lat, lon])
  layers.shape.setLatLngs([...ll, ll[0]])
  layers.outline.setLatLngs([...ll, ll[0]])
  const n = ringLonLat.length
  if (n > 2) {
    const prev = (vertexIndex - 1 + n) % n
    const next = (vertexIndex + 1) % n
    layers.helperLine.setLatLngs([
      [ringLonLat[prev][1], ringLonLat[prev][0]],
      [ringLonLat[vertexIndex][1], ringLonLat[vertexIndex][0]],
      [ringLonLat[next][1], ringLonLat[next][0]],
    ])
  } else {
    layers.helperLine.setLatLngs([])
  }

  layers.activeVertex.setLatLng([
    ringLonLat[vertexIndex][1],
    ringLonLat[vertexIndex][0],
  ])
}

function popupMarkup(feature, areaOverride = null) {
  const properties = feature.properties || {}
  const area = resolvePopupArea(feature, areaOverride)
  const carValidation = properties.carOverlapValidation
  const showCarValidation = carValidation?.status && carValidation.status !== 'not_loaded'
  const carStatusLabel =
    carValidation?.status === 'overlap'
      ? 'Gleba dentro do CAR'
      : 'Gleba fora do CAR'

  return `
    <div class="gleba-popup">
      <div class="popup-top">
        <div class="popup-nome">${escapeHtml(properties.nome || 'Gleba')}</div>
      </div>
      <div class="popup-grid">
        <div class="popup-cell">
          <span class="pcell-label">Area</span>
          <span class="pcell-val">${escapeHtml(formatArea(area))}</span>
        </div>
        <div class="popup-cell">
          <span class="pcell-label">Municipio</span>
          <span class="pcell-val">${escapeHtml(properties.municipio || '-')}</span>
        </div>
        <div class="popup-cell popup-cell--full">
          <span class="pcell-label">Localizacao</span>
          <span class="pcell-val pcell-mono">${escapeHtml(properties.municipio || '-')} ${properties.uf ? `/ ${escapeHtml(properties.uf)}` : ''}</span>
        </div>
        ${showCarValidation ? `
          <div class="popup-cell popup-cell--full">
            <span class="pcell-label">Validacao CAR</span>
            <span class="pcell-val">${escapeHtml(carStatusLabel)}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `
}

function carReferencePopupMarkup(feature) {
  const properties = feature.properties || {}
  const carNumber =
    properties.numero_car_recibo ||
    properties.cod_imovel ||
    properties.codigo_imovel ||
    properties.id ||
    '-'
  const municipalityUf = [
    properties.municipio || '-',
    properties.uf || null,
  ].filter(Boolean).join(' / ')
  const geometryArea =
    feature.geometry?.type === 'Polygon'
      ? calculatePolygonAreaHectares(feature.geometry.coordinates?.[0] || [])
      : feature.geometry?.type === 'MultiPolygon'
        ? Number(
            (feature.geometry.coordinates || []).reduce(
              (total, polygon) => total + (calculatePolygonAreaHectares(polygon?.[0] || []) || 0),
              0
            ).toFixed(2)
          )
        : null
  const resolvedArea = normalizeNumericArea(properties.area) ?? geometryArea

  return `
    <div class="gleba-popup">
      <div class="popup-top">
        <div class="popup-nome">Im&oacute;vel do CAR</div>
      </div>
      <div class="popup-grid">
        <div class="popup-cell popup-cell--full">
          <span class="pcell-label">N&ordm; do CAR</span>
          <span class="pcell-val pcell-mono">${escapeHtml(carNumber)}</span>
        </div>
        <div class="popup-cell popup-cell--full">
          <span class="pcell-label">Munic&iacute;pio / UF</span>
          <span class="pcell-val">${escapeHtml(municipalityUf)}</span>
        </div>
        <div class="popup-cell popup-cell--full">
          <span class="pcell-label">&Aacute;rea</span>
          <span class="pcell-val">${escapeHtml(formatArea(resolvedArea))}</span>
        </div>
      </div>
    </div>
  `
}

function featureStyle(feature, selectedId, matchedFeatureIds) {
  const base = STATUS_STYLES[feature.properties.status] || STATUS_STYLES.pendente

  if (matchedFeatureIds.includes(feature.properties.id)) {
    return { ...base, ...MATCHED_OVERRIDES }
  }

  if (feature.properties.id === selectedId) {
    return { ...base, ...SELECTED_OVERRIDES }
  }

  return base
}

function datasetBounds(glebas) {
  if (!glebas?.features?.length) return null

  try {
    return L.geoJSON(glebas).getBounds()
  } catch {
    return null
  }
}

function featureSetBounds(featureIds, featureLayers) {
  if (!featureIds?.length) return null

  const layers = featureIds
    .map((featureId) => featureLayers.get(featureId))
    .filter(Boolean)

  if (!layers.length) return null

  const bounds = L.latLngBounds([])

  layers.forEach((layer) => {
    const layerBounds = layer.getBounds?.()
    if (layerBounds?.isValid()) {
      bounds.extend(layerBounds)
    }
  })

  return bounds.isValid() ? bounds : null
}

function GeoJSONLayer({
  glebas,
  onSelect,
  selectedId,
  matchedFeatureIds,
  visibleFeatureIds,
  viewportRequest,
  suppressFeatureId,
}) {
  const leafMap = useMap()
  const featureGroupRef = useRef(null)
  const featureLayersRef = useRef(new Map())
  const lastDatasetKeyRef = useRef(null)
  const lastViewportRequestRef = useRef(null)
  const selectedIdRef = useRef(selectedId)
  const matchedFeatureIdsRef = useRef(matchedFeatureIds)
  const visibleFeatureIdSetRef = useRef(new Set())

  const visibleFeatureIdSet = useMemo(
    () => new Set(visibleFeatureIds),
    [visibleFeatureIds]
  )

  useEffect(() => {
    selectedIdRef.current = selectedId
    matchedFeatureIdsRef.current = matchedFeatureIds
    visibleFeatureIdSetRef.current = visibleFeatureIdSet
  }, [matchedFeatureIds, selectedId, visibleFeatureIdSet])

  useEffect(() => {
    const featureGroup = L.featureGroup().addTo(leafMap)
    featureGroupRef.current = featureGroup

    return () => {
      featureGroup.remove()
      featureGroupRef.current = null
      featureLayersRef.current.clear()
    }
  }, [leafMap])

  useEffect(() => {
    if (!featureGroupRef.current) return

    const datasetKey = JSON.stringify(
      glebas?.features?.map((feature) => ({
        id: feature.properties.id,
        area: feature.properties.area,
        carOverlapStatus: feature.properties.carOverlapValidation?.status || null,
        carOverlapCount: feature.properties.carOverlapValidation?.overlapCount || 0,
        coordinates: feature.geometry?.coordinates?.[0] || [],
      })) || []
    )

    if (lastDatasetKeyRef.current === datasetKey) {
      return
    }

    lastDatasetKeyRef.current = datasetKey
    featureGroupRef.current.clearLayers()
    featureLayersRef.current.clear()

    if (!glebas?.features?.length) return

    L.geoJSON(glebas, {
      pane: 'gleba-layer',
      onEachFeature: (feature, leafletLayer) => {
        const featureId = feature.properties.id

        leafletLayer.bindPopup(popupMarkup(feature), PERSISTENT_POPUP_OPTIONS)

        leafletLayer.on({
          mouseover(event) {
            if (!visibleFeatureIdSetRef.current.has(featureId)) return

            event.target.setStyle({
              ...featureStyle(feature, selectedIdRef.current, matchedFeatureIdsRef.current),
              fillOpacity: matchedFeatureIdsRef.current.includes(featureId) ? 0.46 : featureId === selectedIdRef.current ? 0.65 : 0.5,
              weight: matchedFeatureIdsRef.current.includes(featureId) ? 5 : featureId === selectedIdRef.current ? 4 : 3,
            })
            event.target.bringToFront()
          },
          mouseout(event) {
            if (!visibleFeatureIdSetRef.current.has(featureId)) return
            event.target.setStyle(featureStyle(feature, selectedIdRef.current, matchedFeatureIdsRef.current))
          },
          click() {
            if (!visibleFeatureIdSetRef.current.has(featureId)) return

            onSelect(feature)
            leafletLayer.openPopup()
          },
        })

        featureGroupRef.current?.addLayer(leafletLayer)
        featureLayersRef.current.set(featureId, leafletLayer)
      },
    })
  }, [glebas, leafMap, onSelect])

  useEffect(() => {
    if (!featureGroupRef.current) return

    featureLayersRef.current.forEach((layer, featureId) => {
      const isVisible = visibleFeatureIdSet.has(featureId)
      const hideForVertexEdit = suppressFeatureId && featureId === suppressFeatureId

      if (!isVisible || hideForVertexEdit) {
        layer.setStyle(HIDDEN_STYLE)
      } else {
        layer.setStyle(
          featureStyle(layer.feature, selectedId, matchedFeatureIds)
        )
      }
    })
  }, [matchedFeatureIds, selectedId, suppressFeatureId, visibleFeatureIdSet])

  useEffect(() => {
    if (!viewportRequest || lastViewportRequestRef.current === viewportRequest.requestKey || lastViewportRequestRef.current === viewportRequest.datasetKey) {
      return
    }

    if (viewportRequest.type === 'dataset') {
      const bounds = datasetBounds(glebas)
      if (bounds?.isValid()) {
        animateToBounds(leafMap, bounds, { maxZoom: 14 })
      }
      lastViewportRequestRef.current = viewportRequest.datasetKey
      return
    }

    if (viewportRequest.type === 'home') {
      leafMap.flyTo(BRAZIL_CENTER, BRAZIL_ZOOM, DEFAULT_FLY_OPTIONS)
      lastViewportRequestRef.current = viewportRequest.requestKey
      return
    }

    if (viewportRequest.type === 'feature-set') {
      const bounds = featureSetBounds(
        viewportRequest.featureIds,
        featureLayersRef.current
      )

      if (bounds?.isValid()) {
        animateToBounds(leafMap, bounds, FLY_FEATURE_BOUNDS_OPTIONS)
      } else if (viewportRequest.point) {
        animateToPoint(leafMap, viewportRequest.point, Math.max(leafMap.getZoom(), 15), { duration: 1.3 })
      }

      lastViewportRequestRef.current = viewportRequest.requestKey
      return
    }

    if (viewportRequest.type === 'feature' && viewportRequest.featureId) {
      const layer = featureLayersRef.current.get(viewportRequest.featureId)
      if (layer) {
        animateToBounds(leafMap, layer.getBounds(), FLY_FEATURE_BOUNDS_OPTIONS)
      } else if (viewportRequest.point) {
        animateToPoint(leafMap, viewportRequest.point, Math.max(leafMap.getZoom(), 16), { duration: 1.3 })
      }
      lastViewportRequestRef.current = viewportRequest.requestKey
      return
    }

    if (viewportRequest.type === 'point' && viewportRequest.point) {
      animateToPoint(leafMap, viewportRequest.point, Math.max(leafMap.getZoom(), 16), { duration: 1.25 })
      lastViewportRequestRef.current = viewportRequest.requestKey
    }
  }, [glebas, leafMap, viewportRequest])

  return null
}

function CarReferenceLayer({
  carGeojson,
  selectedOverlapIds = [],
  viewportRequest,
}) {
  const leafMap = useMap()
  const featureGroupRef = useRef(null)
  const lastDatasetKeyRef = useRef(null)
  const lastViewportRequestRef = useRef(null)
  const overlapIdSet = useMemo(() => new Set(selectedOverlapIds), [selectedOverlapIds])

  useEffect(() => {
    const featureGroup = L.featureGroup().addTo(leafMap)
    featureGroupRef.current = featureGroup

    return () => {
      featureGroup.remove()
      featureGroupRef.current = null
    }
  }, [leafMap])

  useEffect(() => {
    if (!featureGroupRef.current) return

    const datasetKey = JSON.stringify(
      carGeojson?.features?.map((feature) => ({
        id: feature.properties?.id,
        coordinates: feature.geometry,
      })) || []
    )

    if (lastDatasetKeyRef.current === datasetKey) {
      return
    }

    lastDatasetKeyRef.current = datasetKey
    featureGroupRef.current.clearLayers()

    if (!carGeojson?.features?.length) return

    L.geoJSON(carGeojson, {
      pane: 'car-reference',
      style: (feature) => (
        overlapIdSet.has(feature?.properties?.id)
          ? CAR_REFERENCE_MATCHED_STYLE
          : CAR_REFERENCE_STYLE
      ),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(carReferencePopupMarkup(feature), PERSISTENT_POPUP_OPTIONS)

        layer.on({
          mouseover(event) {
            event.target.setStyle(
              overlapIdSet.has(feature.properties?.id)
                ? {
                    ...CAR_REFERENCE_MATCHED_STYLE,
                    fillOpacity: 0.28,
                    weight: 3.5,
                  }
                : {
                    ...CAR_REFERENCE_STYLE,
                    fillOpacity: 0.14,
                    weight: 2.8,
                  }
            )
            event.target.bringToFront()
          },
          mouseout(event) {
            event.target.setStyle(
              overlapIdSet.has(feature.properties?.id)
                ? CAR_REFERENCE_MATCHED_STYLE
                : CAR_REFERENCE_STYLE
            )
          },
        })

        featureGroupRef.current?.addLayer(layer)
      },
    })
  }, [carGeojson, overlapIdSet])

  useEffect(() => {
    if (!featureGroupRef.current) return

    featureGroupRef.current.eachLayer((layer) => {
      const featureId = layer.feature?.properties?.id
      if (!featureId || typeof layer.setStyle !== 'function') return

      layer.setStyle(
        overlapIdSet.has(featureId)
          ? CAR_REFERENCE_MATCHED_STYLE
          : CAR_REFERENCE_STYLE
      )
    })
  }, [overlapIdSet])

  useEffect(() => {
    if (!viewportRequest || viewportRequest.type !== 'car-reference' || lastViewportRequestRef.current === viewportRequest.datasetKey) {
      return
    }

    const bounds = datasetBounds(carGeojson)
    if (bounds?.isValid()) {
      animateToBounds(leafMap, bounds, { maxZoom: 16, duration: 1.9 })
    }

    lastViewportRequestRef.current = viewportRequest.datasetKey
  }, [carGeojson, leafMap, viewportRequest])

  return null
}

function PointPopupContent({ feature, coordinate }) {
  return (
    <div className="validation-popup">
      <strong>{feature?.properties?.nome || 'Gleba'}</strong>
      <span>Ponto {coordinate?.index || '-'}</span>
      <span>Lat {Number.isFinite(coordinate?.lat) ? coordinate.lat.toFixed(11) : '-'}</span>
      <span>Lon {Number.isFinite(coordinate?.lon) ? coordinate.lon.toFixed(11) : '-'}</span>
      <span>{coordinate?.isValid ? 'Coordenada correta' : 'Coordenada com erro'}</span>
    </div>
  )
}

function GlebaPointMarkersLayer({
  glebas,
  selectedId = null,
  visibleFeatureIds = [],
  pointDisplayMode = 'marked',
  onPointSelect,
  onActiveVertexChange,
  onDragStateChange,
  updateFeatureCoordinates,
  suppressFeatureId = null,
}) {
  const leafMap = useMap()
  const visibleFeatureIdSet = useMemo(() => new Set(visibleFeatureIds), [visibleFeatureIds])
  const dragSessionRef = useRef(null)
  const dragFrameRef = useRef(null)
  const pendingDragLatLngRef = useRef(null)

  const clearDragSession = useCallback(() => {
    if (dragFrameRef.current != null) {
      cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }

    pendingDragLatLngRef.current = null

    const currentSession = dragSessionRef.current
    if (currentSession?.preview) {
      currentSession.preview.group.remove()
    }

    leafMap.off('mousemove', handleMapMouseMove)
    leafMap.off('mouseup', handleMapMouseUp)
    window.removeEventListener('mouseup', handleWindowMouseUp)
    leafMap.dragging.enable()
    dragSessionRef.current = null
  }, [leafMap])

  const handleMapMouseMove = useCallback((event) => {
    const currentSession = dragSessionRef.current
    if (!currentSession) return

    if (!currentSession.didMove) {
      const startPoint = leafMap.latLngToContainerPoint(currentSession.startLatLng)
      const currentPoint = leafMap.latLngToContainerPoint(event.latlng)

      if (startPoint.distanceTo(currentPoint) < DRAG_START_THRESHOLD_PX) {
        return
      }

      currentSession.didMove = true
      currentSession.preview = createVertexDragPreviewLayers(
        leafMap,
        currentSession.feature,
        currentSession.ring,
        currentSession.vertexIndex
      )
      onDragStateChange?.({
        active: true,
        featureId: currentSession.feature.properties.id,
      })
    }

    pendingDragLatLngRef.current = event.latlng
    if (dragFrameRef.current != null) return

    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null

      const session = dragSessionRef.current
      const nextLatLng = pendingDragLatLngRef.current

      if (!session?.didMove || !session.preview || !nextLatLng) return

      session.ring[session.vertexIndex] = [nextLatLng.lng, nextLatLng.lat]
      updateVertexDragPreviewLayers(
        session.preview,
        session.feature,
        session.vertexIndex,
        session.ring
      )
    })
  }, [leafMap, onDragStateChange])

  const finishDragSession = useCallback(async () => {
    const currentSession = dragSessionRef.current
    const finalRing = currentSession?.didMove
      ? currentSession.ring.map((coordinate) => [...coordinate])
      : null

    clearDragSession()
    onDragStateChange?.({
      active: false,
      featureId: currentSession?.feature?.properties?.id || null,
    })

    if (!currentSession?.feature?.properties?.id || !finalRing) {
      return
    }

    await updateFeatureCoordinates?.(currentSession.feature.properties.id, finalRing, { select: true })
  }, [clearDragSession, onDragStateChange, updateFeatureCoordinates])

  const handleMapMouseUp = useCallback(() => {
    finishDragSession()
  }, [finishDragSession])

  const handleWindowMouseUp = useCallback(() => {
    finishDragSession()
  }, [finishDragSession])

  useEffect(() => () => {
    clearDragSession()
    onDragStateChange?.({
      active: false,
      featureId: null,
    })
  }, [clearDragSession, onDragStateChange])

  const featuresToRender = (glebas?.features || []).filter((feature) => {
    const featureId = feature.properties?.id
    if (!featureId) return false
    if (selectedId && featureId === selectedId) return false
    if (suppressFeatureId && featureId === suppressFeatureId) return false
    return visibleFeatureIdSet.has(featureId)
  })

  return (
    <>
      {featuresToRender.flatMap((feature) => {
        const coordinateStatuses = feature.properties?.coordinateStatuses || []
        const visibleIndexes = new Set(
          getVisibleCoordinateIndexes({
            coordinates: coordinateStatuses,
            coordinateStatuses,
            pointDisplayMode,
          })
        )

        return coordinateStatuses
          .map((coordinate, index) => ({
            coordinate,
            index,
            editableVertexIndex: resolveEditableVertexIndex(feature, index),
          }))
          .filter(({ index }) => visibleIndexes.has(index))
          .map(({ coordinate, index, editableVertexIndex }) => {
            const hasOverlap = coordinateHasOverlapIssue(coordinate)

            return (
              <CircleMarker
                key={`${feature.properties.id}-global-${coordinate.index}`}
                center={[coordinate.lat, coordinate.lon]}
                pane="gleba-points"
                radius={hasOverlap ? 8 : 5}
                bubblingMouseEvents={false}
                pathOptions={{
                  className: 'gleba-point-handle',
                  color: hasOverlap ? '#fdba74' : coordinate.isValid ? '#bbf7d0' : '#fecaca',
                  weight: hasOverlap ? 3 : 2,
                  fillColor: hasOverlap ? '#f97316' : coordinate.isValid ? '#22c55e' : '#ef4444',
                  fillOpacity: 0.95,
                }}
                eventHandlers={{
                  mousedown(event) {
                    clearDragSession()
                    L.DomEvent.stop(event.originalEvent)
                    if (!Number.isInteger(editableVertexIndex)) return
                    onActiveVertexChange?.({
                      featureId: feature.properties.id,
                      vertexIndex: editableVertexIndex,
                    })

                    dragSessionRef.current = {
                      didMove: false,
                      feature,
                      ring: getEditableCoordinates(feature).map((currentCoordinate) => [...currentCoordinate]),
                      startLatLng: event.latlng,
                      vertexIndex: editableVertexIndex,
                      preview: null,
                    }

                    leafMap.dragging.disable()
                    leafMap.on('mousemove', handleMapMouseMove)
                    leafMap.on('mouseup', handleMapMouseUp)
                    window.addEventListener('mouseup', handleWindowMouseUp)
                  },
                  click() {
                    onPointSelect?.(feature, editableVertexIndex)
                  },
                }}
              >
                <Popup {...PERSISTENT_POPUP_OPTIONS}>
                  <PointPopupContent feature={feature} coordinate={coordinate} />
                </Popup>
              </CircleMarker>
            )
          })
      })}
    </>
  )
}

function SelectedGlebaVerticesPreview({
  selectedGleba,
  previewCoordinates = null,
  activeVertexIndex = null,
  pointDisplayMode = 'marked',
  showPointMarkers = true,
}) {
  if (!selectedGleba?.properties?.coordinateStatuses?.length) return null

  const displayCoordinates =
    previewCoordinates
      ? [...previewCoordinates, previewCoordinates[0]]
      : selectedGleba.properties.displayCoordinates ||
    selectedGleba.geometry?.coordinates?.[0] ||
    []
  const coordinateStatuses = previewCoordinates
    ? selectedGleba.properties.coordinateStatuses.map((coordinate, index) => ({
        ...coordinate,
        lat: previewCoordinates[index]?.[1] ?? coordinate.lat,
        lon: previewCoordinates[index]?.[0] ?? coordinate.lon,
      }))
    : selectedGleba.properties.coordinateStatuses
  const selfOverlapSegments = selectedGleba.properties.validationMetrics?.selfOverlapSegments || []
  const visibleIndexes = new Set(
    getVisibleCoordinateIndexes({
      coordinates: coordinateStatuses,
      coordinateStatuses,
      pointDisplayMode,
    })
  )

  return (
    <>
      {selectedGleba.properties.status === 'invalida' && selectedGleba.properties.originalCoordinates?.length > 1 && (
        <Polyline
          positions={selectedGleba.properties.originalCoordinates.map(([lon, lat]) => [lat, lon])}
          pathOptions={{
            color: '#fca5a5',
            weight: 2,
            dashArray: '8 6',
            opacity: 0.95,
          }}
        />
      )}

      <Polyline
        positions={displayCoordinates.map(([lon, lat]) => [lat, lon])}
        pathOptions={{
          color: '#f8fafc',
          weight: 1.5,
          dashArray: '3 6',
          opacity: 0.65,
        }}
      />

      {selfOverlapSegments.map((segment, index) => (
        <Polyline
          key={`${selectedGleba.properties.id}-overlap-${index}`}
          positions={segment.map(([lon, lat]) => [lat, lon])}
          pathOptions={{
            color: '#f97316',
            weight: 7,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      ))}

      {showPointMarkers && coordinateStatuses
        .map((coordinate, index) => ({ coordinate, index }))
        .filter(({ index }) => visibleIndexes.has(index))
        .map(({ coordinate, index }) => {
          const markerStyle = getVertexMarkerStyle(
            coordinate,
            activeVertexIndex === index
          )

          return (
        <CircleMarker
          key={`${selectedGleba.properties.id}-${coordinate.index}`}
          center={[coordinate.lat, coordinate.lon]}
          pane="selected-vertices"
          bubblingMouseEvents={false}
          radius={markerStyle.radius}
          pathOptions={markerStyle.pathOptions}
      >
          <Popup {...PERSISTENT_POPUP_OPTIONS}>
            <div className="validation-popup">
              <strong>Ponto {coordinate.index}</strong>
              <span>Lat {coordinate.lat.toFixed(11)}</span>
              <span>Lon {coordinate.lon.toFixed(11)}</span>
              <span>{coordinate.isValid ? 'Coordenada correta' : 'Coordenada com erro'}</span>
              {coordinate.issues?.map((issue, index) => (
                <span key={index}>{issue.message}</span>
              ))}
            </div>
          </Popup>
        </CircleMarker>
          )
        })}
    </>
  )
}

function EditableSelectedGleba({
  selectedGleba,
  updateSelectedGlebaCoordinates,
  pointDisplayMode = 'marked',
  requestedVertexActivation = null,
  onRequestedVertexActivationApplied,
  draggingFeatureId = null,
  onActiveVertexChange,
  onDragStateChange,
}) {
  const leafMap = useMap()
  const [activeVertexIndex, setActiveVertexIndex] = useState(null)
  const selectedGlebaRef = useRef(selectedGleba)
  const dragRingRef = useRef(null)
  const dragVertexIndexRef = useRef(null)
  const imperativePreviewRef = useRef(null)
  const dragFrameRef = useRef(null)
  const pendingDragLatLngRef = useRef(null)

  useEffect(() => {
    selectedGlebaRef.current = selectedGleba
  }, [selectedGleba])

  useEffect(() => {
    setActiveVertexIndex(null)
  }, [selectedGleba?.properties?.id])

  useEffect(() => {
    if (!requestedVertexActivation || !selectedGleba?.properties?.id) return
    if (requestedVertexActivation.featureId !== selectedGleba.properties.id) return

    const editableCoordinates = getEditableCoordinates(selectedGleba)
    const nextVertexIndex = requestedVertexActivation.vertexIndex

    if (
      Number.isInteger(nextVertexIndex) &&
      nextVertexIndex >= 0 &&
      nextVertexIndex < editableCoordinates.length
    ) {
      setActiveVertexIndex(nextVertexIndex)
    }

    onRequestedVertexActivationApplied?.(requestedVertexActivation.requestKey)
  }, [
    onRequestedVertexActivationApplied,
    requestedVertexActivation,
    selectedGleba,
  ])

  const removeImperativePreview = () => {
    if (dragFrameRef.current != null) {
      cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }
    pendingDragLatLngRef.current = null
    if (imperativePreviewRef.current) {
      imperativePreviewRef.current.group.remove()
      imperativePreviewRef.current = null
    }
    dragRingRef.current = null
    dragVertexIndexRef.current = null
  }

  useEffect(() => {
    if (!selectedGleba) {
      removeImperativePreview()
      leafMap.dragging.enable()
      setActiveVertexIndex(null)
      onDragStateChange?.({
        active: false,
        featureId: null,
      })
    }

    return () => {
      if (dragFrameRef.current != null) {
        cancelAnimationFrame(dragFrameRef.current)
        dragFrameRef.current = null
      }
      pendingDragLatLngRef.current = null
      if (imperativePreviewRef.current) {
        imperativePreviewRef.current.group.remove()
        imperativePreviewRef.current = null
      }
      dragRingRef.current = null
      dragVertexIndexRef.current = null
      leafMap.dragging.enable()
      onDragStateChange?.({
        active: false,
        featureId: null,
      })
    }
  }, [leafMap, onDragStateChange, selectedGleba])

  if (!selectedGleba) return null

  const editableCoordinates = getEditableCoordinates(selectedGleba)
  const coordinateStatuses = selectedGleba.properties.coordinateStatuses || []
  const visibleIndexes = new Set(
    getVisibleCoordinateIndexes({
      coordinates: pointDisplayMode === 'validated' ? coordinateStatuses : editableCoordinates,
      coordinateStatuses,
      pointDisplayMode,
    })
  )

  if (!editableCoordinates.length) return null

  const isDraggingSelectedFeature = draggingFeatureId === selectedGleba.properties.id
  const showEditableMarkers = !isDraggingSelectedFeature
  const markerDescriptors = pointDisplayMode === 'validated'
    ? coordinateStatuses
      .map((coordinate, index) => ({
        coordinate,
        displayIndex: index,
        editableVertexIndex: resolveEditableVertexIndex(selectedGleba, index),
        lat: coordinate.lat,
        lon: coordinate.lon,
      }))
      .filter(({ editableVertexIndex }) => Number.isInteger(editableVertexIndex))
    : editableCoordinates.map((coordinate, index) => ({
      coordinate: coordinateStatuses[index] || {
        index: index + 1,
        isValid: true,
        lat: coordinate[1],
        lon: coordinate[0],
      },
      displayIndex: index,
      editableVertexIndex: index,
      lat: coordinate[1],
      lon: coordinate[0],
    }))

  // The selected gleba uses the same lightweight manual drag flow as the global points.
  const handleMapMouseMove = (event) => {
    const ring = dragRingRef.current
    const vertexIndex = dragVertexIndexRef.current

    if (!ring || vertexIndex === null) return

    if (!imperativePreviewRef.current) {
      const startPoint = leafMap.latLngToContainerPoint([
        ring[vertexIndex][1],
        ring[vertexIndex][0],
      ])
      const currentPoint = leafMap.latLngToContainerPoint(event.latlng)

      if (startPoint.distanceTo(currentPoint) < DRAG_START_THRESHOLD_PX) {
        return
      }

      imperativePreviewRef.current = createVertexDragPreviewLayers(
        leafMap,
        selectedGlebaRef.current,
        ring,
        vertexIndex
      )
      setActiveVertexIndex(vertexIndex)
      onActiveVertexChange?.({
        featureId: selectedGlebaRef.current?.properties?.id || null,
        vertexIndex,
      })
      onDragStateChange?.({
        active: true,
        featureId: selectedGlebaRef.current?.properties?.id || null,
      })
    }

    pendingDragLatLngRef.current = event.latlng
    if (dragFrameRef.current != null) return

    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null

      const nextLatLng = pendingDragLatLngRef.current
      const nextRing = dragRingRef.current
      const nextVertexIndex = dragVertexIndexRef.current
      const preview = imperativePreviewRef.current

      if (!nextLatLng || !nextRing || nextVertexIndex === null || !preview) return

      nextRing[nextVertexIndex] = [nextLatLng.lng, nextLatLng.lat]
      updateVertexDragPreviewLayers(
        preview,
        selectedGlebaRef.current,
        nextVertexIndex,
        nextRing
      )
    })
  }

  const finishDragSession = async () => {
    const ring = dragRingRef.current
    const vertexIndex = dragVertexIndexRef.current
    const finalRing = imperativePreviewRef.current && ring && vertexIndex !== null
      ? ring.map((coordinate) => [...coordinate])
      : null

    removeImperativePreview()
    setActiveVertexIndex(null)
    onDragStateChange?.({
      active: false,
      featureId: selectedGlebaRef.current?.properties?.id || null,
    })
    leafMap.dragging.enable()
    leafMap.off('mousemove', handleMapMouseMove)
    leafMap.off('mouseup', finishDragSession)
    window.removeEventListener('mouseup', finishDragSession)

    if (finalRing) {
      await updateSelectedGlebaCoordinates(finalRing)
    }
  }

  return (
    <>
      {!isDraggingSelectedFeature && activeVertexIndex === null && (
        <SelectedGlebaVerticesPreview
          selectedGleba={selectedGleba}
          pointDisplayMode={pointDisplayMode}
          showPointMarkers={!showEditableMarkers}
        />
      )}

      {showEditableMarkers && markerDescriptors
        .filter(({ displayIndex }) => visibleIndexes.has(displayIndex))
        .map(({ coordinate, displayIndex, editableVertexIndex, lat, lon }) => {
          const markerStyle = getEditableVertexPathOptions(
            coordinate,
            activeVertexIndex === editableVertexIndex
          )

          return (
        <CircleMarker
          key={`${selectedGleba.properties.id}-edit-${displayIndex}`}
          center={[lat, lon]}
          pane="selected-vertices"
          bubblingMouseEvents={false}
          radius={markerStyle.radius}
          pathOptions={markerStyle.pathOptions}
          eventHandlers={{
            click() {
              onActiveVertexChange?.({
                featureId: selectedGleba.properties.id,
                vertexIndex: editableVertexIndex,
              })
              setActiveVertexIndex((currentActiveVertexIndex) => (
                currentActiveVertexIndex === editableVertexIndex ? null : editableVertexIndex
              ))
            },
            mousedown(event) {
              removeImperativePreview()
              const ring = getEditableCoordinates(selectedGlebaRef.current).map((c) => [...c])
              dragRingRef.current = ring
              dragVertexIndexRef.current = editableVertexIndex
              pendingDragLatLngRef.current = null
              L.DomEvent.stop(event.originalEvent)
              onActiveVertexChange?.({
                featureId: selectedGleba.properties.id,
                vertexIndex: editableVertexIndex,
              })
              leafMap.dragging.disable()
              leafMap.on('mousemove', handleMapMouseMove)
              leafMap.on('mouseup', finishDragSession)
              window.addEventListener('mouseup', finishDragSession)
            },
          }}
        >
          <Popup {...PERSISTENT_POPUP_OPTIONS}>
            <div className="validation-popup">
              <strong>Ponto {coordinate.index ?? displayIndex + 1}</strong>
              <span>Lat {lat.toFixed(11)}</span>
              <span>Lon {lon.toFixed(11)}</span>
              <span>{coordinate.isValid === false ? 'Coordenada com erro' : 'Coordenada correta'}</span>
            </div>
          </Popup>
        </CircleMarker>
          )
        })}
    </>
  )
}

function ValidationPointMarker({ queryPoint }) {
  if (!queryPoint) return null

  return (
    <CircleMarker
      center={[queryPoint.lat, queryPoint.lon]}
      radius={9}
      pathOptions={{
        color: '#f8fafc',
        weight: 2,
        fillColor: '#38bdf8',
        fillOpacity: 0.95,
      }}
    >
      <Popup {...PERSISTENT_POPUP_OPTIONS}>
        <div className="validation-popup">
          <strong>Coordenada consultada</strong>
          <span>Lat {queryPoint.lat.toFixed(6)}</span>
          <span>Lon {queryPoint.lon.toFixed(6)}</span>
        </div>
      </Popup>
    </CircleMarker>
  )
}

function BasemapControl({ activeBasemap, onChange }) {
  return (
    <div className="basemap-control" role="group" aria-label="Base do mapa">
      {Object.values(BASEMAPS).map((basemap) => (
        <button
          key={basemap.key}
          type="button"
          className={`basemap-control__button ${activeBasemap === basemap.key ? 'is-active' : ''}`}
          onClick={() => onChange(basemap.key)}
        >
          <span className={`basemap-control__thumb basemap-control__thumb--${basemap.key}`} aria-hidden="true" />
          <span className="basemap-control__label">{basemap.label}</span>
        </button>
      ))}
    </div>
  )
}

export default function MapView({
  glebas,
  carReferenceDataset,
  selectedGleba,
  setSelectedGleba,
  onActiveVertexChange,
  queryPoint,
  matchedFeatureIds = [],
  visibleFeatureIds = [],
  viewportRequest,
  updateFeatureCoordinates,
  updateSelectedGlebaCoordinates,
  layoutRevision = 0,
  pointDisplayMode = 'marked',
}) {
  const selectedId = selectedGleba?.properties?.id
  const [draggingFeatureId, setDraggingFeatureId] = useState(null)
  const [activeBasemap, setActiveBasemap] = useState('dark')
  const [satelliteSourceIndex, setSatelliteSourceIndex] = useState(0)
  const [requestedVertexActivation, setRequestedVertexActivation] = useState(null)
  const selectedCarOverlapIds = useMemo(
    () => selectedGleba?.properties?.carOverlapValidation?.overlaps?.map((overlap) => overlap.id).filter(Boolean) || [],
    [selectedGleba]
  )

  const handlePointMarkerSelect = useCallback((feature, vertexIndex) => {
    setSelectedGleba(feature)
    onActiveVertexChange?.({
      featureId: feature?.properties?.id || null,
      vertexIndex: Number.isInteger(vertexIndex) ? vertexIndex : null,
    })

    if (!feature?.properties?.id || !Number.isInteger(vertexIndex)) {
      setRequestedVertexActivation(null)
      return
    }

    setRequestedVertexActivation({
      featureId: feature.properties.id,
      vertexIndex,
      requestKey: `${feature.properties.id}-${vertexIndex}-${Date.now()}`,
    })
  }, [onActiveVertexChange, setSelectedGleba])

  const handleRequestedVertexActivationApplied = useCallback((requestKey) => {
    setRequestedVertexActivation((currentRequest) => (
      currentRequest?.requestKey === requestKey ? null : currentRequest
    ))
  }, [])

  const handleDragStateChange = useCallback((nextState) => {
    setDraggingFeatureId(nextState?.active ? nextState.featureId || null : null)
  }, [])

  useEffect(() => {
    if (selectedGleba?.properties?.id) {
      return
    }

    onActiveVertexChange?.(null)
  }, [onActiveVertexChange, selectedGleba])

  useEffect(() => {
    if (activeBasemap !== 'satellite') return
    setSatelliteSourceIndex(0)
  }, [activeBasemap])

  const currentBasemap = useMemo(() => {
    if (activeBasemap !== 'satellite') {
      return BASEMAPS.dark
    }

    const satelliteSources = BASEMAPS.satellite.sources || []
    return satelliteSources[satelliteSourceIndex] || satelliteSources[0]
  }, [activeBasemap, satelliteSourceIndex])

  const handleTileError = () => {
    if (activeBasemap !== 'satellite') return

    const satelliteSources = BASEMAPS.satellite.sources || []
    setSatelliteSourceIndex((current) => (
      current < satelliteSources.length - 1 ? current + 1 : current
    ))
  }

  return (
    <div className="map-wrapper">
      <MapContainer
        center={BRAZIL_CENTER}
        zoom={BRAZIL_ZOOM}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        doubleClickZoom={false}
        closePopupOnClick={false}
      >
        <MapInvalidateOnLayout revision={layoutRevision} />
        <Pane name="car-reference" style={{ zIndex: 360 }} />
        <Pane name="gleba-layer" style={{ zIndex: 460 }} />
        <Pane name="gleba-points" style={{ zIndex: 620 }} />
        <Pane name="selected-vertices" style={{ zIndex: 650 }} />

        <BasemapControl
          activeBasemap={activeBasemap}
          onChange={setActiveBasemap}
        />

        <TileLayer
          key={`${activeBasemap}-${currentBasemap.key}`}
          attribution={currentBasemap.attribution}
          url={currentBasemap.url}
          subdomains={currentBasemap.subdomains}
          maxZoom={currentBasemap.maxZoom}
          eventHandlers={{
            tileerror: handleTileError,
          }}
        />

        {activeBasemap === 'satellite' && BASEMAPS.satellite.labels && (
          <TileLayer
            key={BASEMAPS.satellite.labels.key}
            attribution={BASEMAPS.satellite.labels.attribution}
            url={BASEMAPS.satellite.labels.url}
            maxZoom={BASEMAPS.satellite.labels.maxZoom}
            pane="overlayPane"
            opacity={0.95}
          />
        )}

        <CarReferenceLayer
          carGeojson={carReferenceDataset?.geojson || null}
          selectedOverlapIds={selectedCarOverlapIds}
          viewportRequest={viewportRequest}
        />

        <GeoJSONLayer
          glebas={glebas}
          onSelect={setSelectedGleba}
          selectedId={selectedId}
          matchedFeatureIds={matchedFeatureIds}
          visibleFeatureIds={visibleFeatureIds}
          viewportRequest={viewportRequest}
          suppressFeatureId={draggingFeatureId}
        />

        <GlebaPointMarkersLayer
          glebas={glebas}
          selectedId={selectedId}
          visibleFeatureIds={visibleFeatureIds}
          pointDisplayMode={pointDisplayMode}
          onPointSelect={handlePointMarkerSelect}
          onActiveVertexChange={onActiveVertexChange}
          onDragStateChange={handleDragStateChange}
          updateFeatureCoordinates={updateFeatureCoordinates}
          suppressFeatureId={draggingFeatureId}
        />

        <EditableSelectedGleba
          selectedGleba={selectedGleba}
          updateSelectedGlebaCoordinates={updateSelectedGlebaCoordinates}
          pointDisplayMode={pointDisplayMode}
          requestedVertexActivation={requestedVertexActivation}
          onRequestedVertexActivationApplied={handleRequestedVertexActivationApplied}
          draggingFeatureId={draggingFeatureId}
          onActiveVertexChange={onActiveVertexChange}
          onDragStateChange={handleDragStateChange}
        />
        <ValidationPointMarker queryPoint={queryPoint} />
        <Legend />
      </MapContainer>
    </div>
  )
}

