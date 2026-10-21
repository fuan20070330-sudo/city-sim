import { describe, expect, it } from 'vitest'
import { createDefaultScenario } from '../src/data/defaultScenario'
import { addResourceUnit, addRoad, advanceSimulation, compareAlgorithms, createInitialState, injectIncident, removeRoad, setRoadStatus } from '../src/engine/engine'
import { findPath, pathEdgeIds } from '../src/engine/graph'
import { scenarioFromState, validateScenario } from '../src/lib/scenario'

describe('graph routing', () => {
  it('returns the same optimal travel cost with Dijkstra and A*', () => {
    const city = createDefaultScenario().city
    const start = 'N-0-0'
    const goal = 'N-8-6'
    const dijkstra = findPath(city, start, goal, 'dijkstra')
    const astar = findPath(city, start, goal, 'astar')

    expect(dijkstra.feasible).toBe(true)
    expect(astar.feasible).toBe(true)
    expect(astar.cost).toBeCloseTo(dijkstra.cost, 8)
    expect(astar.path[0]).toBe(start)
    expect(astar.path.at(-1)).toBe(goal)
    expect(astar.exploredNodes).toBeLessThanOrEqual(dijkstra.exploredNodes)
  })

  it('avoids a closed direct road and chooses a reachable detour', () => {
    const scenario = createDefaultScenario()
    const directEdge = scenario.city.edges.find(
      (edge) => edge.from === 'N-0-0' && edge.to === 'N-1-0',
    )
    expect(directEdge).toBeDefined()
    directEdge!.status = 'closed'

    const route = findPath(scenario.city, 'N-0-0', 'N-1-0', 'astar')
    expect(route.feasible).toBe(true)
    expect(route.path.length).toBeGreaterThan(2)
    expect(pathEdgeIds(scenario.city, route.path)).not.toContain(directEdge!.id)
  })
})

describe('multi-agent simulation', () => {
  it('assigns a coordinated firefighting package and a medical unit', () => {
    const state = advanceSimulation(createInitialState(createDefaultScenario()), 1)
    const fire = state.incidents.find((incident) => incident.type === 'fire')!
    const medical = state.incidents.find((incident) => incident.type === 'medical')!
    const fireUnits = state.resources.filter((resource) => fire.assignedResourceIds.includes(resource.id))
    const medicalUnits = state.resources.filter((resource) => medical.assignedResourceIds.includes(resource.id))

    expect(fireUnits.filter((resource) => resource.type === 'fire')).toHaveLength(2)
    expect(fireUnits.filter((resource) => resource.type === 'supply')).toHaveLength(1)
    expect(medicalUnits).toHaveLength(1)
    expect(medicalUnits[0].type).toBe('ambulance')
    expect(state.events.filter((event) => event.kind === 'dispatch')).toHaveLength(4)
  })

  it('is deterministic for the same scenario and action sequence', () => {
    const run = () => {
      let state = createInitialState(createDefaultScenario())
      for (let index = 0; index < 14; index += 1) state = advanceSimulation(state)
      const active = state.resources.find((resource) => resource.status === 'enroute' && resource.path.length > 2)
      if (active) {
        const edge = pathEdgeIds(state.city, active.path)[1]
        if (edge) state = setRoadStatus(state, edge, 'closed', '确定性测试')
      }
      for (let index = 0; index < 6; index += 1) state = advanceSimulation(state)
      return state
    }

    expect(run()).toEqual(run())
  })

  it('replans an active route when a road closes', () => {
    let state = advanceSimulation(createInitialState(createDefaultScenario()), 2)
    const active = state.resources.find((resource) => resource.status === 'enroute' && resource.path.length > 3)!
    const edgeId = pathEdgeIds(state.city, active.path)[2]
    expect(active).toBeDefined()
    expect(edgeId).toBeDefined()

    const next = setRoadStatus(state, edgeId, 'closed', '测试断路')
    const rerouted = next.resources.find((resource) => resource.id === active.id)!

    expect(next.city.edges.find((edge) => edge.id === edgeId)?.status).toBe('closed')
    expect(rerouted.rerouteCount).toBe(1)
    expect(pathEdgeIds(next.city, rerouted.path)).not.toContain(edgeId)
    expect(next.events.some((event) => event.kind === 'reroute')).toBe(true)
    expect(next.metrics.congestionPercent).toBeGreaterThanOrEqual(state.metrics.congestionPercent)
  })

  it('replans active vehicles when an active road is removed', () => {
    let state = advanceSimulation(createInitialState(createDefaultScenario()), 2)
    const active = state.resources.find((resource) => resource.status === 'enroute' && resource.path.length > 3)!
    const edgeId = pathEdgeIds(state.city, active.path)[1]
    const next = removeRoad(state, edgeId)
    const rerouted = next.resources.find((resource) => resource.id === active.id)!
    expect(next.city.edges.some((edge) => edge.id === edgeId)).toBe(false)
    expect(rerouted.rerouteCount).toBe(1)
    expect(next.events.some((event) => event.kind === 'reroute')).toBe(true)
  })

  it('supports event injection, resource deployment and road creation', () => {
    let state = createInitialState(createDefaultScenario())
    state = injectIncident(state, { type: 'flood', nodeId: 'N-6-1', severity: 2 })
    state = addResourceUnit(state, 'supply', 'N-1-1')
    state = addRoad(state, 'N-0-0', 'N-1-1')

    expect(state.incidents).toHaveLength(3)
    expect(state.resources).toHaveLength(8)
    expect(state.city.edges.some((edge) => edge.from === 'N-0-0' && edge.to === 'N-1-1')).toBe(true)
    expect(state.metrics.totalIncidents).toBe(3)
  })

  it('produces four deterministic comparison rows', () => {
    const rows = compareAlgorithms(createInitialState(createDefaultScenario()))
    expect(rows).toHaveLength(4)
    expect(rows.every((row) => row.feasible)).toBe(true)
    expect(new Set(rows.map((row) => row.id)).size).toBe(4)
    expect(rows.map((row) => row.algorithm)).toEqual(['astar', 'astar', 'dijkstra', 'dijkstra'])
  })

  it('round-trips a simulation state into a valid scenario file', () => {
    const state = advanceSimulation(createInitialState(createDefaultScenario()), 3)
    const scenario = scenarioFromState(state)
    const validated = validateScenario(JSON.parse(JSON.stringify(scenario)))
    expect(validated.name).toBe(scenario.name)
    expect(validated.city.edges).toHaveLength(scenario.city.edges.length)
    expect(validated.resources).toHaveLength(scenario.resources.length)
  })

  it('rejects a scenario with a resource outside the road network', () => {
    const scenario = scenarioFromState(createInitialState(createDefaultScenario()))
    scenario.resources[0].nodeId = 'MISSING-NODE'
    expect(() => validateScenario(scenario)).toThrow('资源部署位置不在当前路网中')
  })
})
