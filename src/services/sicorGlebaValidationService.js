const SICOR_ERRORS = {
  INVALID_AREA: 'SICOR: A gleba informada nao corresponde a uma area valida.',
  NOT_CLOSED: 'SICOR: Gleba deve ser poligono fechado: o primeiro e o ultimo ponto devem ser iguais.',
}

function coordinatesEqual(left, right) {
  if (!left || !right) return false
  return left[0] === right[0] && left[1] === right[1]
}

function polygonSignedArea(points) {
  let area = 0

  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index]
    const [x2, y2] = points[(index + 1) % points.length]
    area += x1 * y2 - x2 * y1
  }

  return area / 2
}

function countOccurrences(points, target) {
  return points.filter((point) => coordinatesEqual(point, target)).length
}

function buildCoordinateStatuses(originalCoordinates, isClosed) {
  const firstPoint = originalCoordinates[0]
  const lastIndex = originalCoordinates.length - 1

  return originalCoordinates.map((coordinate, index) => {
    const issues = []

    if (!isClosed && (index === 0 || index === lastIndex)) {
      issues.push({
        code: 'POLIGONO_NAO_FECHADO',
        message: SICOR_ERRORS.NOT_CLOSED,
      })
    }

    return {
      index: index + 1,
      lat: coordinate[1],
      lon: coordinate[0],
      isValid: issues.length === 0,
      issues,
      isFirst: index === 0,
      isLast: index === lastIndex,
      isRepeatedStart: index !== 0 && coordinatesEqual(coordinate, firstPoint),
    }
  })
}

export function validateSicorPolygon({ originalCoordinates, displayCoordinates }) {
  const errors = []
  const warnings = []
  const uniqueCoordinates = new Set(originalCoordinates.map((point) => point.join('|')))
  const firstPoint = originalCoordinates[0]
  const lastPoint = originalCoordinates[originalCoordinates.length - 1]
  const isClosed = coordinatesEqual(firstPoint, lastPoint)
  const repeatedStartCount = firstPoint ? countOccurrences(originalCoordinates, firstPoint) : 0
  const distinctRing = isClosed ? originalCoordinates.slice(0, -1) : originalCoordinates
  const hasEnoughVertices = distinctRing.length >= 3 && uniqueCoordinates.size >= 3
  const hasArea = hasEnoughVertices && Math.abs(polygonSignedArea(distinctRing)) > 0

  if (!isClosed) {
    errors.push({
      code: 'POLIGONO_NAO_FECHADO',
      label: 'Poligono nao fechado',
      message: SICOR_ERRORS.NOT_CLOSED,
    })
  }

  if (!hasEnoughVertices || !hasArea || repeatedStartCount > 2) {
    errors.push({
      code: 'AREA_INVALIDA',
      label: 'Area invalida',
      message: SICOR_ERRORS.INVALID_AREA,
    })
  }

  return {
    errors,
    warnings,
    status: errors.length ? 'invalida' : 'valida',
    coordinateStatuses: buildCoordinateStatuses(originalCoordinates, isClosed),
    metrics: {
      originalPointCount: originalCoordinates.length,
      uniquePointCount: uniqueCoordinates.size,
      displayPointCount: displayCoordinates.length,
      isClosed,
      repeatedStartCount,
      signedArea: hasEnoughVertices ? polygonSignedArea(distinctRing) : 0,
    },
  }
}
