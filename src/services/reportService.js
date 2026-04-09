function summarizeFeature(feature) {
  return {
    id: feature.properties?.id || '-',
    nome: feature.properties?.nome || 'Gleba',
    status: feature.properties?.status || 'pendente',
    tipo_uso: feature.properties?.tipo_uso || '-',
    origem_arquivo: feature.properties?.origem_arquivo || '-',
    carOverlapValidation: feature.properties?.carOverlapValidation || null,
  }
}

function formatStatusLabel(status) {
  return {
    valida: 'Valida',
    invalida: 'Invalida',
    pendente: 'Pendente',
  }[status] || 'Pendente'
}

function formatStatusIndicator(status) {
  return {
    valida: 'OK',
    invalida: 'ERRO',
    pendente: 'AVISO',
  }[status] || 'AVISO'
}

function formatCarStatusLabel(carValidation) {
  const status = carValidation?.status

  return {
    not_loaded: 'Nao analisado',
    clear: 'Sem sobreposicao',
    overlap: 'Com sobreposicao',
  }[status] || 'Nao analisado'
}

function countInvalidCoordinates(coordinateStatuses = []) {
  return coordinateStatuses.filter((coordinate) => coordinate.isValid === false).length
}

function summarizeDatasetFeature(feature) {
  const properties = feature.properties || {}
  const metrics = properties.validationMetrics || {}
  const errors = properties.errors || []
  const warnings = properties.warnings || []
  const coordinateStatuses = properties.coordinateStatuses || []
  const repeatedVertexCount = metrics.repeatedVertexIndexes?.length || 0
  const selfOverlapCount = metrics.selfOverlapSegmentCount || 0

  return {
    id: properties.id || '-',
    nome: properties.nome || 'Gleba',
    status: properties.status || 'pendente',
    statusLabel: formatStatusLabel(properties.status),
    statusIndicator: formatStatusIndicator(properties.status),
    area: properties.area ?? null,
    municipio: properties.municipio || '-',
    uf: properties.uf || '-',
    tipoUso: properties.tipo_uso || '-',
    proprietario: properties.proprietario || '-',
    origemArquivo: properties.origem_arquivo || '-',
    carStatus: formatCarStatusLabel(properties.carOverlapValidation),
    carOverlapCount: properties.carOverlapValidation?.overlapCount || 0,
    pointCount: metrics.originalPointCount ?? coordinateStatuses.length,
    invalidCoordinateCount: countInvalidCoordinates(coordinateStatuses),
    uniquePointCount: metrics.uniquePointCount ?? 0,
    repeatedStartCount: metrics.repeatedStartCount ?? 0,
    repeatedVertexCount,
    selfOverlapCount,
    hasInternalOverlap: repeatedVertexCount > 0 || selfOverlapCount > 0 ? 'Sim' : 'Nao',
    errorCount: errors.length,
    warningCount: warnings.length,
    errorLabels: errors.map((error) => error.label).join(' | ') || '-',
    errorMessages: errors.map((error) => error.message).join(' | ') || '-',
    warningLabels: warnings.map((warning) => warning.label).join(' | ') || '-',
    warningMessages: warnings.map((warning) => warning.message).join(' | ') || '-',
  }
}

function buildCritiqueEntries(features = []) {
  return features.flatMap((feature) => {
    const summary = summarizeDatasetFeature(feature)
    const errors = feature.properties?.errors || []
    const warnings = feature.properties?.warnings || []

    const errorRows = errors.map((error) => ({
      severidade: 'Erro',
      indicador: 'ERRO',
      gleba_id: summary.id,
      gleba_nome: summary.nome,
      status_gleba: summary.statusLabel,
      codigo: error.label || '-',
      mensagem: error.message || '-',
      municipio: summary.municipio,
      uf: summary.uf,
    }))

    const warningRows = warnings.map((warning) => ({
      severidade: 'Aviso',
      indicador: 'AVISO',
      gleba_id: summary.id,
      gleba_nome: summary.nome,
      status_gleba: summary.statusLabel,
      codigo: warning.label || '-',
      mensagem: warning.message || '-',
      municipio: summary.municipio,
      uf: summary.uf,
    }))

    return [...errorRows, ...warningRows]
  })
}

function buildValidationSummary(glebas = [], stats = null) {
  const total = glebas.length || stats?.total || 0
  const validas = glebas.filter((gleba) => gleba.status === 'valida').length || stats?.validas || 0
  const invalidas = glebas.filter((gleba) => gleba.status === 'invalida').length || stats?.invalidas || 0
  const pendentes = glebas.filter((gleba) => gleba.status === 'pendente').length || stats?.pendentes || 0

  return {
    total,
    validas,
    invalidas,
    pendentes,
    areaTotal: stats?.areaTotal ?? 0,
    comCriticas: glebas.filter((gleba) => gleba.errorCount > 0).length,
    comAvisos: glebas.filter((gleba) => gleba.warningCount > 0).length,
    comSobreposicaoInterna: glebas.filter((gleba) => gleba.hasInternalOverlap === 'Sim').length,
    comSobreposicaoCar: glebas.filter((gleba) => gleba.carStatus === 'Com sobreposicao').length,
    comCoordenadasInvalidas: glebas.filter((gleba) => gleba.invalidCoordinateCount > 0).length,
  }
}

