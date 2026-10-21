import type {
  AlgorithmComparison,
  AssignmentStrategy,
  CityEdge,
  CityScenario,
  IncidentTask,
  IncidentType,
  PathAlgorithm,
  ResourceType,
  ResourceUnit,
  SimulationEvent,
  SimulationMetrics,
  SimulationState,
} from '../types'
import { INCIDENT_META, RESOURCE_META, emptyMetrics, requiredCapabilities } from '../types'
import {
  computeCoverage,
  findPath,
  getEdgeBetween,
  pathEdgeIds,
  routeDistance,
} from './graph'

const clone = <T>(value: T): T => structuredClone(value)

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function makeEvent(
  state: SimulationState,
  event: Omit<SimulationEvent, 'id'>,
): SimulationEvent {
  return {
    ...event,
    id: `EVT-${event.time.toFixed(2)}-${state.events.length + 1}`,
  }
}

function addEvent(state: SimulationState, event: Omit<SimulationEvent, 'id'>): void {
  state.events.push(makeEvent(state, event))
}

function incidentWorkDuration(type: IncidentType, severity: number): number {
  const base = { fire: 18, medical: 10, flood: 16 }[type]
  return base + severity * 5
}

function eventToneForIncident(type: IncidentType): 'critical' | 'warning' {
  return type === 'fire' ? 'critical' : 'warning'
}

export function metricSummary(state: SimulationState): SimulationMetrics {
  const responded = state.incidents.filter((incident) => incident.responseAt !== undefined)
  const avgResponseMinutes =
    responded.length === 0
      ? 0
      : responded.reduce(
          (sum, incident) => sum + ((incident.responseAt ?? 0) - incident.createdAt),
          0,
        ) / responded.length
  const activeUnits = state.resources.filter((resource) => resource.status !== 'idle').length
  const utilizationPercent =
    state.time <= 0
      ? 0
      : (state.resources.reduce(
          (sum, resource) => sum + Math.min(1, resource.busyMinutes / state.time),
          0,
        ) /
          Math.max(1, state.resources.length)) *
        100
  const openEdges = state.city.edges.filter((edge) => edge.status === 'open')
  const closedCount = state.city.edges.length - openEdges.length
  const load = new Map<string, number>()
  for (const resource of state.resources) {
    if (resource.status !== 'enroute' || resource.path.length < 2) continue
    for (const id of pathEdgeIds(state.city, resource.path)) load.set(id, (load.get(id) ?? 0) + 1)
  }
  const routeCongestion =
    load.size === 0
      ? 0
      : (Array.from(load.entries()).reduce((sum, [edgeId, count]) => {
          const edge = state.city.edges.find((candidate) => candidate.id === edgeId)
          return sum + Math.min(1, count / Math.max(1, (edge?.lanes ?? 1) * 1.4))
        }, 0) /
          load.size) *
        100
  const closurePressure =
    state.city.edges.length === 0 ? 0 : (closedCount / state.city.edges.length) * 100 * 4
  const coveragePercent = computeCoverage(
    state.city,
    state.resources.map((resource) => resource.nodeId),
    state.settings.targetResponseMinutes,
  )

  return {
    avgResponseMinutes: round(avgResponseMinutes),
    coveragePercent: round(coveragePercent),
    congestionPercent: round(Math.min(100, routeCongestion * 0.72 + closurePressure)),
    utilizationPercent: round(utilizationPercent),
    resolvedCount: state.incidents.filter((incident) => incident.status === 'resolved').length,
    totalIncidents: state.incidents.length,
    activeUnits,
    totalUnits: state.resources.length,
    roadClosures: closedCount,
  }
}

function refreshMetrics(state: SimulationState): void {
  state.metrics = metricSummary(state)
}

