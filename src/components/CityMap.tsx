import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Ambulance,
  Boxes,
  Construction,
  Crosshair,
  Flame,
  LocateFixed,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  Route,
  ScanLine,
  Truck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  CityEdge,
  CityNode,
  IncidentType,
  MapTool,
  ResourceType,
  ResourceUnit,
  SimulationState,
} from '../types'
import { INCIDENT_META, RESOURCE_META } from '../types'
import { closestEdge, nearestNode } from '../engine/graph'

interface CityMapProps {
  state: SimulationState
  tool: MapTool
  incidentType: IncidentType
  incidentSeverity: 1 | 2 | 3
  selectedEntity?: string
  readOnly: boolean
  onToolChange: (tool: MapTool) => void
  onIncidentTypeChange: (type: IncidentType) => void
  onIncidentSeverityChange: (severity: 1 | 2 | 3) => void
  onSelectEntity: (id?: string) => void
  onInjectIncident: (type: IncidentType, nodeId: string, severity: 1 | 2 | 3) => void
  onAddResource: (type: ResourceType, nodeId: string) => void
  onToggleRoad: (edgeId: string, status: 'open' | 'closed') => void
  onAddRoad: (from: string, to: string) => void
  onRemoveRoad: (edgeId: string) => void
  onNotice: (message: string) => void
}

interface Camera {
  zoom: number
  panX: number
  panY: number
}

interface HoverInfo {
  kind: 'node' | 'edge' | 'incident' | 'resource'
  id: string
  x: number
  y: number
  title: string
  subtitle: string
}

interface ToolDefinition {
  id: MapTool
  label: string
  icon: LucideIcon
}

const TOOLS: ToolDefinition[] = [
  { id: 'select', label: '选择 / 查看', icon: MousePointer2 },
  { id: 'incident', label: '注入突发事件', icon: Flame },
  { id: 'ambulance', label: '部署救护车', icon: Ambulance },
  { id: 'fire', label: '部署消防车', icon: Truck },
  { id: 'supply', label: '部署物资车', icon: Boxes },
  { id: 'road', label: '路网编辑', icon: Construction },
]

const ZONE_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  business: { fill: '#123247', stroke: '#1e4b62', label: '#77b8cd' },
  residential: { fill: '#202c3b', stroke: '#354658', label: '#92a9bc' },
  innovation: { fill: '#122f31', stroke: '#225156', label: '#77c5b8' },
  waterfront: { fill: '#122d3a', stroke: '#1f4d5b', label: '#78b8c5' },
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + width, y, x + width, y + height, r)
  context.arcTo(x + width, y + height, x, y + height, r)
  context.arcTo(x, y + height, x, y, r)
  context.arcTo(x, y, x + width, y, r)
  context.closePath()
}

function resourcePositions(resources: ResourceUnit[], nodes: CityNode[]): Map<string, { x: number; y: number }> {
  const groups = new Map<string, ResourceUnit[]>()
  for (const resource of resources) {
    const group = groups.get(resource.nodeId) ?? []
    group.push(resource)
    groups.set(resource.nodeId, group)
  }
  const result = new Map<string, { x: number; y: number }>()
  for (const [nodeId, group] of groups.entries()) {
    const node = nodes.find((candidate) => candidate.id === nodeId)
    if (!node) continue
    group.forEach((resource, index) => {
      const count = group.length
      const angle = count === 1 ? -Math.PI / 2 : (Math.PI * 2 * index) / count - Math.PI / 2
      const radius = count === 1 ? 0.18 : 0.22
      result.set(resource.id, {
        x: node.x + Math.cos(angle) * radius,
        y: node.y + Math.sin(angle) * radius,
      })
    })
  }
  return result
}

