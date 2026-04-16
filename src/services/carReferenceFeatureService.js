export function getCarReferenceFeatureKey(feature) {
  const properties = feature?.properties || {}

  return (
    properties.id ||
    properties.numero_car_recibo ||
    properties.cod_imovel ||
    properties.codigo_imovel ||
    properties.car ||
    properties.nome ||
    JSON.stringify(feature?.geometry || null)
  )
}

export function dedupeCarReferenceFeatures(features = []) {
  const seenKeys = new Set()

  return features.filter((feature) => {
    const key = getCarReferenceFeatureKey(feature)
    if (!key) return true

    if (seenKeys.has(key)) {
      return false
    }

    seenKeys.add(key)
    return true
  })
}

export function normalizeCarReferenceDataset(dataset) {
  if (!dataset?.geojson?.features?.length) {
    return dataset
  }

  const features = dedupeCarReferenceFeatures(dataset.geojson.features)

  return {
    ...dataset,
    geojson: {
      ...dataset.geojson,
      features,
    },
    metadata: {
      ...dataset.metadata,
      rowCount: features.length,
      glebaCount: features.length,
      duplicateCount: dataset.geojson.features.length - features.length,
    },
  }
}