export function createInitialState(scenario: CityScenario): SimulationState {
  const incidents: IncidentTask[] = scenario.incidents.map((incident) => ({
    ...clone(incident),
    status: 'pending',
    assignedResourceIds: [],
    workRemaining: incidentWorkDuration(incident.type, incident.severity),
    workMinutes: incidentWorkDuration(incident.type, incident.severity),
  }))
  const resources: ResourceUnit[] = scenario.resources.map((resource) => ({
    ...clone(resource),
    status: 'idle',
    path: [resource.nodeId],
    segmentIndex: 0,
    segmentProgress: 0,
    routeDistance: 0,
    routeCost: 0,
    routeAlgorithm: scenario.settings.pathAlgorithm,
    busyMinutes: 0,
    dispatchCount: 0,
    rerouteCount: 0,
  }))
  const state: SimulationState = {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    description: scenario.description,
    objective: scenario.objective,
    time: 0,
    phase: 'ready',
    city: clone(scenario.city),
    resources,
    incidents,
    events: [],
    metrics: emptyMetrics(),
    settings: clone(scenario.settings),
  }
  addEvent(state, {
    time: 0,
    kind: 'system',
    title: '推演沙盘装载完成',
    detail: `${scenario.resources.length} 台应急车辆、${scenario.incidents.length} 起初始事件已接入。`,
    tone: 'info',
  })
  refreshMetrics(state)
  return state
}

function chooseResource(
  state: SimulationState,
  incident: IncidentTask,
  type: ResourceType,
  strategy: AssignmentStrategy,
  algorithm: PathAlgorithm,
): { resource: ResourceUnit; path: ReturnType<typeof findPath> } | undefined {
  const candidates = state.resources.filter(
    (resource) => resource.type === type && resource.status === 'idle' && !resource.incidentId,
  )
  let best:
    | { resource: ResourceUnit; path: ReturnType<typeof findPath>; score: number }
    | undefined
  for (const resource of candidates) {
    const path = findPath(state.city, resource.nodeId, incident.nodeId, algorithm)
    if (!path.feasible) continue
    const balancePenalty = strategy === 'balanced' ? resource.dispatchCount * 1.6 : 0
    const score = path.cost + balancePenalty
    if (
      !best ||
      score < best.score - 1e-9 ||
      (Math.abs(score - best.score) <= 1e-9 && resource.id.localeCompare(best.resource.id) < 0)
    ) {
      best = { resource, path, score }
    }
  }
  return best ? { resource: best.resource, path: best.path } : undefined
}

function dispatchPendingIncidents(state: SimulationState): void {
  const ordered = [...state.incidents].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    if (a.severity !== b.severity) return b.severity - a.severity
    return a.id.localeCompare(b.id)
  })
  for (const incident of ordered) {
    if (incident.status === 'resolved') continue
    const needed = requiredCapabilities(incident.type, incident.severity)
    const assigned = incident.assignedResourceIds
      .map((id) => state.resources.find((resource) => resource.id === id))
      .filter((resource): resource is ResourceUnit => Boolean(resource))
    const haveByType = new Map<ResourceType, number>()
    for (const resource of assigned) {
      haveByType.set(resource.type, (haveByType.get(resource.type) ?? 0) + 1)
    }
    const needByType = new Map<ResourceType, number>()
    for (const type of needed) needByType.set(type, (needByType.get(type) ?? 0) + 1)

    for (const [type, count] of needByType.entries()) {
      const missing = count - (haveByType.get(type) ?? 0)
      for (let i = 0; i < missing; i += 1) {
        const selection = chooseResource(
          state,
          incident,
          type,
          state.settings.assignmentStrategy,
          state.settings.pathAlgorithm,
        )
        if (!selection) break
        const { resource, path } = selection
        resource.status = path.path.length <= 1 ? 'working' : 'enroute'
        resource.incidentId = incident.id
        resource.path = path.path
        resource.segmentIndex = 0
        resource.segmentProgress = 0
        resource.routeDistance = routeDistance(state.city, path.path)
        resource.routeCost = path.cost
        resource.routeAlgorithm = state.settings.pathAlgorithm
        resource.dispatchCount += 1
        incident.assignedResourceIds.push(resource.id)
        incident.status = 'assigned'
        if (incident.dispatchAt === undefined) incident.dispatchAt = state.time
        addEvent(state, {
          time: state.time,
          kind: 'dispatch',
          title: `${RESOURCE_META[type].label} ${resource.label} 已派往现场`,
          detail: `${incident.title} · ${path.path.length} 个路网节点 · 预计 ${path.cost.toFixed(1)} 分钟到场`,
          tone: eventToneForIncident(incident.type),
          entityId: incident.id,
        })
      }
    }
  }
}

