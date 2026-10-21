/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse } from './protocol'
import {
  addResourceUnit,
  addRoad,
  advanceSimulation,
  compareAlgorithms,
  injectIncident,
  removeRoad,
  setRoadStatus,
  updateSettings,
} from '../engine/engine'

const workerScope = self as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  try {
    let response: WorkerResponse
    switch (request.type) {
      case 'tick':
        response = { id: request.id, ok: true, state: advanceSimulation(request.state, request.minutes) }
        break
      case 'inject-incident':
        response = { id: request.id, ok: true, state: injectIncident(request.state, request.input) }
        break
      case 'add-resource':
        response = {
          id: request.id,
          ok: true,
          state: addResourceUnit(request.state, request.resourceType, request.nodeId),
        }
        break
      case 'set-road':
        response = {
          id: request.id,
          ok: true,
          state: setRoadStatus(request.state, request.edgeId, request.status, request.reason),
        }
        break
      case 'add-road':
        response = { id: request.id, ok: true, state: addRoad(request.state, request.from, request.to) }
        break
      case 'remove-road':
        response = { id: request.id, ok: true, state: removeRoad(request.state, request.edgeId) }
        break
      case 'settings':
        response = { id: request.id, ok: true, state: updateSettings(request.state, request.patch) }
        break
      case 'compare':
        response = {
          id: request.id,
          ok: true,
          comparisons: compareAlgorithms(request.state, request.incidentId),
        }
        break
      default:
        throw new Error('未知 Worker 指令')
    }
    workerScope.postMessage(response)
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : '仿真 Worker 执行失败',
    } satisfies WorkerResponse)
  }
}
