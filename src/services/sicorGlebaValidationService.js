const TOLERANCE = 1e-10
const EARTH_RADIUS_METERS = 6371008.8
const NEAR_VERTEX_TOLERANCE_METERS = 3
const NEAR_VERTEX_MIN_SEQUENCE_GAP = 10
const LOCAL_VERTEX_COLLAPSE_TOLERANCE_METERS = 3
const LOCAL_VERTEX_COLLAPSE_SPAN_METERS = 6

const SICOR_ERRORS = {
  INVALID_AREA: 'SICOR: A gleba informada nao corresponde a uma area valida.',
  INVALID_AREA_EXTRA_REPEATS: 'SICOR: A gleba informada nao corresponde a uma area valida. O primeiro ponto foi repetido mais de duas vezes.',
  INVALID_AREA_MISSING_REPEAT: 'SICOR: A gleba informada nao corresponde a uma area valida. O ultimo ponto deve repetir exatamente o primeiro ponto.',
  SELF_OVERLAP: 'SICOR: A gleba informada possui sobreposicao no perimetro ou vertices coincidentes.',
}

const SICOR_WARNINGS = {
  NEAR_VERTICES: `SICOR: Existem vertices quase coincidentes em trechos diferentes do perimetro. Verifique possivel sobreposicao, estrangulamento ou retorno da linha sobre a propria gleba.`,
  LOCAL_VERTEX_COLLAPSE: `SICOR: Existem vertices consecutivos praticamente sobrepostos. Verifique possivel ponto duplicado ou micro-retorno no perimetro.`,
}

function nearlyEqual(left, right, tolerance = TOLERANCE) {
  return Math.abs(left - right) <= tolerance
}

function coordinatesEqual(left, right, tolerance = TOLERANCE) {
  if (!left || !right) return false
  return nearlyEqual(left[0], right[0], tolerance) && nearlyEqual(left[1], right[1], tolerance)
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180
}

function haversineDistanceMeters(left, right) {
  const [leftLon, leftLat] = left
  const [rightLon, rightLat] = right

  if (
    !Number.isFinite(leftLon) ||
    !Number.isFinite(leftLat) ||
    !Number.isFinite(rightLon) ||
    !Number.isFinite(rightLat)
  ) {
    return Infinity
  }

  const deltaLat = toRadians(rightLat - leftLat)
  const deltaLon = toRadians(rightLon - leftLon)
  const leftLatRad = toRadians(leftLat)
  const rightLatRad = toRadians(rightLat)
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(leftLatRad) * Math.cos(rightLatRad) * Math.sin(deltaLon / 2) ** 2

  return 2 * EARTH_RADIUS_METERS * Math.atan2(
    Math.sqrt(haversine),
    Math.sqrt(Math.max(0, 1 - haversine))
  )
}

function formatDistanceMeters(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) return null

  return `${distanceMeters.toFixed(distanceMeters < 10 ? 2 : 1)} m`
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

