const TOLERANCE = 1e-10

const SICOR_ERRORS = {
  INVALID_AREA: 'SICOR: A gleba informada nao corresponde a uma area valida.',
  INVALID_AREA_EXTRA_REPEATS: 'SICOR: A gleba informada nao corresponde a uma area valida. O primeiro ponto foi repetido mais de duas vezes.',
  INVALID_AREA_MISSING_REPEAT: 'SICOR: A gleba informada nao corresponde a uma area valida. O ultimo ponto deve repetir exatamente o primeiro ponto.',
  SELF_OVERLAP: 'SICOR: A gleba informada possui sobreposicao no perimetro ou vertices coincidentes.',
}

function nearlyEqual(left, right, tolerance = TOLERANCE) {
  return Math.abs(left - right) <= tolerance
}

function coordinatesEqual(left, right, tolerance = TOLERANCE) {
  if (!left || !right) return false
  return nearlyEqual(left[0], right[0], tolerance) && nearlyEqual(left[1], right[1], tolerance)
}

function normalizeCoordinates(coordinates = []) {
  return coordinates.map(([lon, lat]) => [Number(lon), Number(lat)])
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

function normalizeRingWithoutClosure(coordinates = []) {
  if (coordinates.length < 2) return normalizeCoordinates(coordinates)

  const normalized = normalizeCoordinates(coordinates)
  const first = normalized[0]
  const last = normalized[normalized.length - 1]

  return coordinatesEqual(first, last)
    ? normalized.slice(0, -1)
    : normalized
}

function ensureClosedRing(coordinates = []) {
  const normalized = normalizeCoordinates(coordinates)
  if (normalized.length < 2) return normalized

  const first = normalized[0]
  const last = normalized[normalized.length - 1]

  return coordinatesEqual(first, last)
    ? normalized
    : [...normalized, first]
}

function crossProduct(origin, left, right) {
  return (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0])
}

function pointOnSegment(point, start, end, tolerance = TOLERANCE) {
  const cross = crossProduct(start, end, point)
  if (Math.abs(cross) > tolerance) return false

  const minLon = Math.min(start[0], end[0]) - tolerance
  const maxLon = Math.max(start[0], end[0]) + tolerance
  const minLat = Math.min(start[1], end[1]) - tolerance
  const maxLat = Math.max(start[1], end[1]) + tolerance

  return (
    point[0] >= minLon &&
    point[0] <= maxLon &&
    point[1] >= minLat &&
    point[1] <= maxLat
  )
}

function segmentsIntersect(startA, endA, startB, endB) {
  const orientation1 = crossProduct(startA, endA, startB)
  const orientation2 = crossProduct(startA, endA, endB)
  const orientation3 = crossProduct(startB, endB, startA)
  const orientation4 = crossProduct(startB, endB, endA)

  if (
    Math.abs(orientation1) <= TOLERANCE && pointOnSegment(startB, startA, endA)
  ) {
    return true
  }

  if (
    Math.abs(orientation2) <= TOLERANCE && pointOnSegment(endB, startA, endA)
  ) {
    return true
  }

  if (
    Math.abs(orientation3) <= TOLERANCE && pointOnSegment(startA, startB, endB)
  ) {
    return true
  }

  if (
    Math.abs(orientation4) <= TOLERANCE && pointOnSegment(endA, startB, endB)
  ) {
    return true
  }

  return (
    (orientation1 > 0) !== (orientation2 > 0) &&
    (orientation3 > 0) !== (orientation4 > 0)
  )
}

function areAdjacentSegments(leftIndex, rightIndex, segmentCount) {
  return (
    Math.abs(leftIndex - rightIndex) === 1 ||
    (leftIndex === 0 && rightIndex === segmentCount - 1)
  )
}

function collectRepeatedVertexGroups(originalCoordinates = []) {
  const ring = normalizeRingWithoutClosure(originalCoordinates)
  const indexesByCoordinate = new Map()

  ring.forEach((coordinate, index) => {
    const key = coordinate.join('|')
    if (!indexesByCoordinate.has(key)) {
      indexesByCoordinate.set(key, [])
    }

    indexesByCoordinate.get(key).push(index)
  })

  return [...indexesByCoordinate.values()]
    .filter((indexes) => indexes.length > 1)
    .map((indexes) => [...indexes].sort((left, right) => left - right))
}

function detectSelfOverlap(originalCoordinates = [], displayCoordinates = []) {
  const originalLength = originalCoordinates.length
  const closedDisplay = ensureClosedRing(displayCoordinates)
  const segments = []

  for (let index = 0; index < closedDisplay.length - 1; index += 1) {
    segments.push({
      index,
      start: closedDisplay[index],
      end: closedDisplay[index + 1],
    })
  }

  const overlapSegmentIndexes = new Set()
  const overlapVertexIndexes = new Set()
  const overlapPairs = []

  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
      if (areAdjacentSegments(leftIndex, rightIndex, segments.length)) {
        continue
      }

      const leftSegment = segments[leftIndex]
      const rightSegment = segments[rightIndex]

      if (!segmentsIntersect(leftSegment.start, leftSegment.end, rightSegment.start, rightSegment.end)) {
        continue
      }

      overlapSegmentIndexes.add(leftIndex)
      overlapSegmentIndexes.add(rightIndex)
      overlapPairs.push({
        leftSegmentIndex: leftIndex,
        rightSegmentIndex: rightIndex,
      })

      ;[leftSegment.index, leftSegment.index + 1, rightSegment.index, rightSegment.index + 1]
        .map((index) => {
          if (!originalLength) return null
          if (index < originalLength) return index
          return 0
        })
        .filter((index) => index !== null)
        .forEach((index) => overlapVertexIndexes.add(index))
    }
  }

  const overlapSegments = [...overlapSegmentIndexes]
    .sort((left, right) => left - right)
    .map((segmentIndex) => {
      const segment = segments[segmentIndex]
      return [segment.start, segment.end]
    })

  return {
    overlapSegments,
    overlapVertexIndexes: [...overlapVertexIndexes].sort((left, right) => left - right),
    overlapPairs,
  }
}

