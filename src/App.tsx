import { useCallback, useEffect, useMemo, useState } from 'react'
import { Cpu, Database, Keyboard, RadioTower, ShieldCheck, WifiOff } from 'lucide-react'
import type {
  AssignmentStrategy,
  CityScenario,
  IncidentType,
  MapTool,
  PathAlgorithm,
  ResourceType,
} from './types'
import { Header } from './components/Header'
import { MetricPanel } from './components/MetricPanel'
import { CityMap } from './components/CityMap'
import { OperationsPanel } from './components/OperationsPanel'
import { Timeline } from './components/Timeline'
import { ScenarioModal } from './components/ScenarioModal'
import { Toast, type ToastMessage } from './components/Toast'
import { useSimulation } from './hooks/useSimulation'
import { useOptionalGateway } from './hooks/useGateway'

export default function App() {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [replayIndex, setReplayIndex] = useState(0)
  const [tool, setTool] = useState<MapTool>('select')
  const [incidentType, setIncidentType] = useState<IncidentType>('fire')
  const [incidentSeverity, setIncidentSeverity] = useState<1 | 2 | 3>(3)
  const [selectedEntity, setSelectedEntity] = useState<string | undefined>(undefined)
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false)

  const notify = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    setToast({ id: Date.now(), text, tone })
  }, [])
  const showError = useCallback((text: string) => notify(text, 'error'), [notify])

  const simulation = useSimulation({ onNotice: notify, onError: showError })
  const gatewayStatus = useOptionalGateway(simulation.state)

  useEffect(() => {
    setReplayIndex(Math.max(0, simulation.history.length - 1))
  }, [simulation.history.length])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const viewState = simulation.history[Math.min(replayIndex, simulation.history.length - 1)] ?? simulation.state
  const isReplay = replayIndex < simulation.history.length - 1
  const visibleHistory = useMemo(
    () => simulation.history.slice(0, Math.min(replayIndex + 1, simulation.history.length)),
    [replayIndex, simulation.history],
  )

  const handleReplayChange = (index: number) => {
    simulation.pause()
    setReplayIndex(index)
  }

  const handleResumeLive = () => {
    setReplayIndex(Math.max(0, simulation.history.length - 1))
  }

  const handleToggleRun = () => {
    if (isReplay) handleResumeLive()
    simulation.toggleRun()
  }

  const handleStep = () => {
    if (isReplay) handleResumeLive()
    simulation.pause()
    void simulation.step()
  }

  const handleDemo = () => {
    setSelectedEntity(undefined)
    setTool('select')
    simulation.startDemo()
    setReplayIndex(0)
  }

  const handleReset = () => {
    simulation.reset()
    setReplayIndex(0)
    setSelectedEntity(undefined)
    setTool('select')
  }

  const handleLoadScenario = (scenario: CityScenario) => {
    simulation.loadScenario(scenario)
    setReplayIndex(0)
    setSelectedEntity(undefined)
    setTool('select')
  }

  const handleUpdateSettings = (patch: { pathAlgorithm?: PathAlgorithm; assignmentStrategy?: AssignmentStrategy }) => {
    if (isReplay) {
      notify('请先返回最新状态，再修改算法参数', 'error')
      return
    }
    void simulation.updateSettings(patch)
  }

  const handleInjectIncident = (type: IncidentType, nodeId: string, severity: 1 | 2 | 3) => {
    void simulation.injectIncident(type, nodeId, severity)
    setSelectedEntity(undefined)
  }

  const handleAddResource = (type: ResourceType, nodeId: string) => {
    void simulation.addResource(type, nodeId)
  }

  const handleToggleRoad = (edgeId: string, status: 'open' | 'closed') => {
    void simulation.setRoadStatus(edgeId, status, '指挥员地图编辑')
  }

  const handleRemoveRoad = (edgeId: string) => {
    void simulation.removeRoad(edgeId)
    notify('道路已从当前场景路网移除')
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return
      if (event.code === 'Space') {
        event.preventDefault()
        handleToggleRun()
      }
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleStep()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="app-shell">
      <Header
        state={viewState}
        isRunning={simulation.isRunning && !isReplay}
        speed={simulation.speed}
        gatewayStatus={gatewayStatus}
        isReplay={isReplay}
        onToggleRun={handleToggleRun}
        onStep={handleStep}
        onSpeedChange={simulation.setSpeed}
        onDemo={handleDemo}
        onSave={() => setScenarioModalOpen(true)}
        onReset={handleReset}
      />

      <div className="workspace">
        <MetricPanel state={viewState} history={visibleHistory} isRunning={simulation.isRunning && !isReplay} />

        <main className="map-column">
          <CityMap
            state={viewState}
            tool={tool}
            incidentType={incidentType}
            incidentSeverity={incidentSeverity}
            selectedEntity={selectedEntity}
            readOnly={isReplay}
            onToolChange={setTool}
            onIncidentTypeChange={setIncidentType}
            onIncidentSeverityChange={setIncidentSeverity}
            onSelectEntity={setSelectedEntity}
            onInjectIncident={handleInjectIncident}
            onAddResource={handleAddResource}
            onToggleRoad={handleToggleRoad}
            onAddRoad={(from, to) => void simulation.addRoad(from, to)}
            onRemoveRoad={handleRemoveRoad}
            onNotice={(message) => notify(message)}
          />

          <Timeline
            state={viewState}
            history={simulation.history}
            replayIndex={replayIndex}
            isReplay={isReplay}
            isRunning={simulation.isRunning && !isReplay}
            speed={simulation.speed}
            demoActive={simulation.demoActive}
            onReplayChange={handleReplayChange}
            onToggleRun={handleToggleRun}
            onStep={handleStep}
            onResumeLive={handleResumeLive}
            onSpeedChange={simulation.setSpeed}
          />
        </main>

        <OperationsPanel
          state={viewState}
          selectedEntity={selectedEntity}
          onSelectEntity={setSelectedEntity}
          onUpdateSettings={handleUpdateSettings}
          onCompare={simulation.compare}
          onOpenScenario={() => setScenarioModalOpen(true)}
        />
      </div>

      <footer className="status-bar">
        <div>
          <span className="status-item"><Cpu size={12} /> SIM WORKER ACTIVE</span>
          <span className="status-item"><ShieldCheck size={12} /> DETERMINISTIC CORE</span>
          <span className="status-item"><Database size={12} /> LOCAL-FIRST</span>
          <span className="status-item"><Keyboard size={12} /> SPACE 播放 / S 单步</span>
        </div>
        <div>
          <span className={'status-item ' + gatewayStatus}><RadioTower size={12} /> {gatewayStatus === 'disabled' ? 'WS GATEWAY OPTIONAL' : 'REMOTE MONITOR ' + gatewayStatus.toUpperCase()}</span>
          <span className="status-item"><WifiOff size={12} /> OFFLINE READY</span>
          <span className="version">CITYWEAVE / v1.0.0</span>
        </div>
      </footer>

      <ScenarioModal
        open={scenarioModalOpen}
        state={simulation.state}
        onClose={() => setScenarioModalOpen(false)}
        onLoad={handleLoadScenario}
        onNotice={notify}
        onError={showError}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
