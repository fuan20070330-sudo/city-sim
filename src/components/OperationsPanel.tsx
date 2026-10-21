import { useState } from 'react'
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  GitCompareArrows,
  Layers3,
  ListTodo,
  MapPin,
  Radio,
  Route,
  ScanSearch,
  SlidersHorizontal,
  Siren,
  Truck,
  Zap,
} from 'lucide-react'
import type {
  AlgorithmComparison,
  AssignmentStrategy,
  IncidentStatus,
  PathAlgorithm,
  SimulationState,
} from '../types'
import { INCIDENT_META, RESOURCE_META, requiredCapabilities } from '../types'
import { formatElapsed, formatNumber } from '../lib/format'

type OperationsTab = 'tasks' | 'resources' | 'analysis'

interface OperationsPanelProps {
  state: SimulationState
  selectedEntity?: string
  onSelectEntity: (id?: string) => void
  onUpdateSettings: (patch: {
    pathAlgorithm?: PathAlgorithm
    assignmentStrategy?: AssignmentStrategy
  }) => void
  onCompare: (incidentId?: string) => Promise<AlgorithmComparison[]>
  onOpenScenario: () => void
}

const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  pending: '待派发',
  assigned: '已派发',
  responding: '协同处置',
  resolved: '已完成',
}

function incidentProgress(status: IncidentStatus, workRemaining: number): number {
  if (status === 'resolved') return 100
  if (status === 'pending') return 4
  if (status === 'assigned') return 22
  return Math.min(92, 52 + Math.max(0, 38 - workRemaining) * 1.1)
}

function CompareTable({ rows }: { rows: AlgorithmComparison[] }) {
  const bestExplored = Math.min(...rows.filter((row) => row.feasible).map((row) => row.exploredNodes))
  return (
    <div className="compare-table" data-testid="compare-table">
      <div className="compare-row compare-head">
        <span>算法 / 策略</span>
        <span>ETA</span>
        <span>路径</span>
        <span>探索</span>
      </div>
      {rows.map((row) => (
        <div className={`compare-row ${row.algorithm === 'astar' && row.strategy === 'nearest' ? 'recommended' : ''}`} key={row.id}>
          <span className="compare-algorithm">
            <b>{row.algorithm === 'astar' ? 'A*' : 'Dijkstra'}</b>
            <small>{row.strategy === 'nearest' ? '最近优先' : '负载均衡'}</small>
          </span>
          <span>{row.feasible ? `${formatNumber(row.etaMinutes, 1)}m` : '—'}</span>
          <span>{row.feasible ? `${formatNumber(row.distance, 1)}km` : '不可达'}</span>
          <span className={row.exploredNodes === bestExplored ? 'explored-best' : ''}>{row.exploredNodes}</span>
        </div>
      ))}
      <p className="compare-note">
        <ScanSearch size={13} />
        “探索”为搜索过程中访问的节点数，数值越低表示计算更聚焦；A* 与 Dijkstra 在可采纳启发式下应得到同一最优代价。
      </p>
    </div>
  )
}