function buildCoordinateStatuses(originalCoordinates, validationIssues = []) {
  const firstPoint = originalCoordinates[0]
  const lastIndex = originalCoordinates.length - 1
  const issuesByIndex = new Map()

  validationIssues.forEach((issue) => {
    issue.indexes.forEach((index) => {
      if (!issuesByIndex.has(index)) {
        issuesByIndex.set(index, [])
      }

      issuesByIndex.get(index).push({
        code: issue.code,
        message: issue.message,
      })
    })
  })

  return originalCoordinates.map((coordinate, index) => {
    const issues = issuesByIndex.get(index) || []

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

function resolveValidationCause({ firstPoint, repeatedStartCount, isClosed }) {
  if (!firstPoint) return null

  if (repeatedStartCount > 2) {
    return {
      code: 'AREA_INVALIDA_REPETICAO_EXCEDENTE',
      label: 'Area invalida',
      message: SICOR_ERRORS.INVALID_AREA_EXTRA_REPEATS,
      indexes: null,
    }
  }

  if (!isClosed) {
    return {
      code: 'AREA_INVALIDA_SEM_REPETICAO_FINAL',
      label: 'Area invalida',
      message: SICOR_ERRORS.INVALID_AREA_MISSING_REPEAT,
      indexes: null,
    }
  }

  return null
}

export function validateSicorPolygon({ originalCoordinates, displayCoordinates }) {
  const normalizedOriginalCoordinates = normalizeCoordinates(originalCoordinates)
  const normalizedDisplayCoordinates = ensureClosedRing(displayCoordinates)
  const errors = []
  const warnings = []
  const uniqueCoordinates = new Set(normalizedOriginalCoordinates.map((point) => point.join('|')))
  const firstPoint = normalizedOriginalCoordinates[0]
  const lastPoint = normalizedOriginalCoordinates[normalizedOriginalCoordinates.length - 1]
  const isClosed = coordinatesEqual(firstPoint, lastPoint)
  const repeatedStartCount = firstPoint ? countOccurrences(normalizedOriginalCoordinates, firstPoint) : 0
  const distinctRing = normalizeRingWithoutClosure(normalizedDisplayCoordinates)
  const validationIssues = []

  const validationCause = resolveValidationCause({
    firstPoint,
    repeatedStartCount,
    isClosed,
  })

  if (validationCause) {
    const repeatedIndexes = validationCause.code === 'AREA_INVALIDA_REPETICAO_EXCEDENTE'
      ? normalizedOriginalCoordinates
        .map((coordinate, index) => (coordinatesEqual(coordinate, firstPoint) ? index : null))
        .filter((index) => index !== null)
      : [0, Math.max(0, normalizedOriginalCoordinates.length - 1)]

    errors.push({
      code: validationCause.code,
      label: validationCause.label,
      message: validationCause.message,
    })

    validationIssues.push({
      code: validationCause.code,
      message: validationCause.message,
      indexes: repeatedIndexes,
    })
  }

  const repeatedVertexGroups = collectRepeatedVertexGroups(normalizedOriginalCoordinates)
  const repeatedVertexIndexes = repeatedVertexGroups.flat()
  const selfOverlap = detectSelfOverlap(normalizedOriginalCoordinates, normalizedDisplayCoordinates)
  const selfOverlapIndexes = [...new Set([
    ...repeatedVertexIndexes,
    ...selfOverlap.overlapVertexIndexes,
  ])].sort((left, right) => left - right)

  if (selfOverlapIndexes.length || selfOverlap.overlapSegments.length) {
    errors.push({
      code: 'GEOMETRIA_SOBREPOSTA',
      label: 'Sobreposicao na gleba',
      message: SICOR_ERRORS.SELF_OVERLAP,
    })

    validationIssues.push({
      code: 'GEOMETRIA_SOBREPOSTA',
      message: SICOR_ERRORS.SELF_OVERLAP,
      indexes: selfOverlapIndexes,
    })
  }

  return {
    errors,
    warnings,
    status: errors.length ? 'invalida' : 'valida',
    coordinateStatuses: buildCoordinateStatuses(normalizedOriginalCoordinates, validationIssues),
    metrics: {
      originalPointCount: normalizedOriginalCoordinates.length,
      uniquePointCount: uniqueCoordinates.size,
      displayPointCount: normalizedDisplayCoordinates.length,
      isClosed,
      repeatedStartCount,
      signedArea: distinctRing.length >= 3 ? polygonSignedArea(distinctRing) : 0,
      validationCause: validationCause?.code || null,
      repeatedVertexGroups,
      repeatedVertexIndexes,
      selfOverlapVertexIndexes: selfOverlapIndexes,
      selfOverlapSegments: selfOverlap.overlapSegments,
      selfOverlapPairs: selfOverlap.overlapPairs,
      selfOverlapSegmentCount: selfOverlap.overlapSegments.length,
    },
  }
}