export function buildValidationReport({ dataset, carReferenceDataset, validationResult, queryPoint, stats }) {
  const datasetFeatures = dataset?.geojson?.features || []
  const glebas = datasetFeatures.map(summarizeDatasetFeature)
  const validationSummary = buildValidationSummary(glebas, stats)

  return {
    generatedAt: new Date().toISOString(),
    dataset: dataset
      ? {
          fileName: dataset.metadata.fileName,
          sourceType: dataset.metadata.sourceType,
          rowCount: dataset.metadata.rowCount,
          glebaCount: dataset.metadata.glebaCount,
          importedAt: dataset.metadata.importedAt,
        }
      : null,
    carReferenceDataset: carReferenceDataset
      ? {
          fileName: carReferenceDataset.metadata.fileName,
          sourceType: carReferenceDataset.metadata.sourceType,
          featureCount: carReferenceDataset.metadata.glebaCount,
          importedAt: carReferenceDataset.metadata.importedAt,
        }
      : null,
    queryPoint: queryPoint || null,
    stats,
    validationSummary,
    glebas,
    critiques: buildCritiqueEntries(datasetFeatures),
    validation: validationResult
      ? {
          status: validationResult.status,
          isMatch: validationResult.isMatch,
          matchType: validationResult.matchType || null,
          message: validationResult.message,
          exactMatches: validationResult.exactMatches.map(summarizeFeature),
          containingFeatures: validationResult.containingFeatures.map(summarizeFeature),
        }
      : null,
  }
}

function formatPercent(part, total) {
  if (!total) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

function setSheetColumns(sheet, widths = []) {
  if (!widths.length) return
  sheet['!cols'] = widths.map((width) => ({ wch: width }))
}

function enableSheetFilter(XLSX, sheet) {
  if (!sheet['!ref']) return

  const range = XLSX.utils.decode_range(sheet['!ref'])
  if (range.e.c < 0) return

  sheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: 0, c: range.e.c },
    }),
  }
}

function buildSummarySheet(XLSX, report) {
  const summary = report.validationSummary || {}
  const rows = [
    ['Resumo da validacao das glebas'],
    [],
    ['Base importada'],
    ['Campo', 'Valor'],
    ['Arquivo principal', report.dataset?.fileName || '-'],
    ['Formato principal', report.dataset?.sourceType || '-'],
    ['Registros importados', report.dataset?.rowCount ?? 0],
    ['Glebas importadas', report.dataset?.glebaCount ?? 0],
    ['Base CAR ativa', report.carReferenceDataset?.fileName || 'Nao carregada'],
    ['Gerado em', report.generatedAt],
    [],
    ['Resumo da validacao'],
    ['Indicador', 'Metrica', 'Valor'],
    ['OK', 'Glebas validas', summary.validas ?? 0],
    ['ERRO', 'Glebas invalidas', summary.invalidas ?? 0],
    ['AVISO', 'Glebas pendentes', summary.pendentes ?? 0],
    ['INFO', 'Total de glebas', summary.total ?? 0],
    ['INFO', 'Area total (ha)', summary.areaTotal ?? 0],
    ['ERRO', 'Glebas com criticas', summary.comCriticas ?? 0],
    ['AVISO', 'Glebas com avisos', summary.comAvisos ?? 0],
    ['ERRO', 'Coordenadas invalidas', summary.comCoordenadasInvalidas ?? 0],
    ['ERRO', 'Sobreposicao interna', summary.comSobreposicaoInterna ?? 0],
    ['INFO', 'Sobreposicao com CAR', summary.comSobreposicaoCar ?? 0],
    ['INFO', 'Percentual validas', formatPercent(summary.validas ?? 0, summary.total ?? 0)],
    ['INFO', 'Percentual invalidas', formatPercent(summary.invalidas ?? 0, summary.total ?? 0)],
  ]

  if (report.queryPoint) {
    rows.push(
      [],
      ['Consulta por coordenada'],
      ['Campo', 'Valor'],
      ['Latitude', report.queryPoint.lat],
      ['Longitude', report.queryPoint.lon],
      ['Resultado', report.validation?.message || '-'],
      ['Tipo de correspondencia', report.validation?.matchType || '-'],
    )
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
    { s: { r: 11, c: 0 }, e: { r: 11, c: 2 } },
  ]

  const querySectionIndex = rows.findIndex((row) => row[0] === 'Consulta por coordenada')
  if (querySectionIndex >= 0) {
    sheet['!merges'].push({ s: { r: querySectionIndex, c: 0 }, e: { r: querySectionIndex, c: 2 } })
  }

  setSheetColumns(sheet, [18, 32, 28])
  return sheet
}

