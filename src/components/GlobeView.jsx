import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const EARTH_RADIUS = 2.1
const LAYER_RADIUS = 2.118
const GLEBA_RADIUS = 2.13
const BRAZIL_TARGET = {
  lon: -51.9253,
  lat: -14.235,
}
const INTRO_DURATION_MS = 7600
const EARTH_TEXTURE_URL = 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'

const STATUS_COLORS = {
  valida: '#22c55e',
  invalida: '#ef4444',
  pendente: '#f59e0b',
}

const GLOBE_THEMES = {
  satellite: {
    sceneBackground: '#020712',
    atmosphere: '#58c8ff',
    atmosphereOpacity: 0.09,
    ambient: '#7ebfff',
    ambientIntensity: 0.55,
    sun: '#ffffff',
    sunIntensity: 2.6,
    stars: '#d7efff',
    starOpacity: 0.72,
    hudLabel: 'Satelite global',
  },
  map: {
    sceneBackground: '#050708',
    atmosphere: '#59615e',
    atmosphereOpacity: 0.06,
    ambient: '#747976',
    ambientIntensity: 0.34,
    sun: '#d8dedb',
    sunIntensity: 1.72,
    stars: '#9aa49f',
    starOpacity: 0.38,
    hudLabel: 'Mapa global',
  },
}

function normalizeGlobeVariant(variant) {
  return variant === 'map' || variant === 'dark' ? 'map' : 'satellite'
}

function lonLatToVector3(lon, lat, radius = EARTH_RADIUS) {
  const phi = (90 - Number(lat)) * (Math.PI / 180)
  const theta = (Number(lon) + 180) * (Math.PI / 180)

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - ((-2 * progress + 2) ** 3) / 2
}

function easeOutCubic(progress) {
  return 1 - ((1 - progress) ** 3)
}

function cameraVectorFromLonLat(lon, lat, distance) {
  return lonLatToVector3(lon, lat, 1).normalize().multiplyScalar(distance)
}

function buildIntroCameraCurve() {
  return new THREE.CatmullRomCurve3(
    [
      cameraVectorFromLonLat(-12, 24, 10.2),
      cameraVectorFromLonLat(-30, 10, 7.2),
      cameraVectorFromLonLat(-43, -4, 5.35),
      cameraVectorFromLonLat(BRAZIL_TARGET.lon, BRAZIL_TARGET.lat, 4.15),
    ],
    false,
    'centripetal',
    0.32
  )
}

function getGeometryRings(geometry) {
  if (!geometry) return []

  if (geometry.type === 'Polygon') {
    return geometry.coordinates || []
  }

  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates || []).flatMap((polygon) => polygon || [])
  }

  return []
}

