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

function normalizeCoordinates(feature) {
  return ensureClosedRing(
    getEditableCoordinates(feature)
      .map(([lon, lat]) => [Number(lon), Number(lat)])
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
  )
}

function buildExtendedData(properties = {}) {
  const entries = [
    ['id', properties.id],
    ['nome', properties.nome],
    ['status', properties.status],
    ['area_ha', properties.area],
    ['municipio', properties.municipio],
    ['uf', properties.uf],
    ['tipo_uso', properties.tipo_uso],
    ['origem_arquivo', properties.origem_arquivo],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '')

  if (!entries.length) return ''

  return `
      <ExtendedData>
${entries.map(([name, value]) => `        <Data name="${escapeXml(name)}"><value>${escapeXml(value)}</value></Data>`).join('\n')}
      </ExtendedData>`
}

export function buildGlebaKml(feature) {
  const properties = feature?.properties || {}
  const coordinates = normalizeCoordinates(feature)

  if (coordinates.length < 4) {
    throw new Error('A gleba precisa ter ao menos tres pontos e fechamento para exportar em KML.')
  }

  const coordinateText = coordinates
    .map(([lon, lat]) => `${lon},${lat},0`)
    .join(' ')
  const name = properties.nome || properties.id || 'Gleba'

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(name)}</name>
    <Style id="gleba-style">
      <LineStyle>
        <color>ff22c55e</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>6622c55e</color>
      </PolyStyle>
    </Style>
    <Placemark>
      <name>${escapeXml(name)}</name>${buildExtendedData(properties)}
      <styleUrl>#gleba-style</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordinateText}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`
}

export function getGlebaKmlFileName(feature) {
  const properties = feature?.properties || {}
  const label = properties.nome || properties.id || 'gleba'

  return `${slugifyFilePart(label)}.kml`
}

export function downloadGlebaKml(feature) {
  if (typeof document === 'undefined') return

  const kml = buildGlebaKml(feature)
  const blob = new Blob([kml], {
    type: 'application/vnd.google-earth.kml+xml;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = getGlebaKmlFileName(feature)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