function arriveAtIncident(state: SimulationState, resource: ResourceUnit): void {
  resource.status = 'working'
  resource.path = [resource.nodeId]
  resource.segmentIndex = 0
  resource.segmentProgress = 0
  resource.arrivedAt = state.time
  if (!resource.incidentId) return
  const incident = state.incidents.find((candidate) => candidate.id === resource.incidentId)
  if (!incident) {
    resource.status = 'idle'
    resource.incidentId = undefined
    return
  }
  if (incident.responseAt === undefined) incident.responseAt = state.time
  const allArrived = incident.assignedResourceIds.every((id) => {
    const unit = state.resources.find((candidate) => candidate.id === id)
    return unit?.status === 'working'
  })
  if (allArrived) incident.status = 'responding'
  addEvent(state, {
    time: state.time,
    kind: 'arrival',
    title: `${resource.label} 抵达现场`,
    detail: `${incident.title} · 首车响应 ${(state.time - incident.createdAt).toFixed(0)} 分钟`,
    tone: 'info',
    entityId: incident.id,
  })
}

function moveResources(state: SimulationState, minutes: number): void {
  for (const resource of state.resources) {
    if (resource.status !== 'enroute') continue
    let budgetKm = (RESOURCE_META[resource.type].speed * minutes) / 60
    while (budgetKm > 1e-9 && resource.status === 'enroute') {
      if (resource.segmentIndex >= resource.path.length - 1) {
        arriveAtIncident(state, resource)
        break
      }
      const from = resource.path[resource.segmentIndex]
      const to = resource.path[resource.segmentIndex + 1]
      const edge = getEdgeBetween(state.city, from, to)
      if (!edge || edge.status === 'closed') {
        resource.status = 'blocked'
        addEvent(state, {
          time: state.time,
          kind: 'warning',
          title: `${resource.label} 路线受阻`,
          detail: '当前路段不可通行，等待指挥中心重新分配。',
          tone: 'warning',
          entityId: resource.id,
        })
        break
      }
      const segmentLength = Math.hypot(
        (state.city.nodes.find((node) => node.id === to)?.x ?? 0) -
          (state.city.nodes.find((node) => node.id === from)?.x ?? 0),
        (state.city.nodes.find((node) => node.id === to)?.y ?? 0) -
          (state.city.nodes.find((node) => node.id === from)?.y ?? 0),
      )
      const remaining = segmentLength - resource.segmentProgress
      if (budgetKm + 1e-9 < remaining) {
        resource.segmentProgress += budgetKm
        budgetKm = 0
      } else {
        budgetKm -= remaining
        resource.nodeId = to
        resource.segmentIndex += 1
        resource.segmentProgress = 0
        if (resource.segmentIndex >= resource.path.length - 1) {
          arriveAtIncident(state, resource)
          break
        }
      }
    }
  }
}

function resolveIncident(state: SimulationState, incident: IncidentTask): void {
  incident.status = 'resolved'
  incident.resolvedAt = state.time
  incident.workRemaining = 0
  for (const id of incident.assignedResourceIds) {
    const resource = state.resources.find((candidate) => candidate.id === id)
    if (!resource) continue
    resource.status = 'idle'
    resource.incidentId = undefined
    resource.path = [resource.nodeId]
    resource.segmentIndex = 0
    resource.segmentProgress = 0
  }
  addEvent(state, {
    time: state.time,
    kind: 'resolve',
    title: `${incident.title} 处置完成`,
    detail: `${incident.assignedResourceIds.length} 个智能体完成协同任务，累计用时 ${(state.time - incident.createdAt).toFixed(0)} 分钟。`,
    tone: 'success',
    entityId: incident.id,
  })
}