function normalizeRing(ring = []) {
  return ring
    .map(([lon, lat]) => [Number(lon), Number(lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
}

function collectGeometryCoordinates(geometry) {
  return getGeometryRings(geometry).flatMap(normalizeRing)
}

function collectFeatureCoordinates(features = []) {
  return features.flatMap((feature) => collectGeometryCoordinates(feature.geometry))
}

function normalizeLongitudeDelta(delta) {
  const absoluteDelta = Math.abs(delta)
  return absoluteDelta > 180 ? 360 - absoluteDelta : absoluteDelta
}

function buildCameraTargetFromCoordinates(coordinates = []) {
  const normalized = coordinates
    .map(([lon, lat]) => [Number(lon), Number(lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))

  if (!normalized.length) return null

  const vectorSum = normalized.reduce(
    (sum, [lon, lat]) => sum.add(lonLatToVector3(lon, lat, 1)),
    new THREE.Vector3()
  )
  const direction = vectorSum.lengthSq() > 0
    ? vectorSum.normalize()
    : lonLatToVector3(normalized[0][0], normalized[0][1], 1).normalize()
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity

  normalized.forEach(([lon, lat]) => {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  })

  const latSpan = maxLat - minLat
  const lonSpan = normalizeLongitudeDelta(maxLon - minLon)
  const span = Math.max(latSpan, lonSpan)
  const distance = Math.min(5.8, Math.max(2.85, 2.95 + span / 22))

  return {
    direction,
    distance,
  }
}

function resolveViewportTarget({ viewportRequest, glebas, carGeojson }) {
  if (!viewportRequest) return null

  if (viewportRequest.type === 'home') {
    return {
      direction: lonLatToVector3(-51.9253, -14.235, 1).normalize(),
      distance: 5.8,
    }
  }

  if (viewportRequest.point) {
    return {
      direction: lonLatToVector3(viewportRequest.point.lon, viewportRequest.point.lat, 1).normalize(),
      distance: 3,
    }
  }

  if (viewportRequest.type === 'dataset') {
    return buildCameraTargetFromCoordinates(collectFeatureCoordinates(glebas?.features || []))
  }

  if (viewportRequest.type === 'feature' && viewportRequest.featureId) {
    const feature = (glebas?.features || []).find(
      (candidate) => candidate.properties?.id === viewportRequest.featureId
    )

    return buildCameraTargetFromCoordinates(collectGeometryCoordinates(feature?.geometry))
  }

  if (viewportRequest.type === 'feature-set' && viewportRequest.featureIds?.length) {
    const featureIds = new Set(viewportRequest.featureIds)
    const features = (glebas?.features || []).filter((feature) =>
      featureIds.has(feature.properties?.id)
    )

    return buildCameraTargetFromCoordinates(collectFeatureCoordinates(features))
  }

  if (viewportRequest.type === 'car-feature' && viewportRequest.featureId) {
    const feature = (carGeojson?.features || []).find((candidate) => (
      candidate.properties?.id === viewportRequest.featureId &&
      (!viewportRequest.datasetKey || candidate.properties?.__carDatasetId === viewportRequest.datasetKey)
    ))

    return buildCameraTargetFromCoordinates(collectGeometryCoordinates(feature?.geometry))
  }

  if (viewportRequest.type === 'car-reference' && viewportRequest.datasetKey) {
    const features = (carGeojson?.features || []).filter((feature) =>
      feature.properties?.__carDatasetId === viewportRequest.datasetKey
    )

    return buildCameraTargetFromCoordinates(collectFeatureCoordinates(features))
  }

  return null
}

function disposeObjectTree(root) {
  root?.traverse?.((object) => {
    object.geometry?.dispose?.()
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material.dispose?.())
    } else {
      object.material?.dispose?.()
    }
  })
}

function createTubeFromRing(ring, color, options = {}) {
  const coordinates = normalizeRing(ring)
  if (coordinates.length < 2) return null

  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]
  const closedCoordinates =
    first[0] === last[0] && first[1] === last[1]
      ? coordinates
      : [...coordinates, first]
  const points = closedCoordinates.map(([lon, lat]) =>
    lonLatToVector3(lon, lat, options.radius || LAYER_RADIUS)
  )
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.1)
  const geometry = new THREE.TubeGeometry(
    curve,
    Math.max(24, points.length * 6),
    options.width || 0.006,
    6,
    false
  )
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: options.opacity ?? 0.9,
    depthTest: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = options.renderOrder || 3

  return mesh
}

function createLayerGroup({ glebas, carGeojson, visibleFeatureIds, selectedId, selectedCarLayerKeys }) {
  const group = new THREE.Group()
  const visibleSet = new Set(visibleFeatureIds || [])
  const selectedCarSet = new Set(selectedCarLayerKeys || [])

  ;(carGeojson?.features || []).forEach((feature) => {
    const properties = feature.properties || {}
    const isSelected = selectedCarSet.has(properties.__carLayerKey)
    const color = isSelected ? '#f8fafc' : '#38bdf8'
    const opacity = isSelected ? 0.96 : 0.72

    getGeometryRings(feature.geometry).forEach((ring) => {
      const tube = createTubeFromRing(ring, color, {
        radius: LAYER_RADIUS,
        width: isSelected ? 0.009 : 0.006,
        opacity,
        renderOrder: isSelected ? 7 : 4,
      })

      if (tube) group.add(tube)
    })
  })

  ;(glebas?.features || []).forEach((feature) => {
    const properties = feature.properties || {}
    if (visibleSet.size && !visibleSet.has(properties.id)) return

    const isSelected = properties.id === selectedId
    const carStatus = properties.carOverlapValidation?.status
    const color =
      carStatus === 'inside'
        ? '#facc15'
        : carStatus === 'partial'
          ? '#fb923c'
          : STATUS_COLORS[properties.status] || STATUS_COLORS.pendente

    getGeometryRings(feature.geometry).forEach((ring) => {
      const tube = createTubeFromRing(ring, color, {
        radius: GLEBA_RADIUS,
        width: isSelected ? 0.011 : 0.007,
        opacity: isSelected ? 1 : 0.92,
        renderOrder: isSelected ? 8 : 6,
      })

      if (tube) group.add(tube)
    })
  })

  return group
}

