import type {
  CityEdge,
  CityNetwork,
  CityNode,
  CityScenario,
  CityZone,
  IncidentSeed,
  ResourceSeed,
} from '../types'

const COLS = 13
const ROWS = 9
const X_STEP = 1.02
const Y_STEP = 0.94
const X_ORIGIN = 1
const Y_ORIGIN = 1

function districtFor(col: number, row: number): string {
  if (col >= 7 && row <= 3) return '滨江商务区'
  if (col >= 7) return '滨江生态带'
  if (row <= 3) return '科创智造园'
  return '老城生活区'
}

function buildNodes(): CityNode[] {
  const nodes: CityNode[] = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      nodes.push({
        id: `N-${col}-${row}`,
        label: `${String.fromCharCode(65 + row)}${String(col + 1).padStart(2, '0')}`,
        x: X_ORIGIN + col * X_STEP,
        y: Y_ORIGIN + row * Y_STEP,
        district: districtFor(col, row),
      })
    }
  }
  return nodes
}

function buildEdges(): CityEdge[] {
  const edges: CityEdge[] = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS - 1; col += 1) {
      const arterial = row === 3 || row === 6 || col === 5 || col === 9
      edges.push({
        id: `R-H-${row}-${col}`,
        from: `N-${col}-${row}`,
        to: `N-${col + 1}-${row}`,
        status: 'open',
        lanes: arterial ? 3 : 2,
        speedLimit: arterial ? 52 : 36,
        traffic: 0.98 + ((row * 7 + col * 3) % 19) / 100,
        name: `${String.fromCharCode(65 + row)}${col + 1}—${String.fromCharCode(65 + row)}${col + 2}`,
      })
    }
  }
  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row < ROWS - 1; row += 1) {
      const arterial = col === 4 || col === 8
      edges.push({
        id: `R-V-${col}-${row}`,
        from: `N-${col}-${row}`,
        to: `N-${col}-${row + 1}`,
        status: 'open',
        lanes: arterial ? 3 : 2,
        speedLimit: arterial ? 48 : 34,
        traffic: 1 + ((col * 5 + row * 11) % 22) / 100,
        name: `${col + 1}号纵路 ${row + 1}—${row + 2}`,
      })
    }
  }
  edges.push(
    {
      id: 'R-X-01',
      from: 'N-1-1',
      to: 'N-4-3',
      status: 'open',
      lanes: 3,
      speedLimit: 62,
      traffic: 0.89,
      name: '科创快速路',
    },
    {
      id: 'R-X-02',
      from: 'N-10-5',
      to: 'N-8-7',
      status: 'open',
      lanes: 3,
      speedLimit: 58,
      traffic: 0.93,
      name: '滨江联络线',
    },
    {
      id: 'R-X-03',
      from: 'N-5-7',
      to: 'N-7-4',
      status: 'open',
      lanes: 2,
      speedLimit: 46,
      traffic: 1.04,
      name: '老城联络通道',
    },
  )
  return edges
}

const zones: CityZone[] = [
  { id: 'Z-01', name: '科创智造园', x: 0.7, y: 0.7, width: 6.6, height: 4.25, kind: 'innovation' },
  { id: 'Z-02', name: '滨江商务区', x: 7.25, y: 0.7, width: 6.6, height: 4.25, kind: 'business' },
  { id: 'Z-03', name: '老城生活区', x: 0.7, y: 5.2, width: 6.6, height: 4.05, kind: 'residential' },
  { id: 'Z-04', name: '滨江生态带', x: 7.25, y: 5.2, width: 6.6, height: 4.05, kind: 'waterfront' },
]

const resources: ResourceSeed[] = [
  { id: 'FIRE-01', label: '滨江消防一号', type: 'fire', nodeId: 'N-2-2' },
  { id: 'FIRE-02', label: '科创消防二号', type: 'fire', nodeId: 'N-10-6' },
  { id: 'AMB-01', label: '老城救护一号', type: 'ambulance', nodeId: 'N-3-6' },
  { id: 'AMB-02', label: '商务救护二号', type: 'ambulance', nodeId: 'N-8-2' },
  { id: 'AMB-03', label: '机动救护三号', type: 'ambulance', nodeId: 'N-6-5' },
  { id: 'SUP-01', label: '北区物资车', type: 'supply', nodeId: 'N-1-5' },
  { id: 'SUP-02', label: '滨江物资车', type: 'supply', nodeId: 'N-9-1' },
]

const incidents: IncidentSeed[] = [
  {
    id: 'INC-DEMO-FIRE',
    type: 'fire',
    title: '滨江智慧物流园火情',
    nodeId: 'N-8-4',
    severity: 3,
    createdAt: 0,
  },
  {
    id: 'INC-DEMO-MED',
    type: 'medical',
    title: '老城社区人员急救',
    nodeId: 'N-4-2',
    severity: 2,
    createdAt: 0,
  },
]

export function createDefaultScenario(): CityScenario {
  const city: CityNetwork = {
    name: '滨江核心区',
    width: 14.7,
    height: 10.2,
    nodes: buildNodes(),
    edges: buildEdges(),
    zones: structuredClone(zones),
  }
  return {
    version: 1,
    id: 'riverfront-fire-response',
    name: '滨江核心区 · 火灾链式响应',
    description: '双事件并发条件下，验证多智能体协同派车、断路重规划与应急资源调度。',
    objective: '8 分钟内完成首车到场，15 分钟内控制核心火情，并维持全城应急覆盖率不低于 70%。',
    city,
    resources: structuredClone(resources),
    incidents: structuredClone(incidents),
    settings: {
      tickMinutes: 1,
      maxTimeMinutes: 60,
      targetResponseMinutes: 8,
      pathAlgorithm: 'astar',
      assignmentStrategy: 'balanced',
      startTime: '08:30',
    },
  }
}

export const defaultScenario = createDefaultScenario()