export function CityMap({
  state,
  tool,
  incidentType,
  incidentSeverity,
  selectedEntity,
  readOnly,
  onToolChange,
  onIncidentTypeChange,
  onIncidentSeverityChange,
  onSelectEntity,
  onInjectIncident,
  onAddResource,
  onToggleRoad,
  onAddRoad,
  onRemoveRoad,
  onNotice,
}: CityMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hoverRef = useRef<HoverInfo | null>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [size, setSize] = useState({ width: 800, height: 540 })
  const [camera, setCamera] = useState<Camera>({ zoom: 1, panX: 0, panY: 0 })
  const [roadDraft, setRoadDraft] = useState<string | undefined>(undefined)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setSize({
        width: Math.max(320, entry.contentRect.width),
        height: Math.max(320, entry.contentRect.height),
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setRoadDraft(undefined)
  }, [tool])

  const fitScale = Math.min((size.width - 76) / state.city.width, (size.height - 68) / state.city.height)
  const scale = fitScale * camera.zoom
  const originX = size.width / 2 - (state.city.width * scale) / 2 + camera.panX
  const originY = size.height / 2 - (state.city.height * scale) / 2 + camera.panY

  const screenToWorld = useCallback(
    (x: number, y: number) => ({
      x: (x - originX) / scale,
      y: (y - originY) / scale,
    }),
    [originX, originY, scale],
  )

  const worldToScreen = useCallback(
    (x: number, y: number) => ({ x: originX + x * scale, y: originY + y * scale }),
    [originX, originY, scale],
  )

  const hitTest = useCallback(
    (clientX: number, clientY: number): HoverInfo | undefined => {
      const canvas = canvasRef.current
      if (!canvas) return undefined
      const rect = canvas.getBoundingClientRect()
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      const world = screenToWorld(sx, sy)
      const positions = resourcePositions(state.resources, state.city.nodes)
      let best: HoverInfo | undefined
      let bestDistance = 18

      for (const incident of state.incidents) {
        const node = state.city.nodes.find((candidate) => candidate.id === incident.nodeId)
        if (!node) continue
        const point = worldToScreen(node.x, node.y)
        const distance = Math.hypot(point.x - sx, point.y - sy)
        if (distance < bestDistance) {
          bestDistance = distance
          best = {
            kind: 'incident',
            id: incident.id,
            x: node.x,
            y: node.y,
            title: incident.title,
            subtitle: INCIDENT_META[incident.type].label + ' · 等级 ' + incident.severity,
          }
        }
      }

      for (const resource of state.resources) {
        const position = positions.get(resource.id)
        if (!position) continue
        const point = worldToScreen(position.x, position.y)
        const distance = Math.hypot(point.x - sx, point.y - sy)
        if (distance < bestDistance) {
          bestDistance = distance
          best = {
            kind: 'resource',
            id: resource.id,
            x: position.x,
            y: position.y,
            title: resource.label,
            subtitle: RESOURCE_META[resource.type].label + ' · ' + resource.status,
          }
        }
      }

      const node = nearestNode(state.city, world.x, world.y, 16 / scale)
      if (node) {
        const point = worldToScreen(node.x, node.y)
        const distance = Math.hypot(point.x - sx, point.y - sy)
        if (distance < bestDistance) {
          bestDistance = distance
          best = {
            kind: 'node',
            id: node.id,
            x: node.x,
            y: node.y,
            title: '路口 ' + node.label,
            subtitle: node.district + ' · 可部署节点',
          }
        }
      }

      if (!best) {
        const edge = closestEdge(state.city, world.x, world.y, 11 / scale)
        if (edge) {
          const from = state.city.nodes.find((candidate) => candidate.id === edge.from)
          const to = state.city.nodes.find((candidate) => candidate.id === edge.to)
          if (from && to) {
            best = {
              kind: 'edge',
              id: edge.id,
              x: (from.x + to.x) / 2,
              y: (from.y + to.y) / 2,
              title: edge.name,
              subtitle: (edge.status === 'open' ? '通行正常' : '道路中断') + ' · ' + edge.lanes + ' 车道',
            }
          }
        }
      }
      return best
    },
    [scale, screenToWorld, state.city, state.incidents, state.resources, worldToScreen],
  )

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    pointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    if (dragRef.current) {
      setCamera((current) => ({
        ...current,
        panX: dragRef.current ? dragRef.current.panX + event.clientX - dragRef.current.x : current.panX,
        panY: dragRef.current ? dragRef.current.panY + event.clientY - dragRef.current.y : current.panY,
      }))
      return
    }
    hoverRef.current = hitTest(event.clientX, event.clientY) ?? null
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button === 1 || event.button === 2) {
      dragRef.current = { x: event.clientX, y: event.clientY, panX: camera.panX, panY: camera.panY }
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    const world = screenToWorld(sx, sy)
    const nextZoom = Math.max(0.72, Math.min(3.2, camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1)))
    const nextScale = fitScale * nextZoom
    const nextOriginX = size.width / 2 - (state.city.width * nextScale) / 2
    const nextOriginY = size.height / 2 - (state.city.height * nextScale) / 2
    setCamera({
      zoom: nextZoom,
      panX: sx - nextOriginX - world.x * nextScale,
      panY: sy - nextOriginY - world.y * nextScale,
    })
  }

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) return
    const hover = hitTest(event.clientX, event.clientY)
    const rect = event.currentTarget.getBoundingClientRect()
    const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top)
    if (readOnly) {
      onNotice('当前处于回放视图，返回最新状态后才可编辑场景')
      return
    }
    if (tool === 'select') {
      onSelectEntity(hover?.id)
      return
    }
    if (tool === 'road') {
      if (hover?.kind === 'edge') {
        const edge = state.city.edges.find((candidate) => candidate.id === hover.id)
        if (!edge) return
        if (event.altKey) {
          onRemoveRoad(edge.id)
        } else {
          onToggleRoad(edge.id, edge.status === 'open' ? 'closed' : 'open')
        }
        return
      }
      const node = nearestNode(state.city, world.x, world.y, 0.52)
      if (!node) {
        onNotice('请点击路口或道路中央进行路网编辑')
        return
      }
      if (!roadDraft) {
        setRoadDraft(node.id)
        onNotice('已选择起点 ' + node.label + '，再点击另一路口建立新通道')
      } else if (roadDraft === node.id) {
        setRoadDraft(undefined)
        onNotice('已取消路网连接')
      } else {
        onAddRoad(roadDraft, node.id)
        setRoadDraft(undefined)
      }
      return
    }
    const node = nearestNode(state.city, world.x, world.y, 0.52)
    if (!node) {
      onNotice('部署操作需靠近一个路网节点')
      return
    }
    if (tool === 'incident') {
      onInjectIncident(incidentType, node.id, incidentSeverity)
    } else {
      onAddResource(tool as ResourceType, node.id)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    canvas.style.width = size.width + 'px'
    canvas.style.height = size.height + 'px'
    let frame = 0

    const draw = (timestamp: number) => {
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, size.width, size.height)
      const background = context.createRadialGradient(size.width * 0.45, size.height * 0.42, 20, size.width * 0.5, size.height * 0.5, size.width * 0.7)
      background.addColorStop(0, '#0a1d2b')
      background.addColorStop(0.55, '#071521')
      background.addColorStop(1, '#050e17')
      context.fillStyle = background
      context.fillRect(0, 0, size.width, size.height)

      context.save()
      context.translate(originX, originY)
      context.scale(scale, scale)

      const mapGradient = context.createLinearGradient(0, 0, state.city.width, state.city.height)
      mapGradient.addColorStop(0, '#071a26')
      mapGradient.addColorStop(0.55, '#081925')
      mapGradient.addColorStop(1, '#091722')
      context.fillStyle = mapGradient
      roundedRect(context, 0.20, 0.20, state.city.width - 0.4, state.city.height - 0.4, 0.26)
      context.fill()
      context.strokeStyle = '#1d3f53'
      context.lineWidth = 0.025
      context.stroke()

      for (const zone of state.city.zones) {
        const palette = ZONE_COLORS[zone.kind]
        const gradient = context.createLinearGradient(zone.x, zone.y, zone.x + zone.width, zone.y + zone.height)
        gradient.addColorStop(0, palette.fill)
        gradient.addColorStop(1, '#0b1d29')
        context.globalAlpha = 0.78
        context.fillStyle = gradient
        roundedRect(context, zone.x, zone.y, zone.width, zone.height, 0.16)
        context.fill()
        context.globalAlpha = 1
        context.strokeStyle = palette.stroke
        context.lineWidth = 0.018
        context.setLineDash([0.09, 0.08])
        context.stroke()
        context.setLineDash([])
        context.fillStyle = palette.label
        context.globalAlpha = 0.58
        context.font = '600 0.15px "Microsoft YaHei", sans-serif'
        context.fillText(zone.name, zone.x + 0.25, zone.y + 0.32)
        context.globalAlpha = 0.3
        context.font = '500 0.075px "IBM Plex Mono", monospace'
        context.fillText(zone.id + ' / URBAN BLOCK', zone.x + 0.25, zone.y + 0.45)
        context.globalAlpha = 1
      }

      const colCount = Math.round((state.city.width - 2.05) / 1.02) + 1
      const rowCount = Math.round((state.city.height - 2.05) / 0.94) + 1
      for (let row = 0; row < rowCount - 1; row += 1) {
        for (let col = 0; col < colCount - 1; col += 1) {
          const x = 1 + col * 1.02 + 0.25
          const y = 1 + row * 0.94 + 0.22
          const cell = row * colCount + col
          context.fillStyle = cell % 5 === 0 ? '#122533' : cell % 3 === 0 ? '#10212e' : '#0e202c'
          roundedRect(context, x, y, 0.52, 0.48, 0.05)
          context.fill()
          context.strokeStyle = 'rgba(90, 143, 166, 0.12)'
          context.lineWidth = 0.008
          context.stroke()
          context.fillStyle = cell % 4 === 0 ? 'rgba(55, 115, 136, 0.28)' : 'rgba(46, 88, 106, 0.22)'
          context.fillRect(x + 0.055, y + 0.07, 0.17, 0.1)
          context.fillRect(x + 0.29, y + 0.09, 0.13, 0.16)
          if (cell % 3 === 0) context.fillRect(x + 0.08, y + 0.27, 0.22, 0.08)
        }
      }

      for (const edge of state.city.edges) {
        const from = state.city.nodes.find((node) => node.id === edge.from)
        const to = state.city.nodes.find((node) => node.id === edge.to)
        if (!from || !to) continue
        const highlighted = hoverRef.current?.id === edge.id || selectedEntity === edge.id
        context.lineCap = 'round'
        context.strokeStyle = edge.status === 'closed' ? '#3a1e29' : highlighted ? '#2d6778' : '#243b4c'
        context.lineWidth = 0.11 + edge.lanes * 0.025
        context.beginPath()
        context.moveTo(from.x, from.y)
        context.lineTo(to.x, to.y)
        context.stroke()
        context.strokeStyle = edge.status === 'closed' ? '#b7495e' : highlighted ? '#68d8de' : '#50697a'
        context.lineWidth = edge.status === 'closed' ? 0.032 : 0.021
        context.beginPath()
        context.moveTo(from.x, from.y)
        context.lineTo(to.x, to.y)
        context.stroke()
        if (edge.status === 'open' && edge.lanes >= 3) {
          context.strokeStyle = '#b8a76b'
          context.globalAlpha = 0.55
          context.lineWidth = 0.01
          context.setLineDash([0.08, 0.12])
          context.beginPath()
          context.moveTo(from.x, from.y)
          context.lineTo(to.x, to.y)
          context.stroke()
          context.setLineDash([])
          context.globalAlpha = 1
        }
        if (edge.status === 'closed') {
          const mx = (from.x + to.x) / 2
          const my = (from.y + to.y) / 2
          const dx = to.x - from.x
          const dy = to.y - from.y
          const len = Math.max(0.01, Math.hypot(dx, dy))
          const nx = -dy / len
          const ny = dx / len
          context.strokeStyle = '#ff6575'
          context.lineWidth = 0.035
          context.beginPath()
          context.moveTo(mx - nx * 0.16 - dx * 0.06, my - ny * 0.16 - dy * 0.06)
          context.lineTo(mx + nx * 0.16 + dx * 0.06, my + ny * 0.16 + dy * 0.06)
          context.moveTo(mx + nx * 0.16 - dx * 0.06, my + ny * 0.16 - dy * 0.06)
          context.lineTo(mx - nx * 0.16 + dx * 0.06, my - ny * 0.16 + dy * 0.06)
          context.stroke()
        }
      }

      for (const resource of state.resources) {
        if (resource.status !== 'enroute' || resource.path.length < 2) continue
        const color = RESOURCE_META[resource.type].color
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.strokeStyle = color
        context.globalAlpha = 0.12
        context.lineWidth = 0.115
        context.beginPath()
        resource.path.forEach((nodeId, index) => {
          const node = state.city.nodes.find((candidate) => candidate.id === nodeId)
          if (!node) return
          if (index === 0) context.moveTo(node.x, node.y)
          else context.lineTo(node.x, node.y)
        })
        context.stroke()
        context.globalAlpha = 0.9
        context.lineWidth = 0.035
        context.setLineDash([0.12, 0.09])
        context.lineDashOffset = -(timestamp / 65) % 0.21
        context.beginPath()
        resource.path.forEach((nodeId, index) => {
          const node = state.city.nodes.find((candidate) => candidate.id === nodeId)
          if (!node) return
          if (index === 0) context.moveTo(node.x, node.y)
          else context.lineTo(node.x, node.y)
        })
        context.stroke()
        context.setLineDash([])
        context.lineDashOffset = 0
        context.globalAlpha = 1
      }

      if (roadDraft) {
        const node = state.city.nodes.find((candidate) => candidate.id === roadDraft)
        if (node) {
          const pointer = screenToWorld(pointerRef.current.x, pointerRef.current.y)
          context.strokeStyle = '#63e2cf'
          context.globalAlpha = 0.7
          context.lineWidth = 0.03
          context.setLineDash([0.1, 0.09])
          context.beginPath()
          context.moveTo(node.x, node.y)
          context.lineTo(pointer.x, pointer.y)
          context.stroke()
          context.setLineDash([])
          context.globalAlpha = 1
        }
      }

      const positions = resourcePositions(state.resources, state.city.nodes)
      for (const incident of state.incidents) {
        const node = state.city.nodes.find((candidate) => candidate.id === incident.nodeId)
        if (!node) continue
        const meta = INCIDENT_META[incident.type]
        const pulse = 0.25 + (Math.sin(timestamp / 440) + 1) * 0.035
        if (incident.status !== 'resolved') {
          context.strokeStyle = meta.color
          context.globalAlpha = 0.25
          context.lineWidth = 0.025
          context.beginPath()
          context.arc(node.x, node.y, pulse, 0, Math.PI * 2)
          context.stroke()
          context.globalAlpha = 0.12
          context.beginPath()
          context.arc(node.x, node.y, pulse + 0.11, 0, Math.PI * 2)
          context.stroke()
          context.globalAlpha = 1
        }
        context.fillStyle = incident.status === 'resolved' ? '#2e7b6f' : meta.color
        context.shadowColor = incident.status === 'resolved' ? '#42c4b0' : meta.color
        context.shadowBlur = 0.18
        context.beginPath()
        context.arc(node.x, node.y, 0.17, 0, Math.PI * 2)
        context.fill()
        context.shadowBlur = 0
        context.fillStyle = '#07131c'
        context.font = '700 0.14px "Microsoft YaHei", sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(meta.short, node.x, node.y + 0.005)
        context.textAlign = 'left'
        context.textBaseline = 'alphabetic'
        if (selectedEntity === incident.id) {
          context.strokeStyle = '#e7fffb'
          context.lineWidth = 0.018
          context.beginPath()
          context.arc(node.x, node.y, 0.28, 0, Math.PI * 2)
          context.stroke()
        }
      }

      for (const [index, resource] of state.resources.entries()) {
        void index
        const position = positions.get(resource.id)
        if (!position) continue
        const meta = RESOURCE_META[resource.type]
        const selected = selectedEntity === resource.id
        if (resource.status !== 'idle') {
          context.strokeStyle = meta.color
          context.globalAlpha = 0.28 + (Math.sin(timestamp / 300) + 1) * 0.09
          context.lineWidth = 0.018
          context.beginPath()
          context.arc(position.x, position.y, 0.18, 0, Math.PI * 2)
          context.stroke()
          context.globalAlpha = 1
        }
        context.fillStyle = '#081520'
        context.strokeStyle = selected ? '#ffffff' : meta.color
        context.lineWidth = selected ? 0.028 : 0.017
        context.beginPath()
        context.arc(position.x, position.y, 0.115, 0, Math.PI * 2)
        context.fill()
        context.stroke()
        context.fillStyle = meta.color
        context.font = '700 0.105px "Microsoft YaHei", sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(meta.short, position.x, position.y + 0.008)
        context.textAlign = 'left'
        context.textBaseline = 'alphabetic'
      }

      for (const node of state.city.nodes) {
        const highlighted = hoverRef.current?.id === node.id
        context.fillStyle = highlighted ? '#9cf7ed' : '#617f8f'
        context.beginPath()
        context.arc(node.x, node.y, highlighted ? 0.045 : 0.026, 0, Math.PI * 2)
        context.fill()
      }

      context.restore()

      const hover = hoverRef.current
      if (hover) {
        const point = worldToScreen(hover.x, hover.y)
        const boxWidth = Math.min(260, Math.max(156, hover.title.length * 13 + 28))
        const bx = Math.min(size.width - boxWidth - 12, point.x + 16)
        const by = Math.max(10, Math.min(size.height - 66, point.y - 22))
        context.fillStyle = 'rgba(4, 14, 23, 0.92)'
        context.strokeStyle = 'rgba(95, 224, 211, 0.35)'
        context.lineWidth = 1
        roundedRect(context, bx, by, boxWidth, 48, 7)
        context.fill()
        context.stroke()
        context.fillStyle = '#e5f8f6'
        context.font = '600 12px "Microsoft YaHei", sans-serif'
        context.fillText(hover.title, bx + 11, by + 19, boxWidth - 22)
        context.fillStyle = '#7896a4'
        context.font = '500 10px "Microsoft YaHei", sans-serif'
        context.fillText(hover.subtitle, bx + 11, by + 35, boxWidth - 22)
      }

      context.strokeStyle = 'rgba(113, 173, 194, 0.34)'
      context.lineWidth = 1
      const scaleX = 22
      const scaleY = size.height - 22
      context.beginPath()
      context.moveTo(scaleX, scaleY)
      context.lineTo(scaleX + scale, scaleY)
      context.moveTo(scaleX, scaleY - 4)
      context.lineTo(scaleX, scaleY + 4)
      context.moveTo(scaleX + scale, scaleY - 4)
      context.lineTo(scaleX + scale, scaleY + 4)
      context.stroke()
      context.fillStyle = '#70909e'
      context.font = '500 9px "IBM Plex Mono", monospace'
      context.fillText('1 KM', scaleX + scale / 2 - 11, scaleY - 8)

      const beamY = ((timestamp / 55) % (size.height + 240)) - 120
      const beam = context.createLinearGradient(0, beamY - 80, 0, beamY + 80)
      beam.addColorStop(0, 'rgba(78, 220, 207, 0)')
      beam.addColorStop(0.5, 'rgba(78, 220, 207, 0.025)')
      beam.addColorStop(1, 'rgba(78, 220, 207, 0)')
      context.fillStyle = beam
      context.fillRect(0, beamY - 80, size.width, 160)

      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [camera, hoverRef, originX, originY, roadDraft, scale, screenToWorld, selectedEntity, size, state, worldToScreen])

  const activeTool = TOOLS.find((item) => item.id === tool)
  const ActiveToolIcon = activeTool?.icon ?? MousePointer2
  const hint = readOnly
    ? '回放查看模式 · 返回最新状态后可编辑场景'
    : tool === 'select'
      ? '点击事件或车辆查看详情 · 滚轮缩放 · 右键拖动地图'
      : tool === 'incident'
        ? '在路口注入 ' + INCIDENT_META[incidentType].label + ' 事件'
        : tool === 'road'
          ? roadDraft
            ? '已选起点，点击第二个路口连接道路'
            : '点击道路封控 / 恢复 · Alt+点击删除 · 点击两个路口新建道路'
          : '点击任意路口部署 ' + RESOURCE_META[tool as ResourceType].label

  return (
    <div className="map-shell" ref={containerRef} data-testid="city-map">
      <canvas
        ref={canvasRef}
        className="city-canvas"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          hoverRef.current = null
          dragRef.current = null
        }}
        onWheel={handleWheel}
        onClick={handleClick}
        onContextMenu={(event) => event.preventDefault()}
      />

      <div className="map-toolbar" role="toolbar" aria-label="地图编辑工具">
        {TOOLS.map((item) => {
          const Icon = item.icon
          return (
            <button
              type="button"
              key={item.id}
              className={'map-tool-button' + (tool === item.id ? ' active' : '')}
              onClick={() => onToolChange(item.id)}
              title={item.label}
              aria-label={item.label}
              data-testid={'tool-' + item.id}
            >
              <Icon size={18} />
              <span>{item.label.slice(0, 2)}</span>
            </button>
          )
        })}
      </div>

      {tool === 'incident' && !readOnly && (
        <div className="map-tool-popover incident-popover">
          <div className="popover-heading"><Flame size={14} /> 事件类型</div>
          <div className="incident-type-row">
            {(Object.keys(INCIDENT_META) as IncidentType[]).map((type) => (
              <button
                type="button"
                key={type}
                className={incidentType === type ? 'active ' + type : type}
                onClick={() => onIncidentTypeChange(type)}
              >
                <span>{INCIDENT_META[type].short}</span>
                {INCIDENT_META[type].label}
              </button>
            ))}
          </div>
          <div className="severity-picker">
            <span>事件等级</span>
            {[1, 2, 3].map((level) => (
              <button
                type="button"
                key={level}
                className={incidentSeverity >= level ? 'filled' : ''}
                onClick={() => onIncidentSeverityChange(level as 1 | 2 | 3)}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      )}

      {tool === 'road' && !readOnly && (
        <div className="map-tool-popover road-popover">
          <div className="popover-heading"><Construction size={14} /> 路网编辑</div>
          <p>点击道路切换封控状态；按住 Alt 删除；依次点击两个路口可新建应急通道。</p>
          <span className={'draft-state' + (roadDraft ? ' active' : '')}>
            {roadDraft ? '起点：' + (state.city.nodes.find((node) => node.id === roadDraft)?.label ?? roadDraft) : '尚未选择起点'}
          </span>
        </div>
      )}

      <div className="map-heading">
        <div className="map-heading-icon"><ScanLine size={19} /></div>
        <div>
          <span className="section-kicker">LIVE DIGITAL TWIN / 01</span>
          <h2>{state.city.name} 数字孪生态势</h2>
        </div>
        <span className="map-live"><i /> 60 HZ</span>
      </div>

      <div className="map-side-status">
        <div><span>ACTIVE AGENTS</span><strong>{state.metrics.activeUnits}</strong></div>
        <div><span>ROAD CLOSURES</span><strong className={state.metrics.roadClosures > 0 ? 'warning' : ''}>{state.metrics.roadClosures}</strong></div>
        <div><span>ROUTING</span><strong className="small">{state.settings.pathAlgorithm === 'astar' ? 'A*' : 'DIJKSTRA'}</strong></div>
      </div>

      <div className="map-zoom-controls">
        <button
          type="button"
          title="放大"
          aria-label="放大"
          onClick={() => setCamera((current) => ({ ...current, zoom: Math.min(3.2, current.zoom * 1.18) }))}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          title="缩小"
          aria-label="缩小"
          onClick={() => setCamera((current) => ({ ...current, zoom: Math.max(0.72, current.zoom / 1.18) }))}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          title="适配视图"
          aria-label="适配视图"
          onClick={() => setCamera({ zoom: 1, panX: 0, panY: 0 })}
        >
          <Maximize2 size={14} />
        </button>
      </div>

      {readOnly && <div className="replay-ribbon"><Crosshair size={13} /> REPLAY MODE · 场景编辑已锁定</div>}

      <div className="map-hint">
        <ActiveToolIcon size={14} />
        <span>{hint}</span>
        <LocateFixed size={13} />
      </div>

      <div className="map-legend">
        <span><i className="legend-incident" /> 事件</span>
        <span><i className="legend-fire" /> 消防</span>
        <span><i className="legend-med" /> 医疗</span>
        <span><i className="legend-supply" /> 物资</span>
        <span><i className="legend-route" /> 调度路径</span>
        <span><i className="legend-closed" /> 断路</span>
      </div>

      <div className="map-corner-code">
        <Route size={12} /> GRID / 13×9 · OFFLINE READY
      </div>
    </div>
  )
}