function processWork(state: SimulationState, minutes: number): void {
  for (const incident of state.incidents) {
    if (incident.status === 'resolved') continue
    const workers = state.resources.filter(
      (resource) => resource.incidentId === incident.id && resource.status === 'working',
    )
    if (workers.length === 0) continue
    incident.status = 'responding'
    const coordinationRate = 0.7 + Math.max(0, workers.length - 1) * 0.22
    incident.workRemaining = Math.max(0, incident.workRemaining - minutes * coordinationRate)
    incident.workMinutes += minutes
    if (incident.workRemaining <= 1e-9) resolveIncident(state, incident)
  }
}

function finalizePhase(state: SimulationState): void {
  if (state.incidents.length > 0 && state.incidents.every((incident) => incident.status === 'resolved')) {
    if (state.phase !== 'completed') {
      state.phase = 'completed'
      addEvent(state, {
        time: state.time,
        kind: 'system',
        title: '推演完成 · 进入复盘',
        detail: `全部 ${state.incidents.length} 起事件完成处置，可拖动时间轴回看调度全过程。`,
        tone: 'success',
      })
    }
    return
  }
  if (state.time >= state.settings.maxTimeMinutes) {
    if (state.phase !== 'timeout') {
      state.phase = 'timeout'
      addEvent(state, {
        time: state.time,
        kind: 'warning',
        title: '推演达到时间上限',
        detail: '仍有事件未完成，请调整资源或算法后重新推演。',
        tone: 'warning',
      })
    }
    return
  }
  state.phase = 'running'
}

export function advanceSimulation(state: SimulationState, minutes = state.settings.tickMinutes): SimulationState {
  if (state.phase === 'completed' || state.phase === 'timeout') return state
  const next = clone(state)
  next.time = Math.min(next.settings.maxTimeMinutes, next.time + minutes)
  for (const resource of next.resources) {
    if (resource.status === 'enroute' || resource.status === 'working') {
      resource.busyMinutes += minutes
    }
  }
  dispatchPendingIncidents(next)
  moveResources(next, minutes)
  processWork(next, minutes)
  dispatchPendingIncidents(next)
  finalizePhase(next)
  refreshMetrics(next)
  return next
}

export interface IncidentInput {
  type: IncidentType
  nodeId: string
  severity: 1 | 2 | 3
  title?: string
}

export function injectIncident(state: SimulationState, input: IncidentInput): SimulationState {
  const next = clone(state)
  let sequence = next.incidents.length + 1
  let id = `INC-${next.time.toFixed(0)}-${sequence}`
  while (next.incidents.some((incident) => incident.id === id)) {
    sequence += 1
    id = `INC-${next.time.toFixed(0)}-${sequence}`
  }
  const node = next.city.nodes.find((candidate) => candidate.id === input.nodeId)
  if (!node) return state
  const title = input.title ?? `${node.district}${INCIDENT_META[input.type].label}事件`
  const workRemaining = incidentWorkDuration(input.type, input.severity)
  next.incidents.push({
    id,
    type: input.type,
    title,
    nodeId: input.nodeId,
    severity: input.severity,
    createdAt: next.time,
    status: 'pending',
    assignedResourceIds: [],
    workRemaining,
    workMinutes: workRemaining,
  })
  addEvent(next, {
    time: next.time,
    kind: 'warning',
    title: `新事件注入 · ${INCIDENT_META[input.type].label}`,
    detail: `${title}，位于 ${node.label}（${node.district}），等级 ${input.severity}。`,
    tone: eventToneForIncident(input.type),
    entityId: id,
  })
  if (next.phase === 'completed' || next.phase === 'timeout') next.phase = 'running'
  refreshMetrics(next)
  return next
}

