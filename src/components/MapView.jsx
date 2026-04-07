/**
 * MapView.jsx
 * Mapa interativo com poligonos, vertices e destaque das criticas SICOR.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Marker, Pane, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
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

const HIDDEN_STYLE = {
  color: 'transparent',
  fillColor: 'transparent',
  opacity: 0,
  fillOpacity: 0,
  weight: 0.1,
}

function buildEditVertexIcon(isValid) {
  return L.divIcon({
    className: `edit-vertex-icon ${isValid ? 'is-valid' : 'is-invalid'}`,
    html: '<span class="edit-vertex-pin"></span>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function buildActiveEditVertexIcon(isValid) {
  return L.divIcon({
    className: `edit-vertex-icon is-active ${isValid ? 'is-valid' : 'is-invalid'}`,
    html: '<span class="edit-vertex-pin"></span>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

function buildAreaPreviewIcon(area) {
  return L.divIcon({
    className: 'edit-area-preview-icon',
    html: `
      <div class="edit-area-preview">
        <span class="edit-area-preview-label">Area atual</span>
        <strong class="edit-area-preview-value">${formatArea(area)}</strong>
      </div>
    `,
    iconSize: [110, 54],
    iconAnchor: [55, 66],
  })
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

function updateAreaPreviewMarkerText(marker, area) {
  const root = marker.getElement?.()
  const val = root?.querySelector?.('.edit-area-preview-value')
  if (val) val.textContent = formatArea(area)
}

function createVertexDragPreviewLayers(leafMap, selectedGleba, ringLonLat, vertexIndex) {
  const group = L.layerGroup().addTo(leafMap)
  const style = STATUS_STYLES[selectedGleba.properties.status] || STATUS_STYLES.pendente
  const ll = ringLonLat.map(([lon, lat]) => [lat, lon])

  if (selectedGleba.properties.status === 'invalida' && selectedGleba.properties.originalCoordinates?.length > 1) {
    L.polyline(
      selectedGleba.properties.originalCoordinates.map(([lon, lat]) => [lat, lon]),
      { color: '#fca5a5', weight: 2, dashArray: '8 6', opacity: 0.95, interactive: false }
    ).addTo(group)
  }

  const poly = L.polygon(ll, {
    color: style.color,
    fillColor: style.fillColor,
    weight: 2.5,
    opacity: 0.92,
    fillOpacity: 0.4,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  })
  poly.addTo(group)

  const outline = L.polyline([...ll, ll[0]], {
    color: '#f8fafc',
    weight: 1.5,
    dashArray: '3 6',
    opacity: 0.65,
    interactive: false,
  })
  outline.addTo(group)

  const vertexLL = [ringLonLat[vertexIndex][1], ringLonLat[vertexIndex][0]]
  const areaMarker = L.marker(vertexLL, {
    icon: buildAreaPreviewIcon(calculatePolygonAreaHectares(ringLonLat)),
    interactive: false,
    keyboard: false,
  })
  areaMarker.addTo(group)

  const helperLine = L.polyline([], {
    color: '#f8fafc',
    weight: 3,
    dashArray: '6 6',
    opacity: 0.95,
    interactive: false,
  })
  helperLine.addTo(group)

  return { group, poly, outline, areaMarker, helperLine }
}

function updateVertexDragPreviewLayers(layers, vertexIndex, ringLonLat) {
  if (!layers) return
  const ll = ringLonLat.map(([lon, lat]) => [lat, lon])
  layers.poly.setLatLngs(ll)
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
  layers.areaMarker.setLatLng([ringLonLat[vertexIndex][1], ringLonLat[vertexIndex][0]])
  updateAreaPreviewMarkerText(layers.areaMarker, calculatePolygonAreaHectares(ringLonLat))
}

function popupMarkup(feature) {
  const properties = feature.properties || {}

  return `
    <div class="gleba-popup">
      <div class="popup-top">
        <div class="popup-nome">${escapeHtml(properties.nome || 'Gleba')}</div>
      </div>
      <div class="popup-grid">
        <div class="popup-cell">
          <span class="pcell-label">Area</span>
          <span class="pcell-val">${escapeHtml(formatArea(properties.area))}</span>
        </div>
        <div class="popup-cell">
          <span class="pcell-label">Municipio</span>
          <span class="pcell-val">${escapeHtml(properties.municipio || '-')}</span>
        </div>
        <div class="popup-cell popup-cell--full">
          <span class="pcell-label">Localizacao</span>
          <span class="pcell-val pcell-mono">${escapeHtml(properties.municipio || '-')} ${properties.uf ? `/ ${escapeHtml(properties.uf)}` : ''}</span>
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
      onEachFeature: (feature, leafletLayer) => {
        const featureId = feature.properties.id

        leafletLayer.bindPopup(popupMarkup(feature), {
          className: 'custom-popup',
          maxWidth: 280,
        })

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
        leafMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
      }
      lastViewportRequestRef.current = viewportRequest.datasetKey
      return
    }

    if (viewportRequest.type === 'home') {
      leafMap.setView(BRAZIL_CENTER, BRAZIL_ZOOM, { animate: true })
      lastViewportRequestRef.current = viewportRequest.requestKey
      return
    }

    if (viewportRequest.type === 'feature-set') {
      const bounds = featureSetBounds(
        viewportRequest.featureIds,
        featureLayersRef.current
      )

      if (bounds?.isValid()) {
        leafMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 })
      } else if (viewportRequest.point) {
        leafMap.panTo([viewportRequest.point.lat, viewportRequest.point.lon], { animate: true })
      }

      lastViewportRequestRef.current = viewportRequest.requestKey
      return
    }

    if (viewportRequest.type === 'feature' && viewportRequest.featureId) {
      const layer = featureLayersRef.current.get(viewportRequest.featureId)
      if (layer) {
        leafMap.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 17 })
      } else if (viewportRequest.point) {
        leafMap.panTo([viewportRequest.point.lat, viewportRequest.point.lon], { animate: true })
      }
      lastViewportRequestRef.current = viewportRequest.requestKey
      return
    }

    if (viewportRequest.type === 'point' && viewportRequest.point) {
      leafMap.panTo([viewportRequest.point.lat, viewportRequest.point.lon], { animate: true })
      lastViewportRequestRef.current = viewportRequest.requestKey
    }
  }, [glebas, leafMap, viewportRequest])

  return null
}

function SelectedGlebaVertices({ selectedGleba }) {
  return <SelectedGlebaVerticesPreview selectedGleba={selectedGleba} />
}

function SelectedGlebaVerticesPreview({
  selectedGleba,
  previewCoordinates = null,
  activeVertexIndex = null,
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

      {coordinateStatuses.map((coordinate, index) => (
        <CircleMarker
          key={`${selectedGleba.properties.id}-${coordinate.index}`}
          center={[coordinate.lat, coordinate.lon]}
          radius={activeVertexIndex === index ? 8 : 6}
          pathOptions={{
            color: coordinate.isValid ? '#bbf7d0' : '#fecaca',
            weight: 2,
            fillColor: coordinate.isValid ? '#22c55e' : '#ef4444',
            fillOpacity: 1,
          }}
        >
          <Popup className="custom-popup">
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
      ))}
    </>
  )
}

function EditableSelectedGleba({
  selectedGleba,
  updateSelectedGlebaCoordinates,
  onVertexEditActiveChange,
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
      onVertexEditActiveChange?.(false)
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
      onVertexEditActiveChange?.(false)
    }
  }, [leafMap, selectedGleba, onVertexEditActiveChange])

  if (!selectedGleba) return null

  const editableCoordinates = getEditableCoordinates(selectedGleba)
  const coordinateStatuses = selectedGleba.properties.coordinateStatuses || []

  if (!editableCoordinates.length) return null

  return (
    <>
      {activeVertexIndex === null && (
        <SelectedGlebaVerticesPreview selectedGleba={selectedGleba} />
      )}

      {editableCoordinates.map(([lon, lat], index) => (
        <Marker
          key={`${selectedGleba.properties.id}-edit-${index}`}
          position={[lat, lon]}
          draggable
          icon={
            activeVertexIndex === index
              ? buildActiveEditVertexIcon(coordinateStatuses[index]?.isValid !== false)
              : buildEditVertexIcon(coordinateStatuses[index]?.isValid !== false)
          }
          eventHandlers={{
            drag(event) {
              const ring = dragRingRef.current
              const layers = imperativePreviewRef.current
              const vi = dragVertexIndexRef.current
              if (!ring || !layers || vi === null) return
              pendingDragLatLngRef.current = event.target.getLatLng()
              if (dragFrameRef.current != null) return
              dragFrameRef.current = requestAnimationFrame(() => {
                dragFrameRef.current = null
                const ll = pendingDragLatLngRef.current
                const r = dragRingRef.current
                const lyr = imperativePreviewRef.current
                const v = dragVertexIndexRef.current
                if (!ll || !r || !lyr || v === null) return
                r[v] = [ll.lng, ll.lat]
                updateVertexDragPreviewLayers(lyr, v, r)
              })
            },
            dragstart() {
              removeImperativePreview()
              const ring = getEditableCoordinates(selectedGlebaRef.current).map((c) => [...c])
              dragRingRef.current = ring
              dragVertexIndexRef.current = index
              imperativePreviewRef.current = createVertexDragPreviewLayers(
                leafMap,
                selectedGlebaRef.current,
                ring,
                index
              )
              updateVertexDragPreviewLayers(imperativePreviewRef.current, index, ring)

              leafMap.dragging.disable()
              setActiveVertexIndex(index)
              onVertexEditActiveChange?.(true)
            },
            dragend(event) {
              if (dragFrameRef.current != null) {
                cancelAnimationFrame(dragFrameRef.current)
                dragFrameRef.current = null
              }
              const ll = event.target.getLatLng()
              const ring = dragRingRef.current
              const finalRing = ring ? ring.map((c) => [...c]) : null
              if (finalRing) {
                finalRing[index] = [ll.lng, ll.lat]
              }
              pendingDragLatLngRef.current = null
              removeImperativePreview()
              setActiveVertexIndex(null)
              onVertexEditActiveChange?.(false)
              leafMap.dragging.enable()
              if (finalRing) {
                updateSelectedGlebaCoordinates(finalRing)
              }
            },
          }}
        />
      ))}
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
      <Popup className="custom-popup">
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
  selectedGleba,
  setSelectedGleba,
  queryPoint,
  matchedFeatureIds = [],
  visibleFeatureIds = [],
  viewportRequest,
  updateSelectedGlebaCoordinates,
  layoutRevision = 0,
}) {
  const selectedId = selectedGleba?.properties?.id
  const [isVertexDragging, setIsVertexDragging] = useState(false)
  const [activeBasemap, setActiveBasemap] = useState('dark')
  const [satelliteSourceIndex, setSatelliteSourceIndex] = useState(0)

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
      >
        <MapInvalidateOnLayout revision={layoutRevision} />
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

        <GeoJSONLayer
          glebas={glebas}
          onSelect={setSelectedGleba}
          selectedId={selectedId}
          matchedFeatureIds={matchedFeatureIds}
          visibleFeatureIds={visibleFeatureIds}
          viewportRequest={viewportRequest}
          suppressFeatureId={isVertexDragging ? selectedId : null}
        />

        <EditableSelectedGleba
          selectedGleba={selectedGleba}
          updateSelectedGlebaCoordinates={updateSelectedGlebaCoordinates}
          onVertexEditActiveChange={setIsVertexDragging}
        />
        <ValidationPointMarker queryPoint={queryPoint} />
        <Legend />
      </MapContainer>
    </div>
  )
}
