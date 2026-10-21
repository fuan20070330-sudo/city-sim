import type { AlgorithmComparison, SimulationState } from '../types'
import type { IncidentInput } from '../engine/engine'
import type { ResourceType } from '../types'

export type WorkerRequest =
  | { id: number; type: 'tick'; state: SimulationState; minutes: number }
  | { id: number; type: 'inject-incident'; state: SimulationState; input: IncidentInput }
  | { id: number; type: 'add-resource'; state: SimulationState; resourceType: ResourceType; nodeId: string }
  | { id: number; type: 'set-road'; state: SimulationState; edgeId: string; status: 'open' | 'closed'; reason?: string }
  | { id: number; type: 'add-road'; state: SimulationState; from: string; to: string }
  | { id: number; type: 'remove-road'; state: SimulationState; edgeId: string }
  | { id: number; type: 'settings'; state: SimulationState; patch: Partial<SimulationState['settings']> }
  | { id: number; type: 'compare'; state: SimulationState; incidentId?: string }

export interface WorkerSuccess {
  id: number
  ok: true
  state?: SimulationState
  comparisons?: AlgorithmComparison[]
}

export interface WorkerFailure {
  id: number
  ok: false
  error: string
  state?: SimulationState
  comparisons?: AlgorithmComparison[]
}

export type WorkerResponse = WorkerSuccess | WorkerFailure