function mapPoint(lon, lat, width, height) {
  return [
    ((lon + 180) / 360) * width,
    ((90 - lat) / 180) * height,
  ]
}

function drawLand(ctx, width, height, coordinates) {
  ctx.beginPath()
  coordinates.forEach(([lon, lat], index) => {
    const [x, y] = mapPoint(lon, lat, width, height)
    if (index === 0) {
      ctx.moveTo(x, y)
      return
    }
    ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fill()
}

function createEarthTexture(variant = 'satellite') {
  const isCyberMap = normalizeGlobeVariant(variant) === 'map'
  const width = 2048
  const height = 1024
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const ocean = ctx.createLinearGradient(0, 0, 0, height)
  if (isCyberMap) {
    ocean.addColorStop(0, '#30302d')
    ocean.addColorStop(0.42, '#272826')
    ocean.addColorStop(0.62, '#20211f')
    ocean.addColorStop(1, '#151716')
  } else {
    ocean.addColorStop(0, '#123b68')
    ocean.addColorStop(0.42, '#0f5d7d')
    ocean.addColorStop(0.58, '#0b496d')
    ocean.addColorStop(1, '#081c3b')
  }
  ctx.fillStyle = ocean
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = isCyberMap ? 'rgba(8, 9, 9, 0.76)' : 'rgba(255,255,255,0.32)'
  drawLand(ctx, width, height, [[-180,-62],[-120,-64],[-60,-66],[0,-65],[60,-66],[120,-64],[180,-62],[180,-90],[-180,-90]])

  ctx.fillStyle = isCyberMap ? '#060807' : '#527e4c'
  drawLand(ctx, width, height, [[-168,72],[-130,72],[-100,58],[-82,52],[-58,46],[-74,26],[-104,18],[-124,28],[-148,46]])
  drawLand(ctx, width, height, [[-82,12],[-58,8],[-42,-16],[-52,-36],[-66,-56],[-76,-40],[-82,-12]])
  drawLand(ctx, width, height, [[-20,34],[8,38],[34,30],[50,12],[42,-30],[22,-35],[8,-2],[-8,8]])
  drawLand(ctx, width, height, [[-10,72],[34,70],[68,58],[102,62],[146,48],[164,22],[116,6],[86,20],[58,6],[32,28],[8,36],[-8,48]])
  drawLand(ctx, width, height, [[112,-10],[154,-12],[154,-38],[126,-44],[112,-28]])
  drawLand(ctx, width, height, [[-52,78],[-24,76],[-32,60],[-52,58],[-62,68]])

  ctx.fillStyle = isCyberMap ? 'rgba(16, 19, 18, 0.86)' : 'rgba(198, 168, 100, 0.5)'
  drawLand(ctx, width, height, [[-18,30],[30,30],[42,18],[28,8],[4,12],[-12,20]])
  drawLand(ctx, width, height, [[42,46],[80,44],[104,32],[72,22],[46,28]])
  drawLand(ctx, width, height, [[114,-18],[146,-20],[148,-34],[126,-38],[116,-30]])

  ctx.fillStyle = isCyberMap ? 'rgba(14, 16, 15, 0.78)' : 'rgba(255,255,255,0.55)'
  drawLand(ctx, width, height, [[-180,88],[-90,86],[0,88],[90,86],[180,88],[180,74],[-180,74]])

  ctx.strokeStyle = isCyberMap ? 'rgba(128, 145, 138, 0.1)' : 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  for (let lon = -180; lon <= 180; lon += 30) {
    const [x] = mapPoint(lon, 0, width, height)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, y] = mapPoint(0, lat, width, height)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  if (isCyberMap) {
    const scan = ctx.createLinearGradient(0, 0, width, 0)
    scan.addColorStop(0, 'rgba(110, 130, 120, 0)')
    scan.addColorStop(0.5, 'rgba(110, 130, 120, 0.045)')
    scan.addColorStop(1, 'rgba(110, 130, 120, 0)')
    ctx.fillStyle = scan
    for (let y = 0; y < height; y += 18) {
      ctx.fillRect(0, y, width, 1)
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8

  return texture
}

function createMonochromeEarthTexture(image) {
  const width = image?.naturalWidth || image?.width || 2048
  const height = image?.naturalHeight || image?.height || 1024
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  ctx.drawImage(image, 0, 0, width, height)

  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData

  for (let index = 0; index < data.length; index += 4) {
    const gray = (data[index] * 0.2126) + (data[index + 1] * 0.7152) + (data[index + 2] * 0.0722)
    const value = Math.max(8, Math.min(210, (gray * 0.72) + 7))
    data[index] = value
    data[index + 1] = value
    data[index + 2] = value
  }

  ctx.putImageData(imageData, 0, 0)

  const vignette = ctx.createRadialGradient(
    width * 0.48,
    height * 0.46,
    width * 0.08,
    width * 0.5,
    height * 0.5,
    width * 0.72
  )
  vignette.addColorStop(0, 'rgba(255,255,255,0.06)')
  vignette.addColorStop(0.46, 'rgba(255,255,255,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.42)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8

  return texture
}

function createStars(variant = 'satellite') {
  const theme = GLOBE_THEMES[normalizeGlobeVariant(variant)]
  const geometry = new THREE.BufferGeometry()
  const positions = []

  for (let index = 0; index < 700; index += 1) {
    const radius = 18 + Math.random() * 30
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    )
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: theme.stars,
      size: 0.018,
      transparent: true,
      opacity: theme.starOpacity,
      depthWrite: false,
    })
  )
}

function createLineFromLonLatPoints(coordinates, color, options = {}) {
  const points = coordinates.map(([lon, lat]) =>
    lonLatToVector3(lon, lat, options.radius || EARTH_RADIUS * 1.012)
  )

  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: options.opacity ?? 0.28,
    depthWrite: false,
    depthTest: options.depthTest ?? true,
  })
  const line = new THREE.Line(geometry, material)
  line.renderOrder = options.renderOrder || 2

  return line
}

