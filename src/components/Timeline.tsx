import { History, Pause, Play, Radio, SkipForward, TimerReset } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { SimulationState } from '../types'
import { PHASE_LABEL } from '../types'
import { formatElapsed, formatSimClock } from '../lib/format'
import type { SimulationSpeed } from '../hooks/useSimulation'

interface TimelineProps {
  state: SimulationState
  history: SimulationState[]
  replayIndex: number
  isReplay: boolean
  isRunning: boolean
  speed: SimulationSpeed
  demoActive: boolean
  onReplayChange: (index: number) => void
  onToggleRun: () => void
  onStep: () => void
  onResumeLive: () => void
  onSpeedChange: (speed: SimulationSpeed) => void
}

export function Timeline({
  state,
  history,
  replayIndex,
  isReplay,
  isRunning,
  speed,
  demoActive,
  onReplayChange,
  onToggleRun,
  onStep,
  onResumeLive,
  onSpeedChange,
}: TimelineProps) {
  const latestEvent = [...state.events].reverse().find((event) => event.time <= state.time)
  const replayPercent = history.length <= 1 ? 0 : (replayIndex / (history.length - 1)) * 100

  return (
    <section className="timeline-panel" aria-label="过程回放时间轴">
      <div className="timeline-controls">
        <button
          type="button"
          className={isRunning ? 'timeline-play running' : 'timeline-play'}
          onClick={onToggleRun}
          aria-label={isRunning ? '暂停' : '播放'}
          data-testid="timeline-play"
        >
          {isRunning ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <button type="button" className="timeline-step" onClick={onStep} title="单步推进" aria-label="单步推进">
          <SkipForward size={16} />
        </button>
      </div>

      <div className="timeline-main">
        <div className="timeline-topline">
          <span className={isReplay ? 'timeline-mode replay' : 'timeline-mode live'}>
            {isReplay ? <History size={13} /> : <Radio size={13} />}
            {isReplay ? `复盘节点 ${replayIndex + 1}/${history.length}` : isRunning ? '实时推演' : PHASE_LABEL[state.phase]}
          </span>
          <span className="timeline-clock">{formatSimClock(state.settings.startTime, state.time)}</span>
          <span className="timeline-elapsed">{formatElapsed(state.time)}</span>
          {demoActive && <span className="story-active">标准剧情运行中</span>}
          <div className="timeline-speed">
            <TimerReset size={12} />
            {(['slow', 'normal', 'fast'] as SimulationSpeed[]).map((item) => (
              <button
                type="button"
                key={item}
                className={speed === item ? 'active' : ''}
                onClick={() => onSpeedChange(item)}
              >
                {item === 'slow' ? '1×' : item === 'normal' ? '2×' : '4×'}
              </button>
            ))}
          </div>
          {isReplay && (
            <button type="button" className="resume-live" onClick={onResumeLive}>
              返回最新
            </button>
          )}
        </div>

        <div className="timeline-track-wrap">
          <input
            type="range"
            min="0"
            max={Math.max(0, history.length - 1)}
            value={Math.min(replayIndex, Math.max(0, history.length - 1))}
            onChange={(event) => onReplayChange(Number(event.target.value))}
            aria-label="回放时间轴"
            data-testid="replay-slider"
            style={{ '--progress': `${replayPercent}%` } as CSSProperties}
          />
          <div className="timeline-markers" aria-hidden="true">
            {state.events
              .filter((event) => ['road', 'reroute', 'resolve', 'dispatch'].includes(event.kind))
              .slice(-24)
              .map((event) => (
                <i
                  key={event.id}
                  className={event.kind}
                  style={{ left: `${Math.min(98, (event.time / state.settings.maxTimeMinutes) * 100)}%` }}
                />
              ))}
          </div>
          <div className="timeline-scale">
            <span>+00:00</span>
            <span>+{Math.round(state.settings.maxTimeMinutes / 2)}:00</span>
            <span>+{state.settings.maxTimeMinutes}:00</span>
          </div>
        </div>

        <div className="latest-event" aria-live="polite">
          <span className={'event-tone ' + (latestEvent?.tone ?? 'info')} />
          <strong>{latestEvent?.title ?? '等待推演开始'}</strong>
          <p>{latestEvent?.detail ?? '点击开始推演或单步推进，观察多智能体调度过程。'}</p>
          <span className="event-time">{latestEvent ? formatElapsed(latestEvent.time) : 'STANDBY'}</span>
        </div>
      </div>
    </section>
  )
}
