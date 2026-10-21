export type NodeId = string
export type EdgeId = string
export type ResourceType = 'ambulance' | 'fire' | 'supply'
export type IncidentType = 'fire' | 'medical' | 'flood'
export type RoadStatus = 'open' | 'closed'
export type ResourceStatus = 'idle' | 'enroute' | 'working' | 'blocked'
export type IncidentStatus = 'pending' | 'assigned' | 'responding' | 'resolved'
export type SimulationPhase = 'ready' | 'running' | 'paused' | 'completed' | 'timeout'
export type PathAlgorithm = 'astar' | 'dijkstra'
export type AssignmentStrategy = 'nearest' | 'balanced'
export type EventTone = 'info' | 'warning' | 'critical' | 'success'
export type ZoneKind = 'business' | 'residential' | 'innovation' | 'waterfront'
export type MapTool = 'select' | 'incident' | 'ambulance' | 'fire' | 'supply' | 'road'

export interface CityNode {
  id: NodeId
  label: string
  x: number
  y: number
  district: string
}

export interface CityEdge {
  id: EdgeId
  from: NodeId
  to: NodeId
  status: RoadStatus
  lanes: number
  speedLimit: number
  traffic: number
  name: string
}

export interface CityZone {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  kind: ZoneKind
}

export interface CityNetwork {
  name: string
  width: number
  height: number
  nodes: CityNode[]
  edges: CityEdge[]
  zones: CityZone[]
}

export interface ResourceSeed {
  id: string
  label: string
  type: ResourceType
  nodeId: NodeId
}

export interface IncidentSeed {
  id: string
  type: IncidentType
  title: string
  nodeId: NodeId
  severity: 1 | 2 | 3
  createdAt: number
}

export interface ScenarioSettings {
  tickMinutes: number
  maxTimeMinutes: number
  targetResponseMinutes: number
  pathAlgorithm: PathAlgorithm
  assignmentStrategy: AssignmentStrategy
  startTime: string
}

export interface CityScenario {
  version: 1
  id: string
  name: string
  description: string
  objective: string
  city: CityNetwork
  resources: ResourceSeed[]
  incidents: IncidentSeed[]
  settings: ScenarioSettings
}

export interface SimulationRoute {
  path: NodeId[]
  distance: number
  cost: number
  algorithm: PathAlgorithm
  exploredNodes: number
}

export interface ResourceUnit extends ResourceSeed {
  status: ResourceStatus
  path: NodeId[]
  segmentIndex: number
  segmentProgress: number
  routeDistance: number
  routeCost: number
  routeAlgorithm: PathAlgorithm
  incidentId?: string
  busyMinutes: number
  dispatchCount: number
  rerouteCount: number
  arrivedAt?: number
}

export interface IncidentTask extends IncidentSeed {
  status: IncidentStatus
  dispatchAt?: number
  responseAt?: number
  resolvedAt?: number
  assignedResourceIds: string[]
  workRemaining: number
  workMinutes: number
}

export interface SimulationEvent {
  id: string
  time: number
  kind: 'system' | 'dispatch' | 'arrival' | 'road' | 'reroute' | 'resolve' | 'warning'
  title: string
  detail: string
  tone: EventTone
  entityId?: string
}

export interface SimulationMetrics {
  avgResponseMinutes: number
  coveragePercent: number
  congestionPercent: number
  utilizationPercent: number
  resolvedCount: number
  totalIncidents: number
  activeUnits: number
  totalUnits: number
  roadClosures: number
}

export interface SimulationState {
  scenarioId: string
  scenarioName: string
  description: string
  objective: string
  time: number
  phase: SimulationPhase
  city: CityNetwork
  resources: ResourceUnit[]
  incidents: IncidentTask[]
  events: SimulationEvent[]
  metrics: SimulationMetrics
  settings: ScenarioSettings
}

export interface AlgorithmComparison {
  id: string
  algorithm: PathAlgorithm
  strategy: AssignmentStrategy
  resourceId: string
  resourceLabel: string
  path: NodeId[]
  distance: number
  etaMinutes: number
  exploredNodes: number
  feasible: boolean
}

export interface PathResult {
  path: NodeId[]
  distance: number
  cost: number
  exploredNodes: number
  feasible: boolean
}

export type IncidentMeta = {
  label: string
  short: string
  color: string
  capabilities: ResourceType[]
}

export const INCIDENT_META: Record<IncidentType, IncidentMeta> = {
  fire: { label: '火灾', short: '火', color: '#ff655f', capabilities: ['fire', 'supply'] },
  medical: { label: '医疗急救', short: '医', color: '#56d9ff', capabilities: ['ambulance'] },
  flood: { label: '城市内涝', short: '汛', color: '#f3b94d', capabilities: ['supply', 'ambulance'] },
}

export const RESOURCE_META: Record<ResourceType, { label: string; short: string; color: string; speed: number }> = {
  ambulance: { label: '救护车', short: '救', color: '#55dbff', speed: 52 },
  fire: { label: '消防车', short: '消', color: '#ff776d', speed: 42 },
  supply: { label: '物资车', short: '物', color: '#ffc45b', speed: 38 },
}

export const PHASE_LABEL: Record<SimulationPhase, string> = {
  ready: '待命',
  running: '推演中',
  paused: '已暂停',
  completed: '已完成',
  timeout: '已超时',
}

export function requiredCapabilities(type: IncidentType, severity: number): ResourceType[] {
  if (type === 'medical') return ['ambulance']
  if (type === 'flood') return ['supply', 'ambulance']
  return severity >= 3 ? ['fire', 'fire', 'supply'] : ['fire', 'supply']
}

export function emptyMetrics(): SimulationMetrics {
  return {
    avgResponseMinutes: 0,
    coveragePercent: 0,
    congestionPercent: 0,
    utilizationPercent: 0,
    resolvedCount: 0,
    totalIncidents: 0,
    activeUnits: 0,
    totalUnits: 0,
    roadClosures: 0,
  }
}
