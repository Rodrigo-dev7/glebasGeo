import ibgeMunicipalities from '../data/ibge-municipios.json'

const MUNICIPALITY_CODE_ALIASES = [
  'codigo_municipio',
  'codigo_municipio_ibge',
  'cod_municipio',
  'codmunicipio',
  'municipio_codigo',
  'municipio_ibge',
  'ibge',
  'ibge_municipio',
  'codigo_ibge',
]

const MUNICIPALITY_NAME_ALIASES = [
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
  'nome_uf',
]

const STATE_CODE_TO_UF = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR',
  '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
}

const STATE_NAME_TO_UF = {
  rondonia: 'RO',
  acre: 'AC',
  amazonas: 'AM',
  roraima: 'RR',
  para: 'PA',
  amapa: 'AP',
  tocantins: 'TO',
  maranhao: 'MA',
  piaui: 'PI',
  ceara: 'CE',
  riograndedonorte: 'RN',
  paraiba: 'PB',
  pernambuco: 'PE',
  alagoas: 'AL',
  sergipe: 'SE',
  bahia: 'BA',
  minasgerais: 'MG',
  espiritosanto: 'ES',
  riodejaneiro: 'RJ',
  saopaulo: 'SP',
  parana: 'PR',
  santacatarina: 'SC',
  riograndedosul: 'RS',
  matogrossodosul: 'MS',
  matogrosso: 'MT',
  goias: 'GO',
  distritofederal: 'DF',
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function normalizeKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '')
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function getPropertyByAliases(properties = {}, aliases = []) {
  const entries = Object.entries(properties).map(([key, value]) => [normalizeKey(key), value])

  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias)
    const found = entries.find(([key]) => key === normalizedAlias)
    if (found && found[1] !== null && found[1] !== undefined && found[1] !== '') {
      return found[1]
    }
  }

  return null
}

function normalizeUf(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const digits = onlyDigits(raw)
  if (digits && STATE_CODE_TO_UF[digits]) {
    return STATE_CODE_TO_UF[digits]
  }

  const upper = raw.toUpperCase()
  if (upper.length === 2) return upper

  return STATE_NAME_TO_UF[normalizeKey(raw)] || null
}

const municipalitiesByFullCode = new Map()
const municipalitiesByCode = new Map()
const municipalitiesByName = new Map()

ibgeMunicipalities.forEach((entry) => {
  municipalitiesByFullCode.set(entry.municipality_full_code, entry)
  municipalitiesByCode.set(entry.municipality_code, entry)

  const normalizedName = normalizeKey(entry.municipality_name)
  if (!municipalitiesByName.has(normalizedName)) {
    municipalitiesByName.set(normalizedName, [])
  }
  municipalitiesByName.get(normalizedName).push(entry)
})

function normalizeEntry(entry) {
  if (!entry) return null

  return {
    municipio: entry.municipality_name,
    uf: STATE_CODE_TO_UF[entry.uf_code] || null,
    ufNome: entry.uf_name,
    codigoMunicipio: entry.municipality_code,
    codigoMunicipioCompleto: entry.municipality_full_code,
  }
}

export function resolveMunicipalityFromProperties(properties = {}) {
  const codeCandidate = getPropertyByAliases(properties, MUNICIPALITY_CODE_ALIASES)
  const nameCandidate = getPropertyByAliases(properties, MUNICIPALITY_NAME_ALIASES)
  const ufCandidate = getPropertyByAliases(properties, UF_ALIASES)
  const normalizedUf = normalizeUf(ufCandidate)

  const codeDigits = onlyDigits(codeCandidate)
  if (codeDigits) {
    const byFullCode = municipalitiesByFullCode.get(codeDigits)
    if (byFullCode) return normalizeEntry(byFullCode)

    const byCode = municipalitiesByCode.get(codeDigits.padStart(5, '0'))
    if (byCode) return normalizeEntry(byCode)
  }

  const normalizedName = normalizeKey(nameCandidate)
  if (normalizedName && municipalitiesByName.has(normalizedName)) {
    const candidates = municipalitiesByName.get(normalizedName)
    const matched = normalizedUf
      ? candidates.find((entry) => (STATE_CODE_TO_UF[entry.uf_code] || null) === normalizedUf)
      : candidates[0]

    if (matched) return normalizeEntry(matched)
  }

  if (nameCandidate || normalizedUf) {
    return {
      municipio: nameCandidate ? String(nameCandidate).trim() : null,
      uf: normalizedUf,
      ufNome: null,
      codigoMunicipio: codeDigits || null,
      codigoMunicipioCompleto: codeDigits?.length === 7 ? codeDigits : null,
    }
  }

  return null
}