function collectNearVertexGroups(
  originalCoordinates = [],
  toleranceMeters = NEAR_VERTEX_TOLERANCE_METERS
) {
  const normalized = normalizeCoordinates(originalCoordinates)
  const isClosed = normalized.length > 1 &&
    coordinatesEqual(normalized[0], normalized[normalized.length - 1])
  const analysisCoordinates = isClosed ? normalized.slice(0, -1) : normalized
  const parents = analysisCoordinates.map((_, index) => index)
  const ranks = analysisCoordinates.map(() => 0)
  const pairIndexes = new Set()
  const nearPairs = []

  const getSequenceGap = (leftIndex, rightIndex) => {
    const gap = Math.abs(rightIndex - leftIndex)

    return isClosed
      ? Math.min(gap, analysisCoordinates.length - gap)
      : gap
  }

  const find = (index) => {
    if (parents[index] !== index) {
      parents[index] = find(parents[index])
    }

    return parents[index]
  }

  const union = (leftIndex, rightIndex) => {
    const leftRoot = find(leftIndex)
    const rightRoot = find(rightIndex)

    if (leftRoot === rightRoot) return

    if (ranks[leftRoot] < ranks[rightRoot]) {
      parents[leftRoot] = rightRoot
      return
    }

    if (ranks[leftRoot] > ranks[rightRoot]) {
      parents[rightRoot] = leftRoot
      return
    }

    parents[rightRoot] = leftRoot
    ranks[leftRoot] += 1
  }

  for (let leftIndex = 0; leftIndex < analysisCoordinates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < analysisCoordinates.length; rightIndex += 1) {
      if (getSequenceGap(leftIndex, rightIndex) <= NEAR_VERTEX_MIN_SEQUENCE_GAP) {
        continue
      }

      const distanceMeters = haversineDistanceMeters(
        analysisCoordinates[leftIndex],
        analysisCoordinates[rightIndex]
      )

      if (distanceMeters > toleranceMeters) {
        continue
      }

      pairIndexes.add(leftIndex)
      pairIndexes.add(rightIndex)
      union(leftIndex, rightIndex)
      nearPairs.push({
        leftIndex,
        rightIndex,
        distanceMeters: Number(distanceMeters.toFixed(3)),
      })
    }
  }

  const groupsByRoot = new Map()

  pairIndexes.forEach((index) => {
    const root = find(index)
    if (!groupsByRoot.has(root)) {
      groupsByRoot.set(root, [])
    }

    groupsByRoot.get(root).push(index)
  })

  const groups = [...groupsByRoot.values()]
    .map((indexes) => indexes.sort((left, right) => left - right))
    .sort((left, right) => left[0] - right[0])

  return {
    groups,
    indexes: [...pairIndexes].sort((left, right) => left - right),
    pairs: nearPairs.sort((left, right) => left.leftIndex - right.leftIndex || left.rightIndex - right.rightIndex),
  }
}