function buildGlebaRows(glebas = [], emptyMessage = 'Nenhuma gleba encontrada') {
  if (!glebas.length) {
    return [{
      indicador: '-',
      status: '-',
      id: '-',
      nome: emptyMessage,
      area_ha: '-',
      municipio: '-',
      uf: '-',
      tipo_uso: '-',
      pontos: '-',
      pontos_invalidos: '-',
      criticas: '-',
      avisos: '-',
      sobreposicao_interna: '-',
      sobreposicao_car: '-',
      resumo_criticas: '-',
    }]
  }

  return glebas.map((gleba) => ({
    indicador: gleba.statusIndicator,
    status: gleba.statusLabel,
    id: gleba.id,
    nome: gleba.nome,
    area_ha: gleba.area ?? '-',
    municipio: gleba.municipio,
    uf: gleba.uf,
    tipo_uso: gleba.tipoUso,
    pontos: gleba.pointCount,
    pontos_invalidos: gleba.invalidCoordinateCount,
    criticas: gleba.errorCount,
    avisos: gleba.warningCount,
    sobreposicao_interna: gleba.hasInternalOverlap,
    sobreposicao_car: gleba.carStatus,
    resumo_criticas: gleba.errorLabels,
  }))
}

function buildCritiqueRows(critiques = []) {
  if (!critiques.length) {
    return [{
      severidade: '-',
      indicador: '-',
      gleba_id: '-',
      gleba_nome: 'Nenhuma critica encontrada',
      status_gleba: '-',
      codigo: '-',
      mensagem: '-',
      municipio: '-',
      uf: '-',
    }]
  }

  return critiques
}

function buildFeatureRows(features = [], relationLabel) {
  if (!features.length) {
    return [{
      relacao: relationLabel,
      id: '-',
      nome: 'Nenhuma gleba encontrada',
      status: '-',
      tipo_uso: '-',
      origem_arquivo: '-',
      validacao_car: '-',
    }]
  }

  return features.map((feature) => ({
    relacao: relationLabel,
    id: feature.id,
    nome: feature.nome,
    status: formatStatusLabel(feature.status),
    tipo_uso: feature.tipo_uso,
    origem_arquivo: feature.origem_arquivo,
    validacao_car: feature.carOverlapValidation?.message || formatCarStatusLabel(feature.carOverlapValidation),
  }))
}

function appendJsonSheet(XLSX, workbook, sheetName, rows, widths = []) {
  const sheet = XLSX.utils.json_to_sheet(rows)
  setSheetColumns(sheet, widths)
  enableSheetFilter(XLSX, sheet)
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
}

export async function downloadValidationReport(report, fileName = 'relatorio-validacao-gleba.xlsx') {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const glebas = report.glebas || []

  const summarySheet = buildSummarySheet(XLSX, report)
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo')

  appendJsonSheet(
    XLSX,
    workbook,
    'Base Completa',
    buildGlebaRows(glebas, 'Nenhuma gleba importada'),
    [12, 12, 18, 28, 12, 18, 8, 18, 10, 18, 10, 10, 18, 20, 42]
  )

  appendJsonSheet(
    XLSX,
    workbook,
    'Glebas Validas',
    buildGlebaRows(
      glebas.filter((gleba) => gleba.status === 'valida'),
      'Nenhuma gleba valida encontrada'
    ),
    [12, 12, 18, 28, 12, 18, 8, 18, 10, 18, 10, 10, 18, 20, 42]
  )

  appendJsonSheet(
    XLSX,
    workbook,
    'Glebas Invalidas',
    buildGlebaRows(
      glebas.filter((gleba) => gleba.status === 'invalida'),
      'Nenhuma gleba invalida encontrada'
    ),
    [12, 12, 18, 28, 12, 18, 8, 18, 10, 18, 10, 10, 18, 20, 48]
  )

  appendJsonSheet(
    XLSX,
    workbook,
    'Criticas SICOR',
    buildCritiqueRows(report.critiques || []),
    [12, 12, 16, 28, 14, 28, 60, 18, 8]
  )

  appendJsonSheet(
    XLSX,
    workbook,
    'Correspondencia',
    buildFeatureRows(report.validation?.exactMatches || [], 'Correspondencia direta'),
    [24, 18, 28, 12, 18, 24, 26]
  )

  appendJsonSheet(
    XLSX,
    workbook,
    'Glebas na area',
    buildFeatureRows(report.validation?.containingFeatures || [], 'Dentro da gleba'),
    [20, 18, 28, 12, 18, 24, 26]
  )

  XLSX.writeFile(workbook, fileName)
}
