import type { CityScenario, IncidentType, ResourceType, SimulationState } from '../types'

const STORAGE_KEY = 'city-sim.scenarios.v1'

export interface SavedScenarioRecord {
  savedAt: string
  scenario: CityScenario
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function scenarioFromState(state: SimulationState): CityScenario {
  return {
    version: 1,
    id: state.scenarioId,
    name: state.scenarioName,
    description: state.description,
    objective: state.objective,
    city: structuredClone(state.city),
    resources: state.resources.map((resource) => ({
      id: resource.id,
      label: resource.label,
      type: resource.type,
      nodeId: resource.nodeId,
    })),
    incidents: state.incidents.map((incident) => ({
      id: incident.id,
      type: incident.type,
      title: incident.title,
      nodeId: incident.nodeId,
      severity: incident.severity,
      createdAt: 0,
    })),
    settings: structuredClone(state.settings),
  }
}

export function validateScenario(value: unknown): CityScenario {
  if (!isRecord(value) || value.version !== 1) throw new Error('场景格式版本不受支持')
  if (typeof value.name !== 'string' || !isRecord(value.city)) throw new Error('场景缺少名称或城市路网')
  const city = value.city
  if (
    !Array.isArray(city.nodes) ||
    !Array.isArray(city.edges) ||
    !Array.isArray(city.zones) ||
    city.nodes.length === 0
  ) {
    throw new Error('城市路网数据不完整')
  }
  if (!Array.isArray(value.resources) || !Array.isArray(value.incidents) || !isRecord(value.settings)) {
    throw new Error('场景资源、事件或参数不完整')
  }
  const nodeIds = new Set(
    city.nodes
      .filter(isRecord)
      .map((node) => node.id)
      .filter((id): id is string => typeof id === 'string'),
  )
  if (nodeIds.size !== city.nodes.length) throw new Error('路网节点 ID 无效或重复')
  for (const resource of value.resources) {
    if (!isRecord(resource) || !nodeIds.has(String(resource.nodeId))) {
      throw new Error('资源部署位置不在当前路网中')
    }
  }
  for (const incident of value.incidents) {
    if (!isRecord(incident) || !nodeIds.has(String(incident.nodeId))) {
      throw new Error('事件位置不在当前路网中')
    }
  }
  return structuredClone(value) as unknown as CityScenario
}

export function listSavedScenarios(): SavedScenarioRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((record): record is SavedScenarioRecord => {
        if (!isRecord(record) || typeof record.savedAt !== 'string') return false
        try {
          validateScenario(record.scenario)
          return true
        } catch {
          return false
        }
      })
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  } catch {
    return []
  }
}

export function saveScenario(scenario: CityScenario): SavedScenarioRecord[] {
  const validated = validateScenario(scenario)
  const records = listSavedScenarios().filter((record) => record.scenario.id !== validated.id)
  const next = [{ savedAt: new Date().toISOString(), scenario: validated }, ...records].slice(0, 20)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function deleteSavedScenario(id: string): SavedScenarioRecord[] {
  const next = listSavedScenarios().filter((record) => record.scenario.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function downloadScenario(scenario: CityScenario): void {
  const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `city-sim-${scenario.id}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function parseScenarioFile(text: string): CityScenario {
  return validateScenario(JSON.parse(text) as unknown)
}

export function scenarioCounts(scenario: CityScenario): {
  nodes: number
  roads: number
  resources: Record<ResourceType, number>
  incidents: Record<IncidentType, number>
} {
  const resources: Record<ResourceType, number> = { ambulance: 0, fire: 0, supply: 0 }
  const incidents: Record<IncidentType, number> = { fire: 0, medical: 0, flood: 0 }
  for (const resource of scenario.resources) resources[resource.type] += 1
  for (const incident of scenario.incidents) incidents[incident.type] += 1
  return { nodes: scenario.city.nodes.length, roads: scenario.city.edges.length, resources, incidents }
}
