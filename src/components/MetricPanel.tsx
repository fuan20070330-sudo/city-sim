import {
  Activity,
  AlarmClock,
  BatteryCharging,
  Bot,
  MapPinned,
  Radar,
  ShieldCheck,
  Siren,
  Target,
  TrafficCone,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { SimulationState } from '../types'
import { PHASE_LABEL, RESOURCE_META } from '../types'
import { formatElapsed, formatNumber } from '../lib/format'

interface MetricPanelProps {
  state: SimulationState
  history: SimulationState[]
  isRunning: boolean
}

interface MetricDefinition {
  label: string
  value: string
  unit: string
  detail: string
  color: string
  icon: LucideIcon
  extract: (state: SimulationState) => number
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const clean = values.slice(-28)
  const width = 108
  const height = 30
  if (clean.length < 2) {
    return (
      <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <line x1="0" y1={height - 4} x2={width} y2={height - 4} stroke={color} strokeOpacity="0.28" strokeWidth="1.5" />
      </svg>
    )
  }
  const min = Math.min(...clean)
  const max = Math.max(...clean)
  const span = Math.max(0.01, max - min)
  const points = clean
    .map((value, index) => {
      const x = (index / (clean.length - 1)) * width
      const y = height - 4 - ((value - min) / span) * (height - 9)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const area = `0,${height} ${points} ${width},${height}`
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polygon points={area} fill={color} opacity="0.08" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function MetricPanel({ state, history, isRunning }: MetricPanelProps) {
  const metrics: MetricDefinition[] = [
    {
      label: '平均响应',
      value: formatNumber(state.metrics.avgResponseMinutes, 1),
      unit: 'min',
      detail: state.metrics.avgResponseMinutes > 0 && state.metrics.avgResponseMinutes <= state.settings.targetResponseMinutes ? '达到响应目标' : '等待首车到场',
      color: '#62e7cf',
      icon: AlarmClock,
      extract: (snapshot) => snapshot.metrics.avgResponseMinutes,
    },
    {
      label: '应急覆盖率',
      value: formatNumber(state.metrics.coveragePercent, 0),
      unit: '%',
      detail: `${state.settings.targetResponseMinutes} 分钟可达半径`,
      color: '#62b7ff',
      icon: Radar,
      extract: (snapshot) => snapshot.metrics.coveragePercent,
    },
    {
      label: '路网拥堵',
      value: formatNumber(state.metrics.congestionPercent, 0),
      unit: '%',
      detail: `${state.metrics.roadClosures} 条道路中断`,
      color: '#f3b24e',
      icon: TrafficCone,
      extract: (snapshot) => snapshot.metrics.congestionPercent,
    },
    {
      label: '资源利用率',
      value: formatNumber(state.metrics.utilizationPercent, 0),
      unit: '%',
      detail: `${state.metrics.activeUnits} / ${state.metrics.totalUnits} 单元执行中`,
      color: '#c795ff',
      icon: BatteryCharging,
      extract: (snapshot) => snapshot.metrics.utilizationPercent,
    },
  ]
  const phase = isRunning ? 'running' : state.phase
  const progress = Math.min(100, (state.time / state.settings.maxTimeMinutes) * 100)
  const resolvedRatio = state.metrics.totalIncidents === 0 ? 0 : (state.metrics.resolvedCount / state.metrics.totalIncidents) * 100
  const resourceCounts = state.resources.reduce(
    (counts, resource) => {
      counts[resource.type] += 1
      return counts
    },
    { ambulance: 0, fire: 0, supply: 0 },
  )

  return (
    <aside className="left-rail">
      <section className="panel scenario-card">
        <div className="section-kicker">SCENARIO BRIEF</div>
        <div className="scenario-heading">
          <div>
            <h2>{state.city.name}</h2>
            <p>{state.description}</p>
          </div>
          <span className={`phase-badge ${phase}`}>{PHASE_LABEL[phase]}</span>
        </div>
        <div className="progress-cluster">
          <div className="progress-label">
            <span>推演进度</span>
            <strong>{formatElapsed(state.time)} / {state.settings.maxTimeMinutes}:00</strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="objective-box">
          <Target size={16} />
          <div>
            <span>行动目标</span>
            <p>{state.objective}</p>
          </div>
        </div>
      </section>

      <section className="metrics-grid" aria-label="城市应急指标">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <div className="metric-topline">
              <span className="metric-icon" style={{ color: metric.color }}>
                <metric.icon size={16} strokeWidth={2} />
              </span>
              <span>{metric.label}</span>
              <Activity size={12} className="metric-activity" />
            </div>
            <div className="metric-value" style={{ color: metric.color }}>
              {metric.value}
              <small>{metric.unit}</small>
            </div>
            <Sparkline values={history.map(metric.extract)} color={metric.color} />
            <div className="metric-detail">{metric.detail}</div>
          </article>
        ))}
      </section>

      <section className="panel fleet-card">
        <div className="panel-heading compact">
          <div>
            <span className="section-kicker">FLEET STATUS</span>
            <h3>应急单元</h3>
          </div>
          <span className="count-pill">{state.resources.length} UNITS</span>
        </div>
        {(['fire', 'ambulance', 'supply'] as const).map((type) => (
          <div className="fleet-row" key={type}>
            <span className="fleet-symbol" style={{ color: RESOURCE_META[type].color }}>
              {RESOURCE_META[type].short}
            </span>
            <span>{RESOURCE_META[type].label}</span>
            <div className="fleet-dots" aria-hidden="true">
              {Array.from({ length: Math.min(6, resourceCounts[type]) }).map((_, index) => (
                <i key={index} style={{ background: RESOURCE_META[type].color }} />
              ))}
            </div>
            <strong>{resourceCounts[type]}</strong>
          </div>
        ))}
        <div className="fleet-footer">
          <span><Siren size={13} /> 处置中 {state.metrics.activeUnits}</span>
          <span><ShieldCheck size={13} /> 完成 {state.metrics.resolvedCount}/{state.metrics.totalIncidents}</span>
        </div>
      </section>

      <section className="panel synergy-card">
        <div className="synergy-title">
          <span className="synergy-icon"><Bot size={17} /></span>
          <div>
            <span className="section-kicker">MULTI-AGENT</span>
            <h3>协同调度网络</h3>
          </div>
          <span className="live-label"><i /> ACTIVE</span>
        </div>
        <div className="agent-network" aria-hidden="true">
          <span className="network-core"><MapPinned size={20} /></span>
          <span className="network-node n1" /><span className="network-node n2" />
          <span className="network-node n3" /><span className="network-node n4" />
          <span className="network-line l1" /><span className="network-line l2" />
          <span className="network-line l3" /><span className="network-line l4" />
        </div>
        <div className="resolve-track">
          <span>任务闭环</span>
          <div><i style={{ width: `${resolvedRatio}%` }} /></div>
          <strong>{Math.round(resolvedRatio)}%</strong>
        </div>
      </section>
    </aside>
  )
}