function collectLocalVertexCollapseGroups(
  originalCoordinates = [],
  toleranceMeters = LOCAL_VERTEX_COLLAPSE_TOLERANCE_METERS,
  spanMeters = LOCAL_VERTEX_COLLAPSE_SPAN_METERS
) {
  const normalized = normalizeCoordinates(originalCoordinates)
  const isClosed = normalized.length > 1 &&
    coordinatesEqual(normalized[0], normalized[normalized.length - 1])
  const analysisCoordinates = isClosed ? normalized.slice(0, -1) : normalized
  const indexes = new Set()
  const pairs = []
  const groups = []

  for (let index = 1; index < analysisCoordinates.length - 1; index += 1) {
    const previousIndex = index - 1
    const nextIndex = index + 1
    const previousDistance = haversineDistanceMeters(
      analysisCoordinates[previousIndex],
      analysisCoordinates[index]
    )
    const nextDistance = haversineDistanceMeters(
      analysisCoordinates[index],
      analysisCoordinates[nextIndex]
    )
    const spanDistance = haversineDistanceMeters(
      analysisCoordinates[previousIndex],
      analysisCoordinates[nextIndex]
    )

    if (
      previousDistance > toleranceMeters ||
      nextDistance > toleranceMeters ||
      spanDistance > spanMeters
    ) {
      continue
    }

    indexes.add(previousIndex)
    indexes.add(index)
    indexes.add(nextIndex)
    groups.push([previousIndex, index, nextIndex])
    pairs.push(
      {
        leftIndex: previousIndex,
        rightIndex: index,
        distanceMeters: Number(previousDistance.toFixed(3)),
      },
      {
        leftIndex: index,
        rightIndex: nextIndex,
        distanceMeters: Number(nextDistance.toFixed(3)),
      }
    )
  }

  return {
    groups,
    indexes: [...indexes].sort((left, right) => left - right),
    pairs: pairs.sort((left, right) => left.leftIndex - right.leftIndex || left.rightIndex - right.rightIndex),
  }
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
    ;(issue.indexes || []).forEach((index) => {
      if (!issuesByIndex.has(index)) {
        issuesByIndex.set(index, [])
      }

      const relatedPairs = (issue.pairs || []).filter((pair) => (
        pair.leftIndex === index || pair.rightIndex === index
      ))
      const nearestDistanceMeters = relatedPairs.length
        ? Math.min(...relatedPairs.map((pair) => pair.distanceMeters))
        : null
      const distanceLabel = formatDistanceMeters(nearestDistanceMeters)

      issuesByIndex.get(index).push({
        code: issue.code,
        message: distanceLabel
          ? `${issue.message} Menor distancia encontrada: ${distanceLabel}.`
          : issue.message,
        severity: issue.severity || 'error',
        nearestDistanceMeters,
      })
    })
  })

  return originalCoordinates.map((coordinate, index) => {
    const issues = issuesByIndex.get(index) || []

    return {
      index: index + 1,
      lat: coordinate[1],
      lon: coordinate[0],
      isValid: !issues.some((issue) => issue.severity !== 'warning'),
      hasWarning: issues.some((issue) => issue.severity === 'warning'),
      hasError: issues.some((issue) => issue.severity !== 'warning'),
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

  const nearVertexAnalysis = collectNearVertexGroups(normalizedOriginalCoordinates)

  if (nearVertexAnalysis.indexes.length) {
    warnings.push({
      code: 'VERTICES_PROXIMOS',
      label: 'Vertices proximos',
      message: SICOR_WARNINGS.NEAR_VERTICES,
    })

    validationIssues.push({
      code: 'VERTICES_PROXIMOS',
      message: SICOR_WARNINGS.NEAR_VERTICES,
      severity: 'warning',
      indexes: nearVertexAnalysis.indexes,
      pairs: nearVertexAnalysis.pairs,
    })
  }

  const localVertexCollapseAnalysis = collectLocalVertexCollapseGroups(normalizedOriginalCoordinates)

  if (localVertexCollapseAnalysis.indexes.length) {
    warnings.push({
      code: 'VERTICES_COLAPSADOS',
      label: 'Vertices consecutivos sobrepostos',
      message: SICOR_WARNINGS.LOCAL_VERTEX_COLLAPSE,
    })

    validationIssues.push({
      code: 'VERTICES_COLAPSADOS',
      message: SICOR_WARNINGS.LOCAL_VERTEX_COLLAPSE,
      severity: 'warning',
      indexes: localVertexCollapseAnalysis.indexes,
      pairs: localVertexCollapseAnalysis.pairs,
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
      nearVertexToleranceMeters: NEAR_VERTEX_TOLERANCE_METERS,
      nearVertexMinSequenceGap: NEAR_VERTEX_MIN_SEQUENCE_GAP,
      nearVertexGroups: nearVertexAnalysis.groups,
      nearVertexIndexes: nearVertexAnalysis.indexes,
      nearVertexPairs: nearVertexAnalysis.pairs,
      localVertexCollapseToleranceMeters: LOCAL_VERTEX_COLLAPSE_TOLERANCE_METERS,
      localVertexCollapseSpanMeters: LOCAL_VERTEX_COLLAPSE_SPAN_METERS,
      localVertexCollapseGroups: localVertexCollapseAnalysis.groups,
      localVertexCollapseIndexes: localVertexCollapseAnalysis.indexes,
      localVertexCollapsePairs: localVertexCollapseAnalysis.pairs,
      selfOverlapVertexIndexes: selfOverlapIndexes,
      selfOverlapSegments: selfOverlap.overlapSegments,
      selfOverlapPairs: selfOverlap.overlapPairs,
      selfOverlapSegmentCount: selfOverlap.overlapSegments.length,
    },
  }
}
