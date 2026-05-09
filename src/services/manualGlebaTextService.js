import { validateSicorPolygon } from './sicorGlebaValidationService'
import { enrichFeatureProperties } from './glebaEnrichmentService'

const MANUAL_SOURCE_NAME = 'Adicionar Gleba'

function normalizeNumber(value) {
  const normalized = String(value ?? '').trim().replace(',', '.')
  if (!normalized) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeHeaderToken(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function splitLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return []

  if (trimmed.includes(';')) {
    return trimmed.split(';').map((part) => part.trim()).filter(Boolean)
  }

  return trimmed.split(/\s+/).map((part) => part.trim()).filter(Boolean)
}

function isHeaderLine(columns = []) {
  const normalized = columns.map(normalizeHeaderToken)

  return (
    normalized.includes('gleba') &&
    normalized.includes('ponto') &&
    normalized.includes('latitude') &&
    normalized.includes('longitude')
  )
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

function parseManualTextRows(text) {
  const rows = []
  const errors = []
  const lines = String(text || '').split(/\r?\n/)

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim()
    const lineNumber = lineIndex + 1

    if (!trimmed || trimmed.startsWith('//')) return

    const columns = splitLine(trimmed)
    if (!columns.length) return

    if (trimmed.startsWith('#') || isHeaderLine(columns)) {
      return
    }

    if (columns.length < 4) {
      errors.push(`Linha ${lineNumber}: informe Gleba, Ponto, Latitude e Longitude.`)
      return
    }

    const [glebaRaw, pointRaw, latRaw, lonRaw] = columns
    const groupId = String(glebaRaw ?? '').trim()
    const pointLabel = String(pointRaw ?? '').trim()
    const lat = normalizeNumber(latRaw)
    const lon = normalizeNumber(lonRaw)

    if (!groupId) {
      errors.push(`Linha ${lineNumber}: o numero da gleba esta vazio.`)
      return
    }

    if (!pointLabel) {
      errors.push(`Linha ${lineNumber}: o numero do ponto esta vazio.`)
      return
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      errors.push(`Linha ${lineNumber}: latitude e longitude devem ser numeros validos.`)
      return
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      errors.push(`Linha ${lineNumber}: latitude ou longitude fora da faixa geografica esperada.`)
      return
    }

    rows.push({
      rowIndex: rows.length,
      lineNumber,
      groupId,
      pointLabel,
      lat,
      lon,
      raw: trimmed,
    })
  })

  if (errors.length) {
    throw new Error(errors.slice(0, 5).join(' '))
  }

  if (!rows.length) {
    throw new Error('Cole ao menos uma linha no formato: Gleba Ponto Latitude Longitude.')
  }

  return rows
}

async function buildManualFeature(groupId, rows) {
  const orderedRows = [...rows].sort((left, right) => left.rowIndex - right.rowIndex)
  const originalCoordinates = orderedRows.map((row) => [row.lon, row.lat])
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
      id: `MANUAL-${groupId}`,
      nome: `Gleba ${groupId}`,
      area: enrichment.area,
      proprietario: null,
      municipio: enrichment.municipio,
      uf: enrichment.uf,
      codigo_imovel: `manual::${groupId}`,
      tipo_uso: 'Adicionada manualmente',
      data_inscricao: null,
      situacao_cadastral: 'Adicionada manualmente',
      origem_arquivo: MANUAL_SOURCE_NAME,
      total_pontos: orderedRows.length,
      sourceType: 'manual',
      errors: sicor.errors,
      warnings: sicor.warnings,
      status: sicor.status,
      sourceRows: orderedRows,
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

export async function parseManualGlebaText(text) {
  const rows = parseManualTextRows(text)
  const groupedRows = rows.reduce((accumulator, row) => {
    if (!accumulator.has(row.groupId)) {
      accumulator.set(row.groupId, [])
    }

    accumulator.get(row.groupId).push(row)
    return accumulator
  }, new Map())

  const features = await Promise.all(
    [...groupedRows.entries()].map(([groupId, groupRows]) =>
      buildManualFeature(groupId, groupRows)
    )
  )
  const importedAt = new Date().toISOString()

  return {
    geojson: {
      type: 'FeatureCollection',
      features,
    },
    metadata: {
      fileName: MANUAL_SOURCE_NAME,
      fileNames: [MANUAL_SOURCE_NAME],
      fileCount: 1,
      sheetName: null,
      rowCount: rows.length,
      glebaCount: features.length,
      importedAt,
      sourceType: 'manual',
      sourceTypes: ['manual'],
      datasetKey: `manual-${importedAt}`,
    },
  }
}