export function addResourceUnit(state: SimulationState, type: ResourceType, nodeId: string): SimulationState {
  const next = clone(state)
  const node = next.city.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return state
  const prefix = { ambulance: 'AMB', fire: 'FIRE', supply: 'SUP' }[type]
  const count = next.resources.filter((resource) => resource.type === type).length + 1
  let id = `${prefix}-${String(count).padStart(2, '0')}`
  while (next.resources.some((resource) => resource.id === id)) {
    id = `${prefix}-${String(Number(id.split('-')[1]) + 1).padStart(2, '0')}`
  }
  const resource: ResourceUnit = {
    id,
    label: `${RESOURCE_META[type].label} ${id}`,
    type,
    nodeId,
    status: 'idle',
    path: [nodeId],
    segmentIndex: 0,
    segmentProgress: 0,
    routeDistance: 0,
    routeCost: 0,
    routeAlgorithm: next.settings.pathAlgorithm,
    busyMinutes: 0,
    dispatchCount: 0,
    rerouteCount: 0,
  }
  next.resources.push(resource)
  addEvent(next, {
    time: next.time,
    kind: 'system',
    title: `${RESOURCE_META[type].label}部署完成`,
    detail: `${resource.label} 已部署至 ${node.label}（${node.district}）。`,
    tone: 'info',
    entityId: resource.id,
  })
  refreshMetrics(next)
  return next
}

function replanActiveResources(next: SimulationState, changedEdgeId: string, affectedResourceIds?: Set<string>): void {
  for (const resource of next.resources) {
    if (resource.status !== 'enroute' || !resource.incidentId) continue
    if (affectedResourceIds) {
      if (!affectedResourceIds.has(resource.id)) continue
    } else if (!pathEdgeIds(next.city, resource.path).includes(changedEdgeId)) {
      continue
    }
    const incident = next.incidents.find((candidate) => candidate.id === resource.incidentId)
    if (!incident) continue
    const previousSegments = resource.path.length
    const path = findPath(next.city, resource.nodeId, incident.nodeId, next.settings.pathAlgorithm)
    if (!path.feasible) {
      resource.status = 'blocked'
      addEvent(next, {
        time: next.time,
        kind: 'warning',
        title: `${resource.label} 无可达路线`,
        detail: '周边路网中断，智能体转入阻塞队列，等待新道路开放。',
        tone: 'warning',
        entityId: resource.id,
      })
      continue
    }
    resource.path = path.path
    resource.segmentIndex = 0
    resource.segmentProgress = 0
    resource.routeDistance = routeDistance(next.city, path.path)
    resource.routeCost = path.cost
    resource.routeAlgorithm = next.settings.pathAlgorithm
    resource.rerouteCount += 1
    addEvent(next, {
      time: next.time,
      kind: 'reroute',
      title: `${resource.label} 完成动态重规划`,
      detail: `原路线 ${previousSegments} 段，新路线 ${path.path.length} 段，预计 ${path.cost.toFixed(1)} 分钟到场。`,
      tone: 'success',
      entityId: resource.id,
    })
  }
}

export function setRoadStatus(
  state: SimulationState,
  edgeId: string,
  status: CityEdge['status'],
  reason = '人工路网编辑',
): SimulationState {
  const next = clone(state)
  const edge = next.city.edges.find((candidate) => candidate.id === edgeId)
  if (!edge || edge.status === status) return state
  edge.status = status
  addEvent(next, {
    time: next.time,
    kind: 'road',
    title: status === 'closed' ? '道路中断事件' : '道路恢复通行',
    detail: `${edge.name} · ${reason}`,
    tone: status === 'closed' ? 'warning' : 'info',
    entityId: edge.id,
  })
  if (status === 'closed') replanActiveResources(next, edgeId)
  refreshMetrics(next)
  return next
}