function createCyberGrid() {
  const group = new THREE.Group()

  for (let lat = -60; lat <= 60; lat += 20) {
    const coordinates = []
    for (let lon = -180; lon <= 180; lon += 4) {
      coordinates.push([lon, lat])
    }
    group.add(createLineFromLonLatPoints(coordinates, '#7f8c86', { opacity: lat === 0 ? 0.13 : 0.07 }))
  }

  for (let lon = -180; lon < 180; lon += 20) {
    const coordinates = []
    for (let lat = -82; lat <= 82; lat += 4) {
      coordinates.push([lon, lat])
    }
    group.add(createLineFromLonLatPoints(coordinates, '#7f8c86', { opacity: 0.055 }))
  }

  return group
}

function createCyberArc(from, to, color, options = {}) {
  const start = lonLatToVector3(from.lon, from.lat, EARTH_RADIUS * 1.026)
  const end = lonLatToVector3(to.lon, to.lat, EARTH_RADIUS * 1.026)
  const control = start.clone()
    .add(end)
    .multiplyScalar(0.5)
    .normalize()
    .multiplyScalar(EARTH_RADIUS + (options.height || 0.72))
  const curve = new THREE.QuadraticBezierCurve3(start, control, end)
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(72))
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: options.opacity ?? 0.68,
    depthWrite: false,
    depthTest: false,
  })
  const arc = new THREE.Line(geometry, material)
  arc.renderOrder = options.renderOrder || 10

  return arc
}

function createCyberArcCurve(from, to, height = 0.72) {
  const start = lonLatToVector3(from.lon, from.lat, EARTH_RADIUS * 1.03)
  const end = lonLatToVector3(to.lon, to.lat, EARTH_RADIUS * 1.03)
  const control = start.clone()
    .add(end)
    .multiplyScalar(0.5)
    .normalize()
    .multiplyScalar(EARTH_RADIUS + height)

  return new THREE.QuadraticBezierCurve3(start, control, end)
}

function createCyberPulse(lon, lat, color, size = 0.026) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(size, 16, 12),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      depthTest: false,
    })
  )
  marker.position.copy(lonLatToVector3(lon, lat, EARTH_RADIUS * 1.048))
  marker.renderOrder = 12

  return marker
}

function createCyberPulseRing(lon, lat, color, options = {}) {
  const direction = lonLatToVector3(lon, lat, 1).normalize()
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(options.innerRadius || 0.026, options.outerRadius || 0.048, 44),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: options.opacity ?? 0.38,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    })
  )

  ring.position.copy(direction.clone().multiplyScalar(EARTH_RADIUS * 1.058))
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
  ring.renderOrder = options.renderOrder || 13

  return ring
}

