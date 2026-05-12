const KML_BOUNDARY_LOOKUP_FEATURE_LIMIT = 500
const KML_DISPLAY_RING_POINT_LIMIT = 750
const KML_BUFFER_TAIL_LENGTH = 4096
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const PLACEMARK_OPEN_PATTERN = /<(?:[\w-]+:)?Placemark\b[^>]*>/i
const PLACEMARK_CLOSE_PATTERN = /<\/(?:[\w-]+:)?Placemark>/i
const XML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

const CAR_NUMBER_ALIASES = [
  'n_do_car',
  'n_do_recibo',
  'n_recibo',
  'nrecibo',
  'numero_do_car',
  'numero_car',
  'numero_recibo',
  'numero_rec',
  'numero_imovel',
  'num_car',
  'numcar',
  'num_recibo',
  'numrecibo',
  'nr_car',
  'nrcar',
  'nr_recibo',
  'nu_car',
  'nucar',
  'nu_recibo',
  'recibo',
  'recibo_car',
  'car',
  'cod_car',
  'codcar',
  'cod_imovel',
  'codimovel',
  'cod_imove',
  'cd_imovel',
  'cdimovel',
  'codigo_imovel',
  'codigoimo',
  'codigo_car',
  'codigo_sicar',
  'cod_sicar',
  'id_imovel',
  'id_car',
  'idcar',
  'car_id',
]
const CAR_NUMBER_PATTERN = /\b[A-Z]{2}-\d{7}-[A-Z0-9]{8,}\b/i
const CAR_NUMBER_KEY_HINTS = ['car', 'recibo', 'imovel', 'sicar']
const MUNICIPALITY_ALIASES = ['municipio', 'nome_municipio', 'municipality', 'city']
const UF_ALIASES = ['uf', 'estado', 'sigla_uf', 'state']
const AREA_ALIASES = [
  'area',
  'area_ha',
  'area_ha_total',
  'area_ha_imovel',
  'area_liquida_do_imovel',
  'area_liquida',
  'areaimovel',
]
const EARTH_RADIUS_METERS = 6371008.8

function decodeXmlText(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
      const normalizedCode = code.toLowerCase()

      if (normalizedCode.startsWith('#x')) {
        const parsed = Number.parseInt(normalizedCode.slice(2), 16)
        return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity
      }

      if (normalizedCode.startsWith('#')) {
        const parsed = Number.parseInt(normalizedCode.slice(1), 10)
        return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity
      }

      return XML_ENTITIES[normalizedCode] || entity
    })
    .trim()
}

function createTagPattern(tagName, flags = 'i') {
  return new RegExp(
    `<(?:[\\w-]+:)?${tagName}\\b[^>]*>[\\s\\S]*?<\\/(?:[\\w-]+:)?${tagName}>`,
    flags
  )
}

function createTagContentPattern(tagName, flags = 'i') {
  return new RegExp(
    `<(?:[\\w-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>`,
    flags
  )
}

function getTagBlocks(source, tagName) {
  return [...String(source || '').matchAll(createTagPattern(tagName, 'gi'))].map((match) => match[0])
}

function getTagText(source, tagName) {
  const match = String(source || '').match(createTagContentPattern(tagName))
  return match ? decodeXmlText(match[1]) : null
}

function getOpeningTag(source, tagName) {
  const match = String(source || '').match(new RegExp(`<(?:[\\w-]+:)?${tagName}\\b[^>]*>`, 'i'))
  return match?.[0] || ''
}