export function addRoad(state: SimulationState, from: string, to: string): SimulationState {
  if (from === to || getEdgeBetween(state.city, from, to)) return state
  const next = clone(state)
  if (!next.city.nodes.some((node) => node.id === from) || !next.city.nodes.some((node) => node.id === to)) {
    return state
  }
  let sequence = next.city.edges.length + 1
  let id = `R-ADD-${sequence}`
  while (next.city.edges.some((edge) => edge.id === id)) {
    sequence += 1
    id = `R-ADD-${sequence}`
  }
  next.city.edges.push({
    id,
    from,
    to,
    status: 'open',
    lanes: 2,
    speedLimit: 38,
    traffic: 1.06,
    name: `新建应急通道 ${sequence}`,
  })
  addEvent(next, {
    time: next.time,
    kind: 'road',
    title: '路网节点已连接',
    detail: `新增应急通道 ${from} → ${to}。`,
    tone: 'info',
    entityId: id,
  })
  refreshMetrics(next)
  return next
}

export function removeRoad(state: SimulationState, edgeId: string): SimulationState {
  const next = clone(state)
  const edge = next.city.edges.find((candidate) => candidate.id === edgeId)
  if (!edge) return state
  const affectedResourceIds = new Set(
    next.resources
      .filter((resource) => resource.status === 'enroute' && pathEdgeIds(next.city, resource.path).includes(edgeId))
      .map((resource) => resource.id),
  )
  next.city.edges = next.city.edges.filter((candidate) => candidate.id !== edgeId)
  addEvent(next, {
    time: next.time,
    kind: 'road',
    title: '道路从路网移除',
    detail: `${edge.name} 已删除。`,
    tone: 'warning',
    entityId: edge.id,
  })
  replanActiveResources(next, edgeId, affectedResourceIds)
  refreshMetrics(next)
  return next
}

export function updateSettings(
  state: SimulationState,
  patch: Partial<SimulationState['settings']>,
): SimulationState {
  const next = clone(state)
  next.settings = { ...next.settings, ...patch }
  refreshMetrics(next)
  return next
}

export function compareAlgorithms(state: SimulationState, incidentId?: string): AlgorithmComparison[] {
  const incident =
    state.incidents.find((candidate) => candidate.id === incidentId) ??
    state.incidents.find((candidate) => candidate.status !== 'resolved') ??
    state.incidents[0]
  if (!incident) return []
  const rows: AlgorithmComparison[] = []
  for (const algorithm of ['astar', 'dijkstra'] as PathAlgorithm[]) {
    for (const strategy of ['nearest', 'balanced'] as AssignmentStrategy[]) {
      const candidates = state.resources.filter((resource) => resource.type !== 'supply' || incident.type === 'fire' || incident.type === 'flood')
      let selected: ResourceUnit | undefined
      let selectedPath = findPath(state.city, '', '', algorithm)
      let score = Infinity
      for (const resource of candidates) {
        if (!requiredCapabilities(incident.type, incident.severity).includes(resource.type)) continue
        const path = findPath(state.city, resource.nodeId, incident.nodeId, algorithm)
        if (!path.feasible) continue
        const candidateScore = path.cost + (strategy === 'balanced' ? resource.dispatchCount * 1.6 : 0)
        if (candidateScore < score - 1e-9) {
          score = candidateScore
          selected = resource
          selectedPath = path
        }
      }
      rows.push({
        id: `${algorithm}-${strategy}`,
        algorithm,
        strategy,
        resourceId: selected?.id ?? '-',
        resourceLabel: selected?.label ?? '暂无可达资源',
        path: selectedPath.path,
        distance: selectedPath.distance,
        etaMinutes: Number.isFinite(selectedPath.cost) ? round(selectedPath.cost) : 0,
        exploredNodes: selectedPath.exploredNodes,
        feasible: selectedPath.feasible,
      })
    }
  }
  return rows
}

export function resetPhase(state: SimulationState, phase: SimulationState['phase']): SimulationState {
  return { ...state, phase }
}