function createCyberRouteFlow(from, to, color, options = {}) {
  const group = new THREE.Group()
  const curve = createCyberArcCurve(from, to, options.height || 0.72)
  const points = curve.getPoints(96)
  const routeMaterial = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: options.opacity ?? 0.24,
    depthWrite: false,
    depthTest: false,
  })
  const route = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    routeMaterial
  )
  route.renderOrder = 9
  group.add(route)

  const particleMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    depthTest: false,
  })
  const particle = new THREE.Mesh(
    new THREE.SphereGeometry(options.particleSize || 0.018, 16, 12),
    particleMaterial
  )
  particle.renderOrder = 14
  group.add(particle)

  const haloMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    depthTest: false,
  })
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry((options.particleSize || 0.018) * 2.4, 16, 12),
    haloMaterial
  )
  halo.renderOrder = 13
  group.add(halo)

  const speed = options.speed || 0.09
  const offset = options.offset || 0

  group.userData.animate = (elapsed) => {
    const progress = (elapsed * speed + offset) % 1
    const point = curve.getPoint(progress)
    const pulse = Math.sin(progress * Math.PI)

    particle.position.copy(point)
    halo.position.copy(point)
    particleMaterial.opacity = 0.24 + pulse * 0.68
    haloMaterial.opacity = 0.05 + pulse * 0.2
    halo.scale.setScalar(0.75 + pulse * 0.85)
    routeMaterial.opacity = (options.opacity ?? 0.24) + Math.sin(elapsed * 1.4 + offset * 12) * 0.045
  }

  return group
}

function createCyberDust() {
  const geometry = new THREE.BufferGeometry()
  const positions = []

  for (let index = 0; index < 180; index += 1) {
    const radius = 3.1 + Math.random() * 2.2
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)

    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    )
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: '#6fb98c',
      size: 0.014,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    })
  )
}

function createCyberOverlay() {
  const group = new THREE.Group()
  const brazil = { lon: BRAZIL_TARGET.lon, lat: BRAZIL_TARGET.lat }
  const arcTargets = [
    { lon: -74.006, lat: 40.7128, color: '#3fa36a', height: 0.76 },
    { lon: -3.7038, lat: 40.4168, color: '#528f6a', height: 0.64 },
    { lon: 13.405, lat: 52.52, color: '#668475', height: 0.7 },
    { lon: -99.1332, lat: 19.4326, color: '#73827c', height: 0.54 },
    { lon: -70.6693, lat: -33.4489, color: '#4f8c70', height: 0.38 },
  ]

  group.add(createCyberGrid())
  const dust = createCyberDust()
  group.add(dust)

  const brazilMarker = createCyberPulse(brazil.lon, brazil.lat, '#38c172', 0.028)
  const brazilRing = createCyberPulseRing(brazil.lon, brazil.lat, '#38c172', {
    innerRadius: 0.034,
    outerRadius: 0.062,
    opacity: 0.42,
  })
  group.add(brazilMarker, brazilRing)
  const animatedObjects = [dust, brazilMarker, brazilRing]

  arcTargets.forEach((target, index) => {
    const staticArc = createCyberArc(brazil, target, target.color, {
      height: target.height,
      opacity: 0.16,
    })
    const flow = createCyberRouteFlow(brazil, target, target.color, {
      height: target.height,
      opacity: 0.16,
      speed: 0.055 + index * 0.012,
      offset: index * 0.17,
      particleSize: 0.014 + (index % 2) * 0.004,
    })
    const endpoint = createCyberPulse(target.lon, target.lat, target.color, 0.014)
    const endpointRing = createCyberPulseRing(target.lon, target.lat, target.color, {
      innerRadius: 0.018,
      outerRadius: 0.034,
      opacity: 0.26,
    })

    group.add(staticArc, flow, endpoint, endpointRing)
    animatedObjects.push(flow, endpoint, endpointRing)
  })

  group.userData.animate = (elapsed) => {
    dust.rotation.y = elapsed * 0.012
    dust.rotation.x = Math.sin(elapsed * 0.08) * 0.08
    brazilMarker.material.opacity = 0.62 + Math.sin(elapsed * 3.2) * 0.28
    brazilMarker.scale.setScalar(1 + Math.sin(elapsed * 3.2) * 0.18)
    brazilRing.material.opacity = 0.18 + ((Math.sin(elapsed * 2.2) + 1) / 2) * 0.24
    brazilRing.scale.setScalar(0.85 + ((Math.sin(elapsed * 2.2) + 1) / 2) * 0.7)

    animatedObjects.forEach((object, index) => {
      object.userData?.animate?.(elapsed + index * 0.17)

      if (object.geometry?.type === 'RingGeometry' && object !== brazilRing) {
        const wave = (Math.sin(elapsed * 2.1 + index) + 1) / 2
        object.material.opacity = 0.08 + wave * 0.2
        object.scale.setScalar(0.75 + wave * 0.65)
      }
    })
  }

  return group
}

