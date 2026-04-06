import { validateSicorPolygon } from './sicorGlebaValidationService'
import { enrichFeatureProperties } from './glebaEnrichmentService'

const HEADER_ALIASES = {
  lat: ['lat', 'latitude'],
  lon: ['long', 'lon', 'longitude', 'lng'],
  gleba: ['gleba', 'idgleba', 'poligono', 'talhao', 'talhaoid'],
  ponto: ['ponto', 'ordem', 'sequencia', 'vertice'],
  cultura: ['cultura', 'uso', 'tipouso', 'atividade'],
  formato: ['formatodagleba', 'formato'],
  areaNaoCultivada: ['areanaocultivada', 'areanaocult'],
  altitude: ['alt', 'altitude'],
}

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function findColumnKey(headers, aliases) {
  const normalizedEntries = Object.entries(headers).map(([key, label]) => [
    key,
    normalizeHeader(label),
  ])

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias)
    const found = normalizedEntries.find(([, normalized]) => normalized === normalizedAlias)
    if (found) return found[0]
  }

  return null
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null

  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
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

async function buildFeature(groupId, rows, filename) {
  const sortedRows = [...rows].sort((a, b) => {
    const left = a.pointOrder ?? a.rowIndex
    const right = b.pointOrder ?? b.rowIndex
    return left - right
  })

  const originalCoordinates = sortedRows.map((row) => [row.lon, row.lat])
  const displayCoordinates = closeRingForDisplay(originalCoordinates)
  const sicor = validateSicorPolygon({
    originalCoordinates,
    displayCoordinates,
  })
  const enrichment = await enrichFeatureProperties({
    originalCoordinates,
    existingProperties: {},
  })

  return {
    type: 'Feature',
    properties: {
      id: `XLS-${groupId}`,
      nome: `Gleba ${groupId}`,
      area: enrichment.area,
      proprietario: null,
      municipio: enrichment.municipio,
      uf: enrichment.uf,
      codigo_imovel: `${filename}::${groupId}`,
      tipo_uso: sortedRows[0]?.cultura || 'Importada via Excel',
      data_inscricao: null,
      situacao_cadastral: 'Importada via Excel',
      origem_arquivo: filename,
      formato_gleba: sortedRows[0]?.formato || null,
      area_nao_cultivada: sortedRows[0]?.areaNaoCultivada ?? null,
      altitude_media: sortedRows[0]?.altitude ?? null,
      total_pontos: sortedRows.length,
      sourceType: 'excel',
      errors: sicor.errors,
      warnings: sicor.warnings,
      status: sicor.status,
      sourceRows: sortedRows,
      coordinateStatuses: sicor.coordinateStatuses,
      validationMetrics: sicor.metrics,
      enrichment,
      originalCoordinates,
      displayCoordinates,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [displayCoordinates],
    },
  }
}

export async function parseExcelGeoFile(file) {
  const XLSX = await import('xlsx')
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true })

  if (!rows.length) {
    throw new Error('A planilha nao possui linhas de dados para importar.')
  }

  const firstRow = rows[0]
  const headers = Object.fromEntries(Object.keys(firstRow).map((key) => [key, key]))

  const latKey = findColumnKey(headers, HEADER_ALIASES.lat)
  const lonKey = findColumnKey(headers, HEADER_ALIASES.lon)

  if (!latKey || !lonKey) {
    throw new Error('Nao encontrei colunas de latitude e longitude na planilha.')
  }

  const glebaKey = findColumnKey(headers, HEADER_ALIASES.gleba)
  const pointKey = findColumnKey(headers, HEADER_ALIASES.ponto)
  const culturaKey = findColumnKey(headers, HEADER_ALIASES.cultura)
  const formatoKey = findColumnKey(headers, HEADER_ALIASES.formato)
  const areaNaoCultivadaKey = findColumnKey(headers, HEADER_ALIASES.areaNaoCultivada)
  const altitudeKey = findColumnKey(headers, HEADER_ALIASES.altitude)

  const parsedRows = rows
    .map((row, index) => ({
      rowIndex: index,
      groupId: String(row[glebaKey] ?? '1').trim() || '1',
      pointOrder: toNumber(row[pointKey]),
      cultura: row[culturaKey] ?? null,
      formato: row[formatoKey] ?? null,
      areaNaoCultivada: toNumber(row[areaNaoCultivadaKey]),
      altitude: toNumber(row[altitudeKey]),
      lat: toNumber(row[latKey]),
      lon: toNumber(row[lonKey]),
      raw: row,
    }))
    .filter((row) => row.lat !== null && row.lon !== null)

  if (!parsedRows.length) {
    throw new Error('Nenhuma linha valida com latitude e longitude foi encontrada.')
  }

  const grouped = parsedRows.reduce((accumulator, row) => {
    if (!accumulator.has(row.groupId)) {
      accumulator.set(row.groupId, [])
    }

    accumulator.get(row.groupId).push(row)
    return accumulator
  }, new Map())

  const features = await Promise.all(
    [...grouped.entries()].map(([groupId, groupRows]) =>
      buildFeature(groupId, groupRows, file.name)
    )
  )

  return {
    geojson: {
      type: 'FeatureCollection',
      features,
    },
    metadata: {
      fileName: file.name,
      sheetName,
      rowCount: parsedRows.length,
      glebaCount: features.length,
      importedAt: new Date().toISOString(),
    },
  }
}