function getAttributeValue(source, attributeName) {
  const match = String(source || '').match(
    new RegExp(`\\b${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')
  )

  return decodeXmlText(match?.[1] || match?.[2] || '')
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function getPropertyByAliases(properties, aliases) {
  const entries = Object.entries(properties || {}).map(([key, value]) => [normalizeKey(key), value])

  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias)
    const found = entries.find(([key, value]) => key === normalizedAlias && value !== null && value !== undefined && value !== '')
    if (found) {
      return String(found[1]).trim()
    }
  }

  return null
}

function normalizeTextValue(value) {
  const text = String(value ?? '').trim()
  if (!text || text === '-') return null

  return text
}

function extractCarNumberFromText(value) {
  const text = normalizeTextValue(value)
  if (!text) return null

  const [match] = text.match(CAR_NUMBER_PATTERN) || []
  return match ? match.toUpperCase() : null
}

function findCarNumberInProperties(properties = {}) {
  const aliasMatch = normalizeTextValue(getPropertyByAliases(properties, CAR_NUMBER_ALIASES))
  if (aliasMatch) return aliasMatch

  const entries = Object.entries(properties || {})
  const hintedEntries = entries.filter(([key]) => {
    const normalizedKey = normalizeKey(key)
    return CAR_NUMBER_KEY_HINTS.some((hint) => normalizedKey.includes(hint))
  })

  for (const [, value] of hintedEntries) {
    const match = extractCarNumberFromText(value)
    if (match) return match
  }

  for (const [, value] of entries) {
    const match = extractCarNumberFromText(value)
    if (match) return match
  }

  return null
}

function parseNumericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) return null

  const normalized = trimmed.replace(/\s+/g, '')

  if (normalized.includes(',') && normalized.includes('.')) {
    const lastComma = normalized.lastIndexOf(',')
    const lastDot = normalized.lastIndexOf('.')
    const decimalSeparator = lastComma > lastDot ? ',' : '.'
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ','
    const canonical = normalized
      .split(thousandsSeparator).join('')
      .replace(decimalSeparator, '.')
    const parsed = Number(canonical)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (normalized.includes(',')) {
    const parsed = Number(normalized.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180
}

function normalizeRing(coordinates = []) {
  if (!coordinates.length) return []

  const ring = coordinates.map(([lon, lat]) => [Number(lon), Number(lat)])
  const first = ring[0]
  const last = ring[ring.length - 1]

  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    return ring.slice(0, -1)
  }

  return ring
}

function sphericalRingArea(coordinates = []) {
  const ring = normalizeRing(coordinates)

  if (ring.length < 3) return 0

  let area = 0

  for (let index = 0; index < ring.length; index += 1) {
    const [lon1, lat1] = ring[index]
    const [lon2, lat2] = ring[(index + 1) % ring.length]

    area +=
      (degreesToRadians(lon2) - degreesToRadians(lon1)) *
      (2 + Math.sin(degreesToRadians(lat1)) + Math.sin(degreesToRadians(lat2)))
  }

  return Math.abs((area * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS) / 2)
}

function calculatePolygonAreaHectares(coordinates = []) {
  const squareMeters = sphericalRingArea(coordinates)
  if (!squareMeters) return null

  return Number((squareMeters / 10000).toFixed(2))
}

function ensureClosedRing(coordinates) {
  if (coordinates.length < 3) return coordinates

  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]

  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates
  }

  return [...coordinates, first]
}

function coordinatesEqual(left, right) {
  if (!left || !right) return false

  return left[0] === right[0] && left[1] === right[1]
}

function simplifyClosedRingForDisplay(coordinates) {
  const closedRing = ensureClosedRing(coordinates)

  if (closedRing.length <= KML_DISPLAY_RING_POINT_LIMIT) {
    return closedRing
  }

  const openRing = coordinatesEqual(closedRing[0], closedRing[closedRing.length - 1])
    ? closedRing.slice(0, -1)
    : closedRing
  const targetOpenPointCount = Math.max(3, KML_DISPLAY_RING_POINT_LIMIT - 1)
  const step = Math.max(1, Math.ceil(openRing.length / targetOpenPointCount))
  const simplified = []

  for (let index = 0; index < openRing.length; index += step) {
    simplified.push(openRing[index])
  }

  const lastOpenPoint = openRing[openRing.length - 1]
  if (!coordinatesEqual(simplified[simplified.length - 1], lastOpenPoint)) {
    simplified.push(lastOpenPoint)
  }

  return ensureClosedRing(simplified)
}

function parseCoordinateTuple(rawCoordinate) {
  const [lon, lat] = String(rawCoordinate).trim().split(',').map(Number)
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null
  }

  return [lon, lat]
}

function parseCoordinatesText(coordinatesText) {
  const coordinates = String(coordinatesText ?? '')
    .trim()
    .split(/\s+/)
    .map(parseCoordinateTuple)
    .filter(Boolean)

  return ensureClosedRing(coordinates)
}

function parseCoordinateRing(coordinatesText) {
  const originalRing = parseCoordinatesText(coordinatesText)
  const displayRing = simplifyClosedRingForDisplay(originalRing)

  return {
    originalRing,
    displayRing,
    originalPointCount: originalRing.length,
    displayPointCount: displayRing.length,
    isSimplified: displayRing.length < originalRing.length,
  }
}

function extractExtendedData(placemarkSource) {
  const properties = {}

  getTagBlocks(placemarkSource, 'Data').forEach((dataBlock, index) => {
    const key = getAttributeValue(getOpeningTag(dataBlock, 'Data'), 'name') || `data_${index + 1}`
    const value = getTagText(dataBlock, 'value')
    if (value) {
      properties[key] = value
    }
  })

  getTagBlocks(placemarkSource, 'SimpleData').forEach((dataBlock, index) => {
    const key = getAttributeValue(getOpeningTag(dataBlock, 'SimpleData'), 'name') || `schema_${index + 1}`
    const value = decodeXmlText(
      dataBlock.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>$/, '')
    )
    if (value) {
      properties[key] = value
    }
  })

  return properties
}

function extractPolygonRings(placemarkSource) {
  return getTagBlocks(placemarkSource, 'Polygon')
    .map((polygonBlock) => {
      const outerBoundaryBlock = getTagBlocks(polygonBlock, 'outerBoundaryIs')[0] || polygonBlock
      const linearRingBlock = getTagBlocks(outerBoundaryBlock, 'LinearRing')[0] || outerBoundaryBlock
      return parseCoordinateRing(getTagText(linearRingBlock, 'coordinates'))
    })
    .filter((ring) => ring.originalRing.length >= 4)
}

function flattenPolygons(polygons) {
  return polygons.flatMap((ring) => ring.slice(0, -1))
}

function calculateMultiPolygonAreaHectares(polygons) {
  const area = polygons.reduce(
    (total, ring) => total + (calculatePolygonAreaHectares(ring) || 0),
    0
  )

  return area ? Number(area.toFixed(2)) : null
}

function calculateBoundsFromRings(rings) {
  const points = flattenPolygons(rings)
  if (!points.length) return null

  return points.reduce(
    (bounds, [lon, lat]) => ({
      minLon: Math.min(bounds.minLon, lon),
      minLat: Math.min(bounds.minLat, lat),
      maxLon: Math.max(bounds.maxLon, lon),
      maxLat: Math.max(bounds.maxLat, lat),
    }),
    {
      minLon: Infinity,
      minLat: Infinity,
      maxLon: -Infinity,
      maxLat: -Infinity,
    }
  )
}

function extendBounds(baseBounds, nextBounds) {
  if (!nextBounds) return baseBounds
  if (!baseBounds) return nextBounds

  return {
    minLon: Math.min(baseBounds.minLon, nextBounds.minLon),
    minLat: Math.min(baseBounds.minLat, nextBounds.minLat),
    maxLon: Math.max(baseBounds.maxLon, nextBounds.maxLon),
    maxLat: Math.max(baseBounds.maxLat, nextBounds.maxLat),
  }
}

function buildPlacemarkFeature(placemarkSource, index, fileName, options = {}) {
  const polygonRings = extractPolygonRings(placemarkSource)
  if (!polygonRings.length) {
    return null
  }
  const originalPolygons = polygonRings.map((ring) => ring.originalRing)
  const displayPolygons = polygonRings.map((ring) => ring.displayRing)
  const originalPointCount = polygonRings.reduce(
    (total, ring) => total + ring.originalPointCount,
    0
  )
  const displayPointCount = polygonRings.reduce(
    (total, ring) => total + ring.displayPointCount,
    0
  )
  const isGeometrySimplified = polygonRings.some((ring) => ring.isSimplified)

  const extendedData = extractExtendedData(placemarkSource)
  const placemarkId = getAttributeValue(getOpeningTag(placemarkSource, 'Placemark'), 'id')
  const name =
    getTagText(placemarkSource, 'name') ||
    getPropertyByAliases(extendedData, ['numero_emb', 'numero_ai', 'processo', 'nome', 'name']) ||
    `Area KML ${index + 1}`
  const description = getTagText(placemarkSource, 'description')
  const carNumber = findCarNumberInProperties(extendedData)
  const municipio = getPropertyByAliases(extendedData, MUNICIPALITY_ALIASES) || null
  const uf = getPropertyByAliases(extendedData, UF_ALIASES) || null
  const areaHa = calculateMultiPolygonAreaHectares(originalPolygons)
  const informedAreaHa = parseNumericValue(getPropertyByAliases(extendedData, AREA_ALIASES))
  const sourceId =
    placemarkId ||
    carNumber ||
    extendedData.cod_imovel ||
    extendedData.codigo_imovel ||
    extendedData.id ||
    extendedData.numero_emb ||
    extendedData.numero_ai ||
    name
  const bounds = calculateBoundsFromRings(originalPolygons)

  return {
    feature: {
      type: 'Feature',
      properties: {
        ...extendedData,
        id: `KML-${slugify(sourceId) || index + 1}`,
        nome: name,
        numero_car_recibo: carNumber,
        numero_car_imovel: carNumber,
        municipio,
        uf,
        area: informedAreaHa ?? areaHa,
        areaCalculada: areaHa,
        areaInformada: informedAreaHa,
        descricao: description,
        origem_arquivo: fileName,
        sourceType: options.sourceType || 'kml_car',
        __bounds: bounds,
        __originalPointCount: originalPointCount,
        __displayPointCount: displayPointCount,
        __geometrySimplified: isGeometrySimplified,
      },
      geometry: displayPolygons.length === 1
        ? {
            type: 'Polygon',
            coordinates: [displayPolygons[0]],
          }
        : {
            type: 'MultiPolygon',
            coordinates: displayPolygons.map((ring) => [ring]),
          },
    },
    bounds,
    originalPointCount,
    displayPointCount,
    isGeometrySimplified,
  }
}

function createKmlParseState(fileName, sourceType = 'kml_car') {
  return {
    fileName,
    sourceType,
    placemarkCount: 0,
    totalOriginalPointCount: 0,
    totalDisplayPointCount: 0,
    simplifiedFeatureCount: 0,
    datasetBounds: null,
    features: [],
  }
}

function addPlacemarkToState(state, placemarkSource) {
  const index = state.placemarkCount
  state.placemarkCount += 1
  const result = buildPlacemarkFeature(placemarkSource, index, state.fileName)

  if (!result?.feature) return

  state.features.push(result.feature)
  state.datasetBounds = extendBounds(state.datasetBounds, result.bounds)
  state.totalOriginalPointCount += result.originalPointCount || 0
  state.totalDisplayPointCount += result.displayPointCount || 0
  if (result.isGeometrySimplified) {
    state.simplifiedFeatureCount += 1
  }
}

function finalizeKmlDataset(state) {
  if (!state.placemarkCount) {
    throw new Error('O arquivo informado nao possui placemarks para validar.')
  }

  if (!state.features.length) {
    throw new Error('Nao encontrei poligonos validos no arquivo informado.')
  }

  const geometrySimplified = state.simplifiedFeatureCount > 0

  return {
    geojson: {
      type: 'FeatureCollection',
      features: state.features,
    },
    metadata: {
      fileName: state.fileName,
      sourceType: state.sourceType,
      rowCount: state.features.length,
      glebaCount: state.features.length,
      placemarkCount: state.placemarkCount,
      boundaryLookupSkipped: state.placemarkCount > KML_BOUNDARY_LOOKUP_FEATURE_LIMIT,
      bounds: state.datasetBounds,
      totalOriginalPointCount: state.totalOriginalPointCount,
      totalDisplayPointCount: state.totalDisplayPointCount,
      simplifiedFeatureCount: state.simplifiedFeatureCount,
      geometrySimplified,
      importedAt: new Date().toISOString(),
    },
  }
}

function processPlacemarkBuffer(buffer, state, isFinal = false) {
  let nextBuffer = buffer

  while (nextBuffer.length) {
    const openMatch = nextBuffer.match(PLACEMARK_OPEN_PATTERN)

    if (!openMatch) {
      return isFinal ? '' : nextBuffer.slice(-KML_BUFFER_TAIL_LENGTH)
    }

    if (openMatch.index > 0) {
      nextBuffer = nextBuffer.slice(openMatch.index)
    }

    const closeMatch = nextBuffer.match(PLACEMARK_CLOSE_PATTERN)
    if (!closeMatch) {
      return nextBuffer
    }

    const placemarkEnd = closeMatch.index + closeMatch[0].length
    addPlacemarkToState(state, nextBuffer.slice(0, placemarkEnd))
    nextBuffer = nextBuffer.slice(placemarkEnd)
  }

  return ''
}

async function parseKmlStream(readableStream, state, finalize = true) {
  const reader = readableStream.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    buffer = processPlacemarkBuffer(buffer, state, done)

    if (done) break
  }

  buffer += decoder.decode()
  processPlacemarkBuffer(buffer, state, true)
  return finalize ? finalizeKmlDataset(state) : state
}

async function parseKmlFile(file) {
  const state = createKmlParseState(file.name, 'kml_car')

  if (typeof file.stream !== 'function') {
    const text = await file.text()
    processPlacemarkBuffer(text, state, true)
    return finalizeKmlDataset(state)
  }

  return parseKmlStream(file.stream(), state)
}

function decodeZipText(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

function findEndOfCentralDirectory(view) {
  const minimumOffset = Math.max(0, view.byteLength - 65557)

  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset
    }
  }

  return -1
}

function readZipEntries(arrayBuffer) {
  const view = new DataView(arrayBuffer)
  const eocdOffset = findEndOfCentralDirectory(view)

  if (eocdOffset === -1) {
    throw new Error('O KMZ informado nao possui uma estrutura ZIP valida.')
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true)
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true)
  const bytes = new Uint8Array(arrayBuffer)
  const entries = []
  let offset = centralDirectoryOffset

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error('Nao foi possivel ler o diretorio central do KMZ informado.')
    }

    const compressionMethod = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const uncompressedSize = view.getUint32(offset + 24, true)
    const fileNameLength = view.getUint16(offset + 28, true)
    const extraFieldLength = view.getUint16(offset + 30, true)
    const fileCommentLength = view.getUint16(offset + 32, true)
    const localHeaderOffset = view.getUint32(offset + 42, true)
    const fileNameBytes = bytes.slice(offset + 46, offset + 46 + fileNameLength)
    const fileName = decodeZipText(fileNameBytes)

    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    })

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength
  }

  return entries
}

function readZipEntryData(arrayBuffer, entry) {
  const view = new DataView(arrayBuffer)
  const bytes = new Uint8Array(arrayBuffer)
  const offset = entry.localHeaderOffset

  if (view.getUint32(offset, true) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`Nao foi possivel localizar o conteudo de ${entry.fileName} dentro do KMZ.`)
  }

  const fileNameLength = view.getUint16(offset + 26, true)
  const extraFieldLength = view.getUint16(offset + 28, true)
  const dataStart = offset + 30 + fileNameLength + extraFieldLength

  return bytes.slice(dataStart, dataStart + entry.compressedSize)
}

function createZipEntryStream(bytes, compressionMethod) {
  if (compressionMethod === 0) {
    return new Blob([bytes]).stream()
  }

  if (compressionMethod !== 8) {
    throw new Error('O KMZ informado usa um metodo de compressao nao suportado pelo navegador.')
  }

  if (typeof DecompressionStream !== 'function') {
    throw new Error('Este navegador nao suporta descompactacao de KMZ em tempo de execucao.')
  }

  return new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
}

async function parseKmzFile(file) {
  const arrayBuffer = await file.arrayBuffer()
  const entries = readZipEntries(arrayBuffer)
  const kmlEntries = entries.filter((entry) => entry.fileName.toLowerCase().endsWith('.kml'))

  if (!kmlEntries.length) {
    throw new Error('O KMZ informado nao contem nenhum arquivo KML interno.')
  }

  const state = createKmlParseState(file.name, 'kmz_car')

  for (const entry of kmlEntries) {
    const entryData = readZipEntryData(arrayBuffer, entry)
    const stream = createZipEntryStream(entryData, entry.compressionMethod)
    await parseKmlStream(stream, state, false)
  }

  return finalizeKmlDataset(state)
}

self.onmessage = async (event) => {
  const message = event.data || {}
  if (message.type !== 'parse-kml') return

  try {
    const lowerName = String(message.file?.name || '').toLowerCase()
    const dataset = lowerName.endsWith('.kmz')
      ? await parseKmzFile(message.file)
      : await parseKmlFile(message.file)

    self.postMessage({
      type: 'success',
      requestId: message.requestId,
      dataset,
    })
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId: message.requestId,
      error: error?.message || 'Nao foi possivel processar o arquivo KML.',
    })
  }
}
