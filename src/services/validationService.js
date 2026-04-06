/**
 * validationService.js
 * Serviço de validação de glebas georreferenciadas.
 * Aplica regras de negócio e retorna status + erros/avisos por gleba.
 */

// ── Constantes de regras ──────────────────────────────────────────────────────
const AREA_MINIMA_HA = 5          // Área mínima em hectares
const AREA_MAXIMA_HA = 5000       // Área máxima em hectares (SNCR)
const MIN_VERTICES   = 4          // Mínimo de pontos (incluindo fechamento)

const CAMPOS_OBRIGATORIOS = [
  { campo: 'proprietario',  label: 'Proprietário' },
  { campo: 'codigo_imovel', label: 'Código do Imóvel (SNCR/CAR)' },
  { campo: 'municipio',     label: 'Município' },
]

// ── Validador individual ──────────────────────────────────────────────────────
/**
 * Valida uma feature GeoJSON individual.
 * @param {object} feature - Feature GeoJSON
 * @returns {object} Feature com propriedades status, errors e warnings preenchidos
 */
export function validateGleba(feature) {
  const props  = feature.properties
  const errors   = []
  const warnings = []

  // 1. Área mínima
  if (typeof props.area === 'number' && props.area < AREA_MINIMA_HA) {
    errors.push({
      code: 'AREA_INSUFICIENTE',
      label: 'Área Insuficiente',
      message: `Área de ${props.area} ha está abaixo do mínimo exigido (${AREA_MINIMA_HA} ha).`,
    })
  }

  // 2. Área máxima
  if (typeof props.area === 'number' && props.area > AREA_MAXIMA_HA) {
    warnings.push({
      code: 'AREA_EXCEDIDA',
      label: 'Área Excedida',
      message: `Área de ${props.area} ha supera o limite máximo (${AREA_MAXIMA_HA} ha). Requer revisão.`,
    })
  }

  // 3. Campos obrigatórios ausentes
  for (const { campo, label } of CAMPOS_OBRIGATORIOS) {
    if (!props[campo]) {
      errors.push({
        code: 'CAMPO_OBRIGATORIO',
        label: 'Dado Faltando',
        message: `Campo obrigatório ausente: ${label}.`,
      })
    }
  }

  // 4. Geometria — vértices insuficientes
  const coords = feature.geometry?.coordinates?.[0]
  if (!coords || coords.length < MIN_VERTICES) {
    errors.push({
      code: 'GEOMETRIA_INVALIDA',
      label: 'Geometria Inválida',
      message: `Polígono possui apenas ${coords?.length ?? 0} ponto(s). Mínimo: ${MIN_VERTICES} (incluindo fechamento).`,
    })
  }

  // 5. Coordenadas fora do Brasil (bbox aproximado)
  if (coords?.length) {
    const invalidCoord = coords.find(
      ([lon, lat]) => lon < -73.99 || lon > -28.84 || lat < -33.75 || lat > 5.27
    )
    if (invalidCoord) {
      errors.push({
        code: 'COORDENADA_FORA_BRASIL',
        label: 'Coord. Fora do Brasil',
        message: `Coordenada [${invalidCoord[0]}, ${invalidCoord[1]}] está fora do território nacional.`,
      })
    }
  }

  // 6. Sobreposição detectada (flag no dado)
  if (props.sobreposicao) {
    warnings.push({
      code: 'SOBREPOSICAO',
      label: 'Sobreposição',
      message: 'Sobreposição detectada com gleba(s) adjacente(s). Verificação manual necessária.',
    })
  }

  // 7. Análise documental pendente (flag no dado)
  if (props.analise_pendente) {
    warnings.push({
      code: 'ANALISE_PENDENTE',
      label: 'Análise Pendente',
      message: 'Aguardando análise documental complementar pelo órgão competente.',
    })
  }

  // ── Determinar status final ───────────────────────────────────────────────
  let status
  if (errors.length > 0) {
    status = 'invalida'
  } else if (warnings.length > 0) {
    status = 'pendente'
  } else {
    status = 'valida'
  }

  return {
    ...feature,
    properties: {
      ...props,
      status,
      errors,
      warnings,
    },
  }
}

/**
 * Valida um FeatureCollection GeoJSON inteiro.
 * @param {object} geojson - GeoJSON FeatureCollection
 * @returns {object} GeoJSON com features validadas
 */
export function validateAll(geojson) {
  if (!geojson?.features) return geojson
  const features = geojson.features.map(validateGleba)
  return { ...geojson, features }
}

/**
 * Gera um resumo estatístico da validação.
 * @param {object[]} features - Array de features validadas
 * @returns {object} Estatísticas de validação
 */
export function getStats(features = []) {
  return {
    total:     features.length,
    validas:   features.filter(f => f.properties.status === 'valida').length,
    invalidas: features.filter(f => f.properties.status === 'invalida').length,
    pendentes: features.filter(f => f.properties.status === 'pendente').length,
    areaTotal: features.reduce((acc, f) => acc + (f.properties.area || 0), 0).toFixed(1),
  }
}
