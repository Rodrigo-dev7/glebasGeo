const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
import { lookupMunicipalityAndState } from './adminBoundaryService'
import { normalizeCarReferenceDataset } from './carReferenceFeatureService'
import { calculatePolygonAreaHectares } from './glebaEnrichmentService'

const CAR_NUMBER_ALIASES = [
  'n_do_car',
  'n_do_recibo',
  'numero_do_car',
  'numero_car',
  'numero_recibo',
  'num_car',
  'num_recibo',
  'nr_car',
  'nr_recibo',
  'recibo',
  'car',
  'cod_imovel',
  'codigo_imovel',
  'id_imovel',
]

const MUNICIPALITY_ALIASES = [
  'municipio',
  'nome_municipio',
  'municipality',
  'city',
]

const UF_ALIASES = [
  'uf',
  'estado',
  'sigla_uf',
  'state',
]

const AREA_ALIASES = [
  'area',
  'area_ha',
  'area_ha_total',
  'area_ha_imovel',
  'area_liquida_do_imovel',
  'area_liquida',
  'areaimovel',
]

function textContent(node, selector) {
  return node.querySelector(selector)?.textContent?.trim() || null
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

function parseCoordinateTuple(rawCoordinate) {
  const [lon, lat] = String(rawCoordinate).trim().split(',').map(Number)
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null
  }

  return [lon, lat]
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

function parseCoordinatesText(coordinatesText) {
  const coordinates = String(coordinatesText ?? '')
    .trim()
    .split(/\s+/)
    .map(parseCoordinateTuple)
    .filter(Boolean)

  return ensureClosedRing(coordinates)
}

function extractExtendedData(placemark) {
  const properties = {}

  placemark.querySelectorAll('ExtendedData Data').forEach((dataNode, index) => {
    const key = dataNode.getAttribute('name') || `data_${index + 1}`
    const value = textContent(dataNode, 'value')
    if (value) {
      properties[key] = value
    }
  })

  placemark.querySelectorAll('ExtendedData SchemaData SimpleData').forEach((dataNode, index) => {
    const key = dataNode.getAttribute('name') || `schema_${index + 1}`
    const value = dataNode.textContent?.trim()
    if (value) {
      properties[key] = value
    }
  })

  return properties
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

async function buildPlacemarkFeature(placemark, index, fileName) {
  const polygonNodes = placemark.querySelectorAll('Polygon')
  const polygons = [...polygonNodes]
    .map((polygonNode) => parseCoordinatesText(textContent(polygonNode, 'outerBoundaryIs > LinearRing > coordinates')))
    .filter((ring) => ring.length >= 4)

  if (!polygons.length) {
    return null
  }

  const name = textContent(placemark, 'name') || `Imovel CAR ${index + 1}`
  const description = textContent(placemark, 'description')
  const extendedData = extractExtendedData(placemark)
  const flattenedCoordinates = flattenPolygons(polygons)
  const boundaryInfo = await lookupMunicipalityAndState(flattenedCoordinates)
  const carNumber =
    getPropertyByAliases(extendedData, CAR_NUMBER_ALIASES) ||
    getPropertyByAliases({ name }, CAR_NUMBER_ALIASES) ||
    name
  const municipio =
    getPropertyByAliases(extendedData, MUNICIPALITY_ALIASES) ||
    boundaryInfo?.municipio ||
    null
  const uf =
    getPropertyByAliases(extendedData, UF_ALIASES) ||
    boundaryInfo?.uf ||
    null
  const areaHa = calculateMultiPolygonAreaHectares(polygons)
  const informedAreaHa = parseNumericValue(getPropertyByAliases(extendedData, AREA_ALIASES))
  const sourceId =
    carNumber ||
    extendedData.cod_imovel ||
    extendedData.codigo_imovel ||
    extendedData.id ||
    name

  return {
    type: 'Feature',
    properties: {
      ...extendedData,
      id: `CAR-${slugify(sourceId) || index + 1}`,
      nome: name,
      numero_car_recibo: carNumber,
      municipio,
      uf,
      area: informedAreaHa ?? areaHa,
      areaCalculada: areaHa,
      areaInformada: informedAreaHa,
      descricao: description,
      origem_arquivo: fileName,
      sourceType: 'kml_car',
    },
    geometry: polygons.length === 1
      ? {
          type: 'Polygon',
          coordinates: [polygons[0]],
        }
      : {
          type: 'MultiPolygon',
          coordinates: polygons.map((ring) => [ring]),
        },
  }
}

async function parseKmlText(text, fileName) {
  const parser = new DOMParser()
  const xml = parser.parseFromString(text, 'application/xml')
  const parserError = xml.querySelector('parsererror')

  if (parserError) {
    throw new Error('O arquivo KML do CAR nao possui uma estrutura XML valida.')
  }

  const placemarks = [...xml.querySelectorAll('Placemark')]
  if (!placemarks.length) {
    throw new Error('O arquivo informado nao possui placemarks para validar.')
  }

  const features = (await Promise.all(
    placemarks.map((placemark, index) => buildPlacemarkFeature(placemark, index, fileName))
  )).filter(Boolean)

  if (!features.length) {
    throw new Error('Nao encontrei poligonos validos no arquivo informado.')
  }

  return normalizeCarReferenceDataset({
    geojson: {
      type: 'FeatureCollection',
      features,
    },
    metadata: {
      fileName,
      sourceType: 'kml_car',
      rowCount: features.length,
      glebaCount: features.length,
      importedAt: new Date().toISOString(),
    },
  })
}

function decodeZipText(bytes) {
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false })
  return utf8Decoder.decode(bytes)
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

async function inflateZipEntry(bytes, compressionMethod) {
  if (compressionMethod === 0) {
    return bytes
  }

  if (compressionMethod !== 8) {
    throw new Error('O KMZ informado usa um metodo de compressao nao suportado pelo navegador.')
  }

  if (typeof DecompressionStream !== 'function') {
    throw new Error('Este navegador nao suporta descompactacao de KMZ em tempo de execucao.')
  }

  const tryFormats = ['deflate-raw', 'deflate']

  for (const format of tryFormats) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format))
      const inflated = await new Response(stream).arrayBuffer()
      return new Uint8Array(inflated)
    } catch {
      // tenta o proximo formato
    }
  }

  throw new Error('Nao foi possivel descompactar o conteudo KML dentro do KMZ informado.')
}

