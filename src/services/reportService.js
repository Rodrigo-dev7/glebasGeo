function summarizeFeature(feature) {
  return {
    id: feature.properties?.id,
    nome: feature.properties?.nome,
    status: feature.properties?.status,
    tipo_uso: feature.properties?.tipo_uso,
    origem_arquivo: feature.properties?.origem_arquivo,
  }
}

export function buildValidationReport({ dataset, validationResult, queryPoint, stats }) {
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
    queryPoint: queryPoint || null,
    stats,
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

export function downloadValidationReport(report, fileName = 'relatorio-validacao-gleba.json') {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
