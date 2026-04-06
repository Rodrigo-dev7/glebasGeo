import { getAdminBoundaryStats, lookupMunicipalityAndState } from './adminBoundaryService'

const EARTH_RADIUS_METERS = 6371008.8

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

export function calculatePolygonAreaHectares(coordinates = []) {
  const squareMeters = sphericalRingArea(coordinates)
  if (!squareMeters) return null

  return Number((squareMeters / 10000).toFixed(2))
}

export async function enrichFeatureProperties({
  feature,
  originalCoordinates,
  existingProperties = {},
}) {
  const boundaryMatch = lookupMunicipalityAndState(originalCoordinates)
  const adminBoundaryStats = getAdminBoundaryStats()
  const computedArea = calculatePolygonAreaHectares(originalCoordinates)
  const normalizedArea =
    typeof existingProperties.area === 'number' && Number.isFinite(existingProperties.area)
      ? existingProperties.area
      : computedArea
  const normalizedMunicipio = existingProperties.municipio || boundaryMatch?.municipio || null
  const normalizedUf = existingProperties.uf || boundaryMatch?.uf || null

  return {
    area: normalizedArea,
    municipio: normalizedMunicipio,
    uf: normalizedUf,
    enrichment: {
      areaSource: normalizedArea === existingProperties.area ? 'input' : 'calculated',
      areaCalculatedHa: computedArea,
      municipalitySource: existingProperties.municipio
        ? 'input'
        : boundaryMatch?.municipio
          ? 'local_boundary'
          : adminBoundaryStats.isConfigured
            ? 'not_found_in_boundary'
            : 'pending_local_boundary',
      ufSource: existingProperties.uf
        ? 'input'
        : boundaryMatch?.uf
          ? 'local_boundary'
          : adminBoundaryStats.isConfigured
            ? 'not_found_in_boundary'
            : 'pending_local_boundary',
      adminBoundaryConfigured: adminBoundaryStats.isConfigured,
      adminBoundaryFeatureCount: adminBoundaryStats.featureCount,
    },
  }
}
