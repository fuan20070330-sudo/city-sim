import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AlgorithmComparison,
  AssignmentStrategy,
  CityScenario,
  PathAlgorithm,
  ResourceType,
  SimulationState,
} from '../types'
import { createDefaultScenario } from '../data/defaultScenario'
import { createInitialState } from '../engine/engine'
import { pickRouteDisruptionEdge } from '../engine/graph'
import type { IncidentInput } from '../engine/engine'
import type { WorkerRequest, WorkerResponse } from '../worker/protocol'

export type SimulationSpeed = 'slow' | 'normal' | 'fast'

const SPEED_MS: Record<SimulationSpeed, number> = {
  slow: 1350,
  normal: 760,
  fast: 360,
}

interface PendingRequest {
  resolve: (response: WorkerResponse) => void
  reject: (error: Error) => void
}

interface UseSimulationOptions {
  onError?: (message: string) => void
  onNotice?: (message: string) => void
}

export function useSimulation(options: UseSimulationOptions = {}) {
  const initialScenario = useMemo(() => createDefaultScenario(), [])
  const initialState = useMemo(() => createInitialState(initialScenario), [initialScenario])
  const [state, setState] = useState<SimulationState>(initialState)
  const [history, setHistory] = useState<SimulationState[]>([initialState])
  const [isRunning, setIsRunning] = useState(false)
  const [speed, setSpeed] = useState<SimulationSpeed>('normal')
  const [demoActive, setDemoActive] = useState(false)
  const [demoStep, setDemoStep] = useState(0)
  const sourceScenarioRef = useRef<CityScenario>(initialScenario)
  const stateRef = useRef(state)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingRef = useRef(new Map<number, PendingRequest>())
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const tickPendingRef = useRef(false)
  const demoEdgeRef = useRef<string | undefined>(undefined)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    const worker = new Worker(new URL('../worker/simulation.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      const pending = pendingRef.current.get(response.id)
      if (!pending) return
      pendingRef.current.delete(response.id)
      if (response.ok) pending.resolve(response)
      else pending.reject(new Error(response.error))
    }
    worker.onerror = (event) => {
      const error = new Error(event.message || '仿真 Worker 异常')
      for (const pending of pendingRef.current.values()) pending.reject(error)
      pendingRef.current.clear()
      optionsRef.current.onError?.(error.message)
    }
    return () => {
      worker.terminate()
      workerRef.current = null
      for (const pending of pendingRef.current.values()) pending.reject(new Error('Worker 已关闭'))
      pendingRef.current.clear()
    }
  }, [])

  const applyState = useCallback((next: SimulationState, recordHistory = true) => {
    stateRef.current = next
    setState(next)
    if (recordHistory) {
      setHistory((previous) => {
        const latest = previous[previous.length - 1]
        if (latest && JSON.stringify(latest) === JSON.stringify(next)) return previous
        return [...previous, next].slice(-360)
      })
    }
  }, [])

  const enqueue = useCallback(
    <T>(
      makeRequest: (state: SimulationState, id: number) => WorkerRequest,
      handle: (response: WorkerResponse) => T,
    ): Promise<T> => {
      const task = queueRef.current.then(async () => {
        const worker = workerRef.current
        if (!worker) throw new Error('仿真 Worker 尚未就绪')
        const id = ++requestIdRef.current
        const request = makeRequest(stateRef.current, id)
        const response = await new Promise<WorkerResponse>((resolve, reject) => {
          pendingRef.current.set(id, { resolve, reject })
          worker.postMessage(request)
        })
        return handle(response)
      })
      queueRef.current = task.then(
        () => undefined,
        () => undefined,
      )
      return task
    },
    [],
  )

  const tick = useCallback(async (): Promise<SimulationState | undefined> => {
    if (tickPendingRef.current || stateRef.current.phase === 'completed' || stateRef.current.phase === 'timeout') {
      return undefined
    }
    tickPendingRef.current = true
    try {
      return await enqueue(
        (current, id) => ({
          id,
          type: 'tick',
          state: current,
          minutes: current.settings.tickMinutes,
        }),
        (response) => {
          if (!response.state) throw new Error('Worker 未返回仿真状态')
          applyState(response.state)
          return response.state
        },
      )
    } catch (error) {
      optionsRef.current.onError?.(error instanceof Error ? error.message : '时间推进失败')
      return undefined
    } finally {
      tickPendingRef.current = false
    }
  }, [applyState, enqueue])

  useEffect(() => {
    if (!isRunning) return
    const timer = window.setTimeout(() => {
      void tick()
    }, SPEED_MS[speed])
    return () => window.clearTimeout(timer)
  }, [isRunning, speed, state.time, tick])

  useEffect(() => {
    if (state.phase === 'completed' || state.phase === 'timeout') {
      setIsRunning(false)
      if (demoActive) setDemoStep(3)
    }
  }, [demoActive, state.phase])

  const start = useCallback(() => {
    if (stateRef.current.phase === 'completed' || stateRef.current.phase === 'timeout') {
      void optionsRef.current.onNotice?.('当前推演已结束，请重置或载入新场景。')
      return
    }
    setIsRunning(true)
  }, [])

  const pause = useCallback(() => setIsRunning(false), [])

  const toggleRun = useCallback(() => {
    if (isRunning) pause()
    else start()
  }, [isRunning, pause, start])

  const reset = useCallback(() => {
    setIsRunning(false)
    setDemoActive(false)
    setDemoStep(0)
    demoEdgeRef.current = undefined
    const next = createInitialState(sourceScenarioRef.current)
    applyState(next, false)
    setHistory([next])
    optionsRef.current.onNotice?.('场景已重置')
  }, [applyState])

  const loadScenario = useCallback(
    (scenario: CityScenario) => {
      setIsRunning(false)
      setDemoActive(false)
      setDemoStep(0)
      demoEdgeRef.current = undefined
      sourceScenarioRef.current = structuredClone(scenario)
      const next = createInitialState(scenario)
      applyState(next, false)
      setHistory([next])
      optionsRef.current.onNotice?.(`已载入场景：${scenario.name}`)
    },
    [applyState],
  )

  const injectIncident = useCallback(
    async (type: IncidentInput['type'], nodeId: string, severity: 1 | 2 | 3 = 2) => {
      try {
        await enqueue(
          (current, id) => ({ id, type: 'inject-incident', state: current, input: { type, nodeId, severity } }),
          (response) => {
            if (!response.state) throw new Error('事件注入失败')
            applyState(response.state)
          },
        )
        optionsRef.current.onNotice?.('突发事件已注入，下一时间步自动派车')
      } catch (error) {
        optionsRef.current.onError?.(error instanceof Error ? error.message : '事件注入失败')
      }
    },
    [applyState, enqueue],
  )

  const addResource = useCallback(
    async (type: ResourceType, nodeId: string) => {
      try {
        await enqueue(
          (current, id) => ({ id, type: 'add-resource', state: current, resourceType: type, nodeId }),
          (response) => {
            if (!response.state) throw new Error('资源部署失败')
            applyState(response.state)
          },
        )
        optionsRef.current.onNotice?.('应急资源已部署到所选路口')
      } catch (error) {
        optionsRef.current.onError?.(error instanceof Error ? error.message : '资源部署失败')
      }
    },
    [applyState, enqueue],
  )

  const setRoadStatus = useCallback(
    async (edgeId: string, status: 'open' | 'closed', reason?: string) => {
      try {
        const next = await enqueue(
          (current, id) => ({ id, type: 'set-road', state: current, edgeId, status, reason }),
          (response) => {
            if (!response.state) throw new Error('道路状态更新失败')
            applyState(response.state)
            return response.state
          },
        )
        const edge = next.city.edges.find((candidate) => candidate.id === edgeId)
        const rerouted = next.events.some(
          (event) => event.time === next.time && event.kind === 'reroute' && event.title.includes('动态重规划'),
        )
        optionsRef.current.onNotice?.(
          `${edge?.name ?? '道路'}已${status === 'closed' ? '封闭' : '恢复'}${rerouted ? '，活动车辆已自动重规划' : ''}`,
        )
        return next
      } catch (error) {
        optionsRef.current.onError?.(error instanceof Error ? error.message : '道路状态更新失败')
        return undefined
      }
    },
    [applyState, enqueue],
  )

  const addRoad = useCallback(
    async (from: string, to: string) => {
      if (from === to) return
      try {
        if (stateRef.current.city.edges.some((edge) => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from))) {
          optionsRef.current.onNotice?.('这两个路口之间已有道路')
          return
        }
        await enqueue(
          (current, id) => ({ id, type: 'add-road', state: current, from, to }),
          (response) => {
            if (!response.state) throw new Error('道路创建失败')
            applyState(response.state)
          },
        )
        optionsRef.current.onNotice?.('新建应急通道已加入路网')
      } catch (error) {
        optionsRef.current.onError?.(error instanceof Error ? error.message : '道路创建失败')
      }
    },
    [applyState, enqueue],
  )

  const removeRoad = useCallback(
    async (edgeId: string) => {
      try {
        await enqueue(
          (current, id) => ({ id, type: 'remove-road', state: current, edgeId }),
          (response) => {
            if (!response.state) throw new Error('道路删除失败')
            applyState(response.state)
          },
        )
      } catch (error) {
        optionsRef.current.onError?.(error instanceof Error ? error.message : '道路删除失败')
      }
    },
    [applyState, enqueue],
  )

  const updateSettings = useCallback(
    async (patch: { pathAlgorithm?: PathAlgorithm; assignmentStrategy?: AssignmentStrategy }) => {
      try {
        await enqueue(
          (current, id) => ({ id, type: 'settings', state: current, patch }),
          (response) => {
            if (!response.state) throw new Error('参数更新失败')
            applyState(response.state)
          },
        )
      } catch (error) {
        optionsRef.current.onError?.(error instanceof Error ? error.message : '参数更新失败')
      }
    },
    [applyState, enqueue],
  )

  const compare = useCallback(
    async (incidentId?: string): Promise<AlgorithmComparison[]> => {
      try {
        return await enqueue(
          (current, id) => ({ id, type: 'compare', state: current, incidentId }),
          (response) => {
            if (!response.comparisons) throw new Error('算法对比失败')
            return response.comparisons
          },
        )
      } catch (error) {
        optionsRef.current.onError?.(error instanceof Error ? error.message : '算法对比失败')
        return []
      }
    },
    [enqueue],
  )

  const startDemo = useCallback(() => {
    setIsRunning(false)
    const next = createInitialState(sourceScenarioRef.current)
    applyState(next, false)
    setHistory([next])
    setDemoActive(true)
    setDemoStep(0)
    demoEdgeRef.current = undefined
    setSpeed('fast')
    window.setTimeout(() => setIsRunning(true), 120)
    optionsRef.current.onNotice?.('标准演示已启动：将自动注入断路并触发动态重规划')
  }, [applyState])

  useEffect(() => {
    if (!demoActive || demoStep !== 0 || state.time < 4) return
    const fireIncident = state.incidents.find((incident) => incident.type === 'fire')
    const route = state.resources.find(
      (resource) =>
        resource.status === 'enroute' &&
        resource.path.length > 2 &&
        (!fireIncident || resource.incidentId === fireIncident.id),
    )
    if (!route) {
      setDemoStep(1)
      return
    }
    const edgeId = pickRouteDisruptionEdge(state.city, route.path)
    if (!edgeId) {
      setDemoStep(1)
      return
    }
    demoEdgeRef.current = edgeId
    setDemoStep(1)
    void setRoadStatus(edgeId, 'closed', '演示剧情：滨江路施工突发中断')
  }, [demoActive, demoStep, setRoadStatus, state])

  const demoEdge = useMemo(
    () => state.city.edges.find((edge) => edge.id === demoEdgeRef.current),
    [state.city.edges],
  )

  const setDemoEdge = useCallback((edgeId: string) => {
    demoEdgeRef.current = edgeId
  }, [])

  return {
    state,
    history,
    isRunning,
    speed,
    demoActive,
    demoStep,
    demoEdge,
    setDemoEdge,
    setSpeed,
    start,
    pause,
    toggleRun,
    step: tick,
    reset,
    loadScenario,
    injectIncident,
    addResource,
    setRoadStatus,
    addRoad,
    removeRoad,
    updateSettings,
    compare,
    startDemo,
  }
}
