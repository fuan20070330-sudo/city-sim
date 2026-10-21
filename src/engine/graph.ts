import type {
  CityEdge,
  CityNetwork,
  EdgeId,
  NodeId,
  PathAlgorithm,
  PathResult,
} from '../types'

const EPSILON = 1e-9

class MinHeap<T> {
  private items: T[] = []

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.items.length
  }

  push(value: T): void {
    this.items.push(value)
    let index = this.items.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.compare(this.items[parent], value) <= 0) break
      this.items[index] = this.items[parent]
      index = parent
    }
    this.items[index] = value
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined
    const root = this.items[0]
    const last = this.items.pop()
    if (last === undefined || this.items.length === 0) return root
    let index = 0
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      if (left >= this.items.length) break
      let child = left
      if (right < this.items.length && this.compare(this.items[right], this.items[left]) < 0) {
        child = right
      }
      if (this.compare(last, this.items[child]) <= 0) break
      this.items[index] = this.items[child]
      index = child
    }
    this.items[index] = last
    return root
  }
}

export function nodeDistance(city: CityNetwork, a: NodeId, b: NodeId): number {
  const from = city.nodes.find((node) => node.id === a)
  const to = city.nodes.find((node) => node.id === b)
  if (!from || !to) return 0
  return Math.hypot(from.x - to.x, from.y - to.y)
}

export function edgeLength(city: CityNetwork, edge: CityEdge): number {
  return nodeDistance(city, edge.from, edge.to)
}

export function edgeTravelCost(city: CityNetwork, edge: CityEdge): number {
  const minutes = (edgeLength(city, edge) / edge.speedLimit) * 60 * edge.traffic
  const lanePenalty = edge.lanes <= 1 ? 1.12 : 1
  return minutes * lanePenalty
}

function buildAdjacency(city: CityNetwork): Map<NodeId, Array<{ edge: CityEdge; to: NodeId }>> {
  const adjacency = new Map<NodeId, Array<{ edge: CityEdge; to: NodeId }>>()
  for (const node of city.nodes) adjacency.set(node.id, [])
  for (const edge of city.edges) {
    if (edge.status !== 'open') continue
    adjacency.get(edge.from)?.push({ edge, to: edge.to })
    adjacency.get(edge.to)?.push({ edge, to: edge.from })
  }
  return adjacency
}

function heuristic(city: CityNetwork, from: NodeId, to: NodeId): number {
  // Maximum emergency speed is below 80 km/h, so this heuristic remains admissible.
  return (nodeDistance(city, from, to) / 80) * 60
}

export function findPath(
  city: CityNetwork,
  start: NodeId,
  goal: NodeId,
  algorithm: PathAlgorithm = 'astar',
): PathResult {
  if (start === goal) {
    return { path: [start], distance: 0, cost: 0, exploredNodes: 1, feasible: true }
  }
  if (!city.nodes.some((node) => node.id === start) || !city.nodes.some((node) => node.id === goal)) {
    return { path: [], distance: 0, cost: Infinity, exploredNodes: 0, feasible: false }
  }

  const adjacency = buildAdjacency(city)
  const gScore = new Map<NodeId, number>([[start, 0]])
  const edgeDistance = new Map<NodeId, number>([[start, 0]])
  const previous = new Map<NodeId, NodeId>()
  const closed = new Set<NodeId>()
  let exploredNodes = 0

  const open = new MinHeap<{ id: NodeId; f: number; g: number; h: number }>((a, b) => {
    if (Math.abs(a.f - b.f) > EPSILON) return a.f - b.f
    if (Math.abs(a.h - b.h) > EPSILON) return a.h - b.h
    return a.id.localeCompare(b.id)
  })
  const hStart = algorithm === 'astar' ? heuristic(city, start, goal) : 0
  open.push({ id: start, f: hStart, g: 0, h: hStart })

  while (open.size > 0) {
    const current = open.pop()
    if (!current || closed.has(current.id)) continue
    closed.add(current.id)
    exploredNodes += 1

    if (current.id === goal) {
      const path: NodeId[] = [goal]
      let cursor = goal
      while (cursor !== start) {
        const parent = previous.get(cursor)
        if (!parent) return { path: [], distance: 0, cost: Infinity, exploredNodes, feasible: false }
        path.unshift(parent)
        cursor = parent
      }
      return {
        path,
        distance: edgeDistance.get(goal) ?? 0,
        cost: gScore.get(goal) ?? Infinity,
        exploredNodes,
        feasible: true,
      }
    }

    for (const neighbor of adjacency.get(current.id) ?? []) {
      if (closed.has(neighbor.to)) continue
      const tentative = current.g + edgeTravelCost(city, neighbor.edge)
      const known = gScore.get(neighbor.to) ?? Infinity
      if (tentative + EPSILON >= known) continue
      gScore.set(neighbor.to, tentative)
      edgeDistance.set(neighbor.to, (edgeDistance.get(current.id) ?? 0) + edgeLength(city, neighbor.edge))
      previous.set(neighbor.to, current.id)
      const h = algorithm === 'astar' ? heuristic(city, neighbor.to, goal) : 0
      open.push({ id: neighbor.to, f: tentative + h, g: tentative, h })
    }
  }

  return { path: [], distance: 0, cost: Infinity, exploredNodes, feasible: false }
}