async function extractKmlTextFromKmz(file) {
  const arrayBuffer = await file.arrayBuffer()
  const entries = readZipEntries(arrayBuffer)
  const kmlEntry = entries.find((entry) => entry.fileName.toLowerCase().endsWith('.kml'))

  if (!kmlEntry) {
    throw new Error('O KMZ informado nao contem nenhum arquivo KML interno.')
  }

  const compressedData = readZipEntryData(arrayBuffer, kmlEntry)
  const inflatedData = await inflateZipEntry(compressedData, kmlEntry.compressionMethod)
  return decodeZipText(inflatedData)
}

export async function parseCarReferenceFile(file) {
  const lowerName = file?.name?.toLowerCase() || ''

  if (!file) {
    throw new Error('Nenhum arquivo do CAR foi selecionado.')
  }

  if (lowerName.endsWith('.kml')) {
    return parseKmlText(await file.text(), file.name)
  }

  if (lowerName.endsWith('.kmz')) {
    const kmlText = await extractKmlTextFromKmz(file)
    const parsedDataset = await parseKmlText(kmlText, file.name)

    return {
      ...parsedDataset,
      metadata: {
        ...parsedDataset.metadata,
        sourceType: 'kmz_car',
      },
    }
  }

  throw new Error('Formato nao suportado para a base do CAR. Use KML (.kml) ou KMZ (.kmz).')
}