export default function GlobeView({
  glebas,
  carGeojson,
  visibleFeatureIds,
  selectedId,
  selectedCarLayerKeys,
  viewportRequest,
  variant = 'satellite',
  introAnimation = false,
  onIntroComplete,
  onIntroSkip,
}) {
  const globeVariant = normalizeGlobeVariant(variant)
  const theme = GLOBE_THEMES[globeVariant]
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const layerGroupRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const tweenRef = useRef(null)
  const introTweenRef = useRef(null)
  const latestCameraPositionRef = useRef(null)
  const onIntroCompleteRef = useRef(onIntroComplete)
  const onIntroSkipRef = useRef(onIntroSkip)
  const lastViewportRequestKeyRef = useRef(null)
  const layerGroup = useMemo(
    () => createLayerGroup({
      glebas,
      carGeojson,
      visibleFeatureIds,
      selectedId,
      selectedCarLayerKeys,
    }),
    [carGeojson, glebas, globeVariant, selectedCarLayerKeys, selectedId, visibleFeatureIds]
  )

  useEffect(() => {
    onIntroCompleteRef.current = onIntroComplete
    onIntroSkipRef.current = onIntroSkip
  }, [onIntroComplete, onIntroSkip])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(theme.sceneBackground)

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    const brazilDirection = lonLatToVector3(BRAZIL_TARGET.lon, BRAZIL_TARGET.lat, 1).normalize()
    camera.position.copy(
      !introAnimation && latestCameraPositionRef.current
        ? latestCameraPositionRef.current
        : introAnimation
        ? cameraVectorFromLonLat(-12, 24, 10.2)
        : brazilDirection.multiplyScalar(5.8)
    )
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.rotateSpeed = 0.55
    controls.zoomSpeed = 0.72
    controls.minDistance = 2.75
    controls.maxDistance = introAnimation ? 12 : 9
    controls.enablePan = false
    controls.enabled = !introAnimation
    controlsRef.current = controls

    if (introAnimation) {
      introTweenRef.current = {
        curve: buildIntroCameraCurve(),
        startedAt: performance.now() + 240,
        duration: INTRO_DURATION_MS,
        completed: false,
      }
    }

    const earthTexture = createEarthTexture(globeVariant)
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 96, 64),
      new THREE.MeshStandardMaterial({
        map: earthTexture,
        roughness: globeVariant === 'map' ? 0.94 : 0.88,
        metalness: globeVariant === 'map' ? 0.04 : 0,
        emissive: globeVariant === 'map' ? new THREE.Color('#030303') : new THREE.Color('#000000'),
        emissiveIntensity: globeVariant === 'map' ? 0.12 : 0,
      })
    )
    scene.add(earth)

    let isDisposed = false
    let remoteEarthTexture = null
    const textureLoader = new THREE.TextureLoader()
    textureLoader.setCrossOrigin('anonymous')
    textureLoader.load(
      EARTH_TEXTURE_URL,
      (texture) => {
        if (isDisposed) {
          texture.dispose()
          return
        }

        if (globeVariant === 'map') {
          remoteEarthTexture = createMonochromeEarthTexture(texture.image)
          texture.dispose()
        } else {
          remoteEarthTexture = texture
          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = 8
        }

        earth.material.map = remoteEarthTexture
        earth.material.needsUpdate = true
      },
      undefined,
      () => {}
    )

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.018, 96, 64),
      new THREE.MeshBasicMaterial({
        color: theme.atmosphere,
        transparent: true,
        opacity: theme.atmosphereOpacity,
        side: THREE.BackSide,
        depthWrite: false,
      })
    )
    scene.add(atmosphere)

    const cyberOverlay = globeVariant === 'map' ? createCyberOverlay() : null
    if (cyberOverlay) scene.add(cyberOverlay)

    const stars = createStars(globeVariant)
    scene.add(stars)
    sceneRef.current = scene

    const sun = new THREE.DirectionalLight(theme.sun, theme.sunIntensity)
    sun.position.set(4, 3, 5)
    scene.add(sun)
    scene.add(new THREE.AmbientLight(theme.ambient, theme.ambientIntensity))

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth || 1
      const height = container.clientHeight || 1
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    })
    resizeObserver.observe(container)

    let frameId = null
    const animate = () => {
      const introTween = introTweenRef.current
      if (introTween) {
        const progress = Math.min(1, Math.max(0, (performance.now() - introTween.startedAt) / introTween.duration))
        const eased = easeInOutCubic(progress)
        camera.position.copy(introTween.curve.getPoint(eased))

        if (progress >= 1 && !introTween.completed) {
          introTween.completed = true
          introTweenRef.current = null
          controls.enabled = true
          controls.maxDistance = 9
          onIntroCompleteRef.current?.()
        }
      }

      const tween = tweenRef.current
      if (tween && !introTweenRef.current) {
        const progress = Math.min(1, (performance.now() - tween.startedAt) / tween.duration)
        const eased = easeOutCubic(progress)
        camera.position.lerpVectors(tween.from, tween.to, eased)

        if (progress >= 1) {
          tweenRef.current = null
        }
      }

      controls.update()
      const elapsed = performance.now() * 0.001
      if (globeVariant === 'map') {
        cyberOverlay?.userData?.animate?.(elapsed)
        stars.rotation.y = elapsed * 0.006
        atmosphere.material.opacity = theme.atmosphereOpacity + ((Math.sin(elapsed * 0.8) + 1) / 2) * 0.025
      }
      if (!latestCameraPositionRef.current) {
        latestCameraPositionRef.current = new THREE.Vector3()
      }
      latestCameraPositionRef.current.copy(camera.position)
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      isDisposed = true
      if (frameId !== null) cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      controls.dispose()
      earthTexture.dispose()
      remoteEarthTexture?.dispose?.()
      disposeObjectTree(scene)
      cameraRef.current = null
      controlsRef.current = null
      sceneRef.current = null
      layerGroupRef.current = null
      tweenRef.current = null
      introTweenRef.current = null
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [globeVariant])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return undefined

    if (layerGroupRef.current) {
      scene.remove(layerGroupRef.current)
      disposeObjectTree(layerGroupRef.current)
    }

    layerGroupRef.current = layerGroup
    scene.add(layerGroup)

    return undefined
  }, [layerGroup])

  useEffect(() => {
    const camera = cameraRef.current
    if (!camera) return
    if (introAnimation) return

    const requestKey = viewportRequest?.requestKey || viewportRequest?.datasetKey || null
    if (!requestKey || lastViewportRequestKeyRef.current === requestKey) return

    const target = resolveViewportTarget({
      viewportRequest,
      glebas,
      carGeojson,
    })

    if (!target) return

    lastViewportRequestKeyRef.current = requestKey
    tweenRef.current = {
      from: camera.position.clone(),
      to: target.direction.clone().multiplyScalar(target.distance),
      startedAt: performance.now(),
      duration: viewportRequest.type === 'home' ? 1400 : 1850,
    }
  }, [carGeojson, glebas, introAnimation, viewportRequest])

  const handleIntroSkip = () => {
    if (!introAnimation) return

    introTweenRef.current = null
    if (controlsRef.current) {
      controlsRef.current.enabled = true
      controlsRef.current.maxDistance = 9
    }
    onIntroSkipRef.current?.()
  }

  return (
    <div
      className={`globe-view globe-view--${globeVariant}${introAnimation ? ' globe-view--intro' : ''}`}
      ref={containerRef}
      onPointerDown={introAnimation ? handleIntroSkip : undefined}
      onWheel={introAnimation ? handleIntroSkip : undefined}
      onTouchStart={introAnimation ? handleIntroSkip : undefined}
    >
      <div className="globe-view__hud" aria-hidden="true">
        <span>{theme.hudLabel}</span>
      </div>
      {introAnimation && (
        <button
          type="button"
          className="globe-view__skip"
          onClick={handleIntroSkip}
        >
          Pular abertura
        </button>
      )}
    </div>
  )
}
