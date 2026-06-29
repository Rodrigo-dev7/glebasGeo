import { getEditableCoordinates } from './featureGeometryService'

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function slugifyFilePart(value) {
  return String(value || 'gleba')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'gleba'
}

function coordinatesEqual(left, right) {
  if (!left || !right) return false

  return Number(left[0]) === Number(right[0]) && Number(left[1]) === Number(right[1])
}

function ensureClosedRing(coordinates = []) {
  if (coordinates.length < 3) return coordinates

  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]

  return coordinatesEqual(first, last)
    ? coordinates
    : [...coordinates, first]
}

function normalizeEditableCoordinates(feature) {
  return ensureClosedRing(
    getEditableCoordinates(feature)
      .map(([lon, lat]) => [Number(lon), Number(lat)])
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
  )
}

function normalizeRingCoordinates(ring = []) {
  return ensureClosedRing(
    ring
      .map(([lon, lat]) => [Number(lon), Number(lat)])
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
  )
}

function getFeaturePolygonRings(feature, { preferEditableCoordinates = false } = {}) {
  if (preferEditableCoordinates) {
    return [normalizeEditableCoordinates(feature)]
  }

  const geometry = feature?.geometry || {}

  if (geometry.type === 'Polygon') {
    return [normalizeRingCoordinates(geometry.coordinates?.[0] || [])]
  }

  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates || []).map((polygon) => (
      normalizeRingCoordinates(polygon?.[0] || [])
    ))
  }

  return [normalizeEditableCoordinates(feature)]
}

function normalizeFeatureList(input) {
  if (input?.type === 'FeatureCollection') {
    return input.features || []
  }

  return input ? [input] : []
}

function buildExtendedData(properties = {}) {
  const entries = [
    ['id', properties.id],
    ['nome', properties.nome],
    ['car_code', properties.carCode],
    ['status', properties.status],
    ['status_label', properties.statusLabel],
    ['analysis_status', properties.analysisStatus],
    ['area_ha', properties.area],
    ['municipio', properties.municipio],
    ['uf', properties.uf],
    ['tipo_uso', properties.tipo_uso],
    ['tipo', properties.tipo],
    ['origem_arquivo', properties.origem_arquivo],
    ['source_type', properties.sourceType],
    ['geometry_source', properties.geometrySource],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '')

  if (!entries.length) return ''

  return `
      <ExtendedData>
${entries.map(([name, value]) => `        <Data name="${escapeXml(name)}"><value>${escapeXml(value)}</value></Data>`).join('\n')}
      </ExtendedData>`
}

function buildPolygonMarkup(coordinates) {
  const coordinateText = coordinates
    .map(([lon, lat]) => `${lon},${lat},0`)
    .join(' ')

  return `<Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordinateText}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>`
}

function buildGeometryMarkup(rings) {
  const validRings = rings.filter((coordinates) => coordinates.length >= 4)

  if (validRings.length === 1) {
    return buildPolygonMarkup(validRings[0])
  }

  return `<MultiGeometry>
        ${validRings.map((coordinates) => buildPolygonMarkup(coordinates)).join('\n        ')}
      </MultiGeometry>`
}

function buildFeaturePlacemark(feature, index, options = {}) {
  const properties = feature?.properties || {}
  const rings = getFeaturePolygonRings(feature, options)
  const validRings = rings.filter((coordinates) => coordinates.length >= 4)

  if (!validRings.length) {
    return ''
  }

  const name = options.getPlacemarkName?.(feature, index) ||
    properties.nome ||
    properties.carCode ||
    properties.id ||
    `Area ${index + 1}`

  return `    <Placemark>
      <name>${escapeXml(name)}</name>${buildExtendedData(properties)}
      <styleUrl>#${escapeXml(options.styleId || 'gleba-style')}</styleUrl>
      ${buildGeometryMarkup(validRings)}
    </Placemark>`
}

