import {
  Activity,
  CloudOff,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  StepForward,
  Wifi,
} from 'lucide-react'
import type { SimulationState } from '../types'
import { PHASE_LABEL } from '../types'
import type { SimulationSpeed } from '../hooks/useSimulation'
import type { GatewayStatus } from '../lib/collaboration'
import { gatewayStatusLabel } from '../lib/collaboration'
import { formatElapsed, formatSimClock } from '../lib/format'

interface HeaderProps {
  state: SimulationState
  isRunning: boolean
  speed: SimulationSpeed
  gatewayStatus: GatewayStatus
  isReplay: boolean
  onToggleRun: () => void
  onStep: () => void
  onSpeedChange: (speed: SimulationSpeed) => void
  onDemo: () => void
  onSave: () => void
  onReset: () => void
}

export function Header({
  state,
  isRunning,
  speed,
  gatewayStatus,
  isReplay,
  onToggleRun,
  onStep,
  onSpeedChange,
  onDemo,
  onSave,
  onReset,
}: HeaderProps) {
  const phase = isReplay ? '回放查看' : isRunning ? '实时推演' : PHASE_LABEL[state.phase]
  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          <Activity size={24} strokeWidth={2.4} />
          <span className="brand-mark-ring" />
        </div>
        <div>
          <div className="brand-line">
            <h1>城智演</h1>
            <span className="brand-en">CITYWEAVE</span>
          </div>
          <p>城市应急多智能体调度推演平台</p>
        </div>
      </div>

      <div className="scenario-title">
        <span className="eyebrow">ACTIVE SCENARIO</span>
        <strong>{state.scenarioName}</strong>
        <span className="scenario-id">SCN-{state.scenarioId.slice(0, 8).toUpperCase()}</span>
      </div>

      <div className="sim-clock" data-testid="sim-clock">
        <span className={`phase-dot ${isRunning ? 'pulse' : ''}`} />
        <div>
          <span className="clock-label">{phase}</span>
          <strong>{formatSimClock(state.settings.startTime, state.time)}</strong>
        </div>
        <span className="elapsed-tag">{formatElapsed(state.time)}</span>
      </div>

      <div className="speed-control" aria-label="仿真速度">
        <Gauge size={15} />
        {(['slow', 'normal', 'fast'] as SimulationSpeed[]).map((item, index) => (
          <button
            type="button"
            key={item}
            className={speed === item ? 'active' : ''}
            onClick={() => onSpeedChange(item)}
            title={['慢速', '标准', '快速'][index]}
            aria-label={['慢速', '标准', '快速'][index]}
          >
            {[1, 2, 4][index]}×
          </button>
        ))}
      </div>

      <div className={`gateway-pill ${gatewayStatus}`}>
        {gatewayStatus === 'disabled' ? <CloudOff size={14} /> : <Wifi size={14} />}
        <span>{gatewayStatusLabel(gatewayStatus)}</span>
      </div>

      <div className="header-actions">
        <button type="button" className="ghost-button icon-label" onClick={onDemo} data-testid="demo-button">
          <Sparkles size={16} />
          <span>剧情演示</span>
        </button>
        <button type="button" className="ghost-button icon-label" onClick={onSave}>
          <Save size={16} />
          <span>场景</span>
        </button>
        <button type="button" className="icon-button" onClick={onReset} title="重置场景" aria-label="重置场景">
          <RotateCcw size={17} />
        </button>
        <button type="button" className="icon-button" onClick={onStep} title="单步推进" aria-label="单步推进" data-testid="step-button">
          <StepForward size={18} />
        </button>
        <button type="button" className="primary-button run-button" onClick={onToggleRun} data-testid="run-button">
          {isRunning ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          {isRunning ? '暂停推演' : state.phase === 'ready' ? '开始推演' : '继续推演'}
        </button>
      </div>
    </header>
  )
}