export function OperationsPanel({
  state,
  selectedEntity,
  onSelectEntity,
  onUpdateSettings,
  onCompare,
  onOpenScenario,
}: OperationsPanelProps) {
  const [tab, setTab] = useState<OperationsTab>('tasks')
  const [comparisons, setComparisons] = useState<AlgorithmComparison[]>([])
  const [comparing, setComparing] = useState(false)
  const activeIncidents = state.incidents.filter((incident) => incident.status !== 'resolved')
  const assignedCount = state.resources.filter((resource) => resource.status !== 'idle').length

  const runComparison = async () => {
    setComparing(true)
    try {
      const rows = await onCompare(activeIncidents[0]?.id)
      setComparisons(rows)
    } finally {
      setComparing(false)
    }
  }

  return (
    <aside className="right-rail">
      <div className="right-tabs" role="tablist" aria-label="运行控制">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tasks'}
          className={tab === 'tasks' ? 'active' : ''}
          onClick={() => setTab('tasks')}
          data-testid="operations-tab-tasks"
        >
          <ListTodo size={15} />
          任务
          <span>{activeIncidents.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'resources'}
          className={tab === 'resources' ? 'active' : ''}
          onClick={() => setTab('resources')}
        >
          <Bot size={15} />
          资源
          <span>{assignedCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'analysis'}
          className={tab === 'analysis' ? 'active' : ''}
          onClick={() => setTab('analysis')}
        >
          <GitCompareArrows size={15} />
          算法
        </button>
      </div>

      <div className="right-content">
        {tab === 'tasks' && (
          <section className="ops-section">
            <div className="ops-heading">
              <div>
                <span className="section-kicker">MISSION QUEUE</span>
                <h2>协同任务队列</h2>
              </div>
              <span className="queue-status"><i /> 实时编排</span>
            </div>
            <div className="task-list" data-testid="task-list">
              {state.incidents.length === 0 && (
                <div className="empty-state">
                  <Siren size={24} />
                  <strong>暂无突发事件</strong>
                  <p>选择地图上的“事件注入”工具，在任意路口创建新的应急任务。</p>
                </div>
              )}
              {state.incidents.map((incident, index) => {
                const meta = INCIDENT_META[incident.type]
                const assigned = state.resources.filter((resource) => incident.assignedResourceIds.includes(resource.id))
                const capabilities = requiredCapabilities(incident.type, incident.severity)
                return (
                  <article
                    key={incident.id}
                    className={`task-card ${selectedEntity === incident.id ? 'selected' : ''} ${incident.status}`}
                    onClick={() => onSelectEntity(incident.id)}
                  >
                    <div className="task-sequence">{String(index + 1).padStart(2, '0')}</div>
                    <div className="task-body">
                      <div className="task-titleline">
                        <span className={`incident-token ${incident.type}`}>{meta.short}</span>
                        <div>
                          <strong>{incident.title}</strong>
                          <span><MapPin size={11} /> {state.city.nodes.find((node) => node.id === incident.nodeId)?.label ?? incident.nodeId} · {meta.label}</span>
                        </div>
                        <span className={`task-status ${incident.status}`}>{INCIDENT_STATUS_LABEL[incident.status]}</span>
                      </div>
                      <div className="severity-row">
                        <span>事件等级</span>
                        {[1, 2, 3].map((level) => <i key={level} className={level <= incident.severity ? 'filled' : ''} />)}
                        <span className="task-time"><Clock3 size={11} /> {formatElapsed(incident.createdAt)}</span>
                      </div>
                      <div className="task-progress">
                        <div><span style={{ width: `${incidentProgress(incident.status, incident.workRemaining)}%` }} /></div>
                        <small>{Math.round(incidentProgress(incident.status, incident.workRemaining))}%</small>
                      </div>
                      <div className="assignment-row">
                        <span className="assignment-label"><Radio size={12} /> AGENTS</span>
                        {assigned.length === 0 ? (
                          <span className="unassigned">等待调度</span>
                        ) : (
                          assigned.map((resource) => (
                            <span
                              className="agent-chip"
                              key={resource.id}
                              style={{ borderColor: `${RESOURCE_META[resource.type].color}55` }}
                            >
                              <i style={{ background: RESOURCE_META[resource.type].color }} />
                              {resource.label}
                              <small>{resource.status === 'working' ? '处置中' : resource.status === 'enroute' ? '途中' : '阻塞'}</small>
                            </span>
                          ))
                        )}
                      </div>
                      <div className="requirement-row">
                        <span>需求编成</span>
                        {capabilities.map((type, capabilityIndex) => (
                          <span key={`${type}-${capabilityIndex}`} className="required-token">
                            {RESOURCE_META[type].short} {RESOURCE_META[type].label}
                          </span>
                        ))}
                        {incident.responseAt !== undefined && (
                          <span className="response-tag">
                            <Zap size={11} /> 响应 {formatNumber(incident.responseAt - incident.createdAt, 0)} 分钟
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
            <button type="button" className="scenario-edit-link" onClick={onOpenScenario}>
              <span><SlidersHorizontal size={14} /> 场景与路网编辑</span>
              <ChevronRight size={15} />
            </button>
          </section>
        )}

        {tab === 'resources' && (
          <section className="ops-section">
            <div className="ops-heading">
              <div>
                <span className="section-kicker">AGENT REGISTRY</span>
                <h2>应急资源编队</h2>
              </div>
              <span className="count-pill">{state.resources.length} UNITS</span>
            </div>
            <div className="resource-list">
              {state.resources.map((resource) => {
                const incident = state.incidents.find((candidate) => candidate.id === resource.incidentId)
                const meta = RESOURCE_META[resource.type]
                return (
                  <article
                    className={`resource-card ${resource.status} ${selectedEntity === resource.id ? 'selected' : ''}`}
                    key={resource.id}
                    onClick={() => onSelectEntity(resource.id)}
                  >
                    <span className={`resource-avatar ${resource.type}`}>{meta.short}</span>
                    <div className="resource-main">
                      <div>
                        <strong>{resource.label}</strong>
                        <span className={`resource-status ${resource.status}`}>
                          {resource.status === 'idle' ? '待命' : resource.status === 'enroute' ? '出动中' : resource.status === 'working' ? '现场处置' : '路线阻塞'}
                        </span>
                      </div>
                      <p>
                        {incident ? `${incident.title} · ${resource.status === 'enroute' ? `预计 ${formatNumber(resource.routeCost, 1)} 分钟` : '已抵达'}` : '当前驻点待命'}
                      </p>
                      <div className="resource-meta">
                        <span><MapPin size={11} /> {state.city.nodes.find((node) => node.id === resource.nodeId)?.label ?? resource.nodeId}</span>
                        <span><Route size={11} /> 重规划 {resource.rerouteCount}</span>
                        <span><Truck size={11} /> 出动 {resource.dispatchCount}</span>
                      </div>
                    </div>
                    <ArrowUpRight size={14} className="resource-arrow" />
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {tab === 'analysis' && (
          <section className="ops-section analysis-section">
            <div className="ops-heading">
              <div>
                <span className="section-kicker">ALGORITHM LAB</span>
                <h2>算法决策对比</h2>
              </div>
              <span className="count-pill">LIVE</span>
            </div>

            <div className="algorithm-config">
              <div className="config-label">
                <span><Route size={14} /> 路径搜索</span>
                <small>影响新派发任务与重规划路线</small>
              </div>
              <div className="segmented-control">
                <button
                  type="button"
                  className={state.settings.pathAlgorithm === 'astar' ? 'active' : ''}
                  onClick={() => onUpdateSettings({ pathAlgorithm: 'astar' })}
                >
                  <span>A*</span> 启发式
                </button>
                <button
                  type="button"
                  className={state.settings.pathAlgorithm === 'dijkstra' ? 'active' : ''}
                  onClick={() => onUpdateSettings({ pathAlgorithm: 'dijkstra' })}
                >
                  <span>Dijkstra</span> 全局最优
                </button>
              </div>
            </div>

            <div className="algorithm-config">
              <div className="config-label">
                <span><Layers3 size={14} /> 任务分配</span>
                <small>多智能体资源竞标策略</small>
              </div>
              <div className="segmented-control">
                <button
                  type="button"
                  className={state.settings.assignmentStrategy === 'balanced' ? 'active' : ''}
                  onClick={() => onUpdateSettings({ assignmentStrategy: 'balanced' })}
                >
                  <span>负载均衡</span> 协同优先
                </button>
                <button
                  type="button"
                  className={state.settings.assignmentStrategy === 'nearest' ? 'active' : ''}
                  onClick={() => onUpdateSettings({ assignmentStrategy: 'nearest' })}
                >
                  <span>最近优先</span> 响应优先
                </button>
              </div>
            </div>

            <button type="button" className="compare-button" onClick={() => void runComparison()} disabled={comparing} data-testid="compare-button">
              <GitCompareArrows size={16} />
              {comparing ? '正在执行四组对比…' : '运行四组算法对比'}
            </button>

            {comparisons.length > 0 ? (
              <CompareTable rows={comparisons} />
            ) : (
              <div className="comparison-placeholder">
                <span><ScanSearch size={23} /></span>
                <strong>四组基准待运行</strong>
                <p>基于当前事件、路网状态与车辆驻点，对比 A*/Dijkstra 与两种分配策略的 ETA、路径和搜索规模。</p>
              </div>
            )}

            <div className="algorithm-note-grid">
              <div>
                <span className="note-icon"><CircleDot size={15} /></span>
                <strong>A* 搜索</strong>
                <p>使用可采纳的欧氏距离下界，减少无关节点扩展，同时保持时间代价最优。</p>
              </div>
              <div>
                <span className="note-icon"><CheckCircle2 size={15} /></span>
                <strong>确定性仿真</strong>
                <p>无随机数参与主流程，相同场景与时间步产生可重复的调度结果。</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </aside>
  )
}