export function buildGeojsonKml(input, options = {}) {
  const features = normalizeFeatureList(input)
  const placemarks = features
    .map((feature, index) => buildFeaturePlacemark(feature, index, options))
    .filter(Boolean)

  if (!placemarks.length) {
    throw new Error(options.emptyGeometryMessage || 'A geometria precisa ter ao menos tres pontos e fechamento para exportar em KML.')
  }

  const documentName = options.documentName || 'Gleba'
  const styleId = options.styleId || 'gleba-style'
  const lineColor = options.lineColor || 'ff22c55e'
  const polygonColor = options.polygonColor || '6622c55e'

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
    <Style id="${escapeXml(styleId)}">
      <LineStyle>
        <color>${escapeXml(lineColor)}</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>${escapeXml(polygonColor)}</color>
      </PolyStyle>
    </Style>
${placemarks.join('\n')}
  </Document>
</kml>`
}

export function buildGlebaKml(feature) {
  const properties = feature?.properties || {}
  const name = properties.nome || properties.id || 'Gleba'

  return buildGeojsonKml(feature, {
    documentName: name,
    styleId: 'gleba-style',
    lineColor: 'ff22c55e',
    polygonColor: '6622c55e',
    preferEditableCoordinates: true,
    emptyGeometryMessage: 'A gleba precisa ter ao menos tres pontos e fechamento para exportar em KML.',
  })
}

export function getGlebaKmlFileName(feature) {
  const properties = feature?.properties || {}
  const label = properties.nome || properties.id || 'gleba'

  return `${slugifyFilePart(label)}.kml`
}

function downloadKmlString(kml, fileName) {
  if (typeof document === 'undefined') return

  const blob = new Blob([kml], {
    type: 'application/vnd.google-earth.kml+xml;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function downloadGeojsonKml(input, options = {}) {
  const kml = buildGeojsonKml(input, options)
  const fileName = options.fileName || `${slugifyFilePart(options.documentName || 'area')}.kml`

  downloadKmlString(kml, fileName)
}

export function downloadGlebaKml(feature) {
  downloadKmlString(buildGlebaKml(feature), getGlebaKmlFileName(feature))
}

export function downloadConsultedCarKml(consultedCar) {
  const carCode = consultedCar?.code ||
    consultedCar?.geojson?.features?.[0]?.properties?.carCode ||
    'car-consultado'

  if (!consultedCar?.geojson?.features?.length) {
    throw new Error('O CAR consultado nao possui geometria para exportar em KML.')
  }

  const geojson = {
    ...consultedCar.geojson,
    features: consultedCar.geojson.features.map((feature, index) => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        id: feature.properties?.id || `public-car-${carCode}-${index + 1}`,
        carCode: feature.properties?.carCode || carCode,
        statusLabel: feature.properties?.statusLabel || consultedCar.statusLabel,
        analysisStatus: feature.properties?.analysisStatus || consultedCar.analysisStatus,
        municipio: feature.properties?.municipio || consultedCar.municipio,
        uf: feature.properties?.uf || consultedCar.uf,
        area: feature.properties?.area || consultedCar.area,
        tipo: feature.properties?.tipo || consultedCar.tipo,
        geometrySource: feature.properties?.geometrySource || consultedCar.geometrySource,
      },
    })),
  }

  downloadGeojsonKml(geojson, {
    documentName: `CAR ${carCode}`,
    fileName: `car-${slugifyFilePart(carCode)}.kml`,
    styleId: 'consulted-car-style',
    lineColor: 'ffffc738',
    polygonColor: '5538c7ff',
    emptyGeometryMessage: 'O CAR consultado nao possui geometria suficiente para exportar em KML.',
    getPlacemarkName: (feature, index) => (
      feature.properties?.carCode
        ? `CAR ${feature.properties.carCode}`
        : `CAR consultado ${index + 1}`
    ),
  })
}