export function pathEdgeIds(city: CityNetwork, path: NodeId[]): EdgeId[] {
  const ids: EdgeId[] = []
  for (let i = 0; i < path.length - 1; i += 1) {
    const edge = city.edges.find(
      (candidate) =>
        (candidate.from === path[i] && candidate.to === path[i + 1]) ||
        (candidate.to === path[i] && candidate.from === path[i + 1]),
    )
    if (edge) ids.push(edge.id)
  }
  return ids
}

export function getEdgeBetween(city: CityNetwork, a: NodeId, b: NodeId): CityEdge | undefined {
  return city.edges.find(
    (edge) => (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a),
  )
}

export function nearestNode(city: CityNetwork, x: number, y: number, maxDistance = Infinity): CityNetwork['nodes'][number] | undefined {
  let best: CityNetwork['nodes'][number] | undefined
  let bestDistance = maxDistance
  for (const node of city.nodes) {
    const distance = Math.hypot(node.x - x, node.y - y)
    if (distance < bestDistance) {
      bestDistance = distance
      best = node
    }
  }
  return best
}

export function closestEdge(city: CityNetwork, x: number, y: number, tolerance = 0.28): CityEdge | undefined {
  let best: CityEdge | undefined
  let bestDistance = tolerance
  for (const edge of city.edges) {
    const from = city.nodes.find((node) => node.id === edge.from)
    const to = city.nodes.find((node) => node.id === edge.to)
    if (!from || !to) continue
    const dx = to.x - from.x
    const dy = to.y - from.y
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared === 0) continue
    const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / lengthSquared))
    const px = from.x + t * dx
    const py = from.y + t * dy
    const distance = Math.hypot(x - px, y - py)
    if (distance < bestDistance) {
      bestDistance = distance
      best = edge
    }
  }
  return best
}

export function computeCoverage(city: CityNetwork, sources: NodeId[], thresholdMinutes: number): number {
  if (sources.length === 0 || city.nodes.length === 0) return 0
  const adjacency = buildAdjacency(city)
  const distances = new Map<NodeId, number>()
  const queue = new MinHeap<{ id: NodeId; distance: number }>((a, b) => {
    if (Math.abs(a.distance - b.distance) > EPSILON) return a.distance - b.distance
    return a.id.localeCompare(b.id)
  })
  for (const source of sources) {
    if (distances.has(source)) continue
    distances.set(source, 0)
    queue.push({ id: source, distance: 0 })
  }
  while (queue.size > 0) {
    const current = queue.pop()
    if (!current || current.distance > (distances.get(current.id) ?? Infinity) + EPSILON) continue
    for (const neighbor of adjacency.get(current.id) ?? []) {
      const next = current.distance + edgeTravelCost(city, neighbor.edge)
      if (next + EPSILON < (distances.get(neighbor.to) ?? Infinity)) {
        distances.set(neighbor.to, next)
        queue.push({ id: neighbor.to, distance: next })
      }
    }
  }
  const covered = city.nodes.filter((node) => (distances.get(node.id) ?? Infinity) <= thresholdMinutes).length
  return (covered / city.nodes.length) * 100
}

export function routeDistance(city: CityNetwork, path: NodeId[]): number {
  let total = 0
  for (let i = 0; i < path.length - 1; i += 1) {
    total += nodeDistance(city, path[i], path[i + 1])
  }
  return total
}

export function pickRouteDisruptionEdge(city: CityNetwork, path: NodeId[]): EdgeId | undefined {
  const edges = pathEdgeIds(city, path)
  if (edges.length === 0) return undefined
  return edges[Math.floor(edges.length / 2)]
}
