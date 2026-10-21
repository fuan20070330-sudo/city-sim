import { useEffect, useRef, useState } from 'react'
import {
  Database,
  Download,
  FileJson,
  FolderOpen,
  HardDrive,
  Map,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import type { CityScenario, SimulationState } from '../types'
import { createDefaultScenario } from '../data/defaultScenario'
import {
  deleteSavedScenario,
  downloadScenario,
  listSavedScenarios,
  parseScenarioFile,
  saveScenario,
  scenarioCounts,
  scenarioFromState,
  type SavedScenarioRecord,
} from '../lib/scenario'
import { compactTime } from '../lib/format'

interface ScenarioModalProps {
  open: boolean
  state: SimulationState
  onClose: () => void
  onLoad: (scenario: CityScenario) => void
  onNotice: (message: string) => void
  onError: (message: string) => void
}

function ScenarioSummary({ scenario }: { scenario: CityScenario }) {
  const counts = scenarioCounts(scenario)
  return (
    <div className="scenario-summary">
      <span><Map size={12} /> {counts.nodes} 节点</span>
      <span>{counts.roads} 路段</span>
      <span>{scenario.resources.length} 资源</span>
      <span>{scenario.incidents.length} 事件</span>
    </div>
  )
}

export function ScenarioModal({ open, state, onClose, onLoad, onNotice, onError }: ScenarioModalProps) {
  const [name, setName] = useState(state.scenarioName)
  const [records, setRecords] = useState<SavedScenarioRecord[]>([])
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setName(state.scenarioName)
    setRecords(listSavedScenarios())
  }, [open, state.scenarioName])

  if (!open) return null

  const currentScenario = scenarioFromState(state)

  const handleSave = () => {
    try {
      const scenario = {
        ...currentScenario,
        name: name.trim() || currentScenario.name,
      }
      setRecords(saveScenario(scenario))
      onNotice('场景已保存到本机浏览器')
    } catch (error) {
      onError(error instanceof Error ? error.message : '场景保存失败')
    }
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const scenario = parseScenarioFile(await file.text())
      onLoad(scenario)
      onClose()
    } catch (error) {
      onError(error instanceof Error ? error.message : '场景文件解析失败')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleLoad = (scenario: CityScenario) => {
    onLoad(scenario)
    onClose()
  }

  const handleDelete = (id: string) => {
    setRecords(deleteSavedScenario(id))
    onNotice('本机场景记录已删除')
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="scenario-modal" role="dialog" aria-modal="true" aria-labelledby="scenario-modal-title" data-testid="scenario-modal">
        <header className="modal-header">
          <div className="modal-title-mark"><Database size={21} /></div>
          <div>
            <span className="section-kicker">SCENARIO WORKBENCH</span>
            <h2 id="scenario-modal-title">场景与路网工作台</h2>
            <p>保存当前路网、车辆编成与事件配置，或从 JSON 文件恢复完整推演场景。</p>
          </div>
          <button type="button" className="icon-button modal-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="modal-grid">
          <div className="modal-primary">
            <section className="modal-section">
              <div className="modal-section-heading">
                <div>
                  <span className="section-kicker">CURRENT SNAPSHOT</span>
                  <h3>保存当前场景</h3>
                </div>
                <span className="local-badge"><HardDrive size={12} /> 本机存储</span>
              </div>
              <label className="field-label" htmlFor="scenario-name">场景名称</label>
              <div className="scenario-save-row">
                <input
                  id="scenario-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={48}
                />
                <button type="button" className="primary-button" onClick={handleSave} data-testid="save-scenario-button">
                  <Save size={15} /> 保存
                </button>
              </div>
              <div className="current-scenario-card">
                <div className="current-scenario-icon"><Map size={24} /></div>
                <div>
                  <strong>{name || state.scenarioName}</strong>
                  <p>{state.description}</p>
                  <ScenarioSummary scenario={currentScenario} />
                </div>
              </div>
              <div className="storage-note">
                保存内容只写入浏览器 localStorage，不会上传到任何服务器。导出的 JSON 可用于现场备份与评委复现。
              </div>
            </section>

            <section className="modal-section">
              <div className="modal-section-heading">
                <div>
                  <span className="section-kicker">PORTABLE FORMAT</span>
                  <h3>导入与导出</h3>
                </div>
                <FileJson size={19} />
              </div>
              <div className="file-actions">
                <button type="button" className="file-action" onClick={() => fileRef.current?.click()}>
                  <Upload size={18} />
                  <span><strong>载入 JSON 场景</strong><small>支持版本 1 场景文件</small></span>
                </button>
                <button type="button" className="file-action" onClick={() => downloadScenario(currentScenario)}>
                  <Download size={18} />
                  <span><strong>导出当前场景</strong><small>生成离线可复现备份</small></span>
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => void handleImport(event.target.files?.[0])}
              />
            </section>
          </div>

          <div className="modal-library">
            <div className="modal-section-heading library-heading">
              <div>
                <span className="section-kicker">LOCAL LIBRARY</span>
                <h3>本机场景库</h3>
              </div>
              <span className="count-pill">{records.length}</span>
            </div>
            <button type="button" className="builtin-scenario" onClick={() => handleLoad(createDefaultScenario())}>
              <span className="builtin-icon"><Database size={18} /></span>
              <span>
                <strong>滨江核心区 · 火灾链式响应</strong>
                <small>内置标准演示场景 · 9 资源 / 2 事件</small>
              </span>
              <FolderOpen size={15} />
            </button>
            <div className="saved-scenario-list">
              {records.length === 0 && (
                <div className="library-empty">
                  <FileJson size={26} />
                  <strong>暂无本机保存记录</strong>
                  <p>编辑路网或部署新资源后，在左侧保存当前场景。</p>
                </div>
              )}
              {records.map((record) => (
                <article className="saved-scenario" key={record.scenario.id + record.savedAt}>
                  <button type="button" className="saved-scenario-main" onClick={() => handleLoad(record.scenario)}>
                    <span className="saved-icon"><Map size={17} /></span>
                    <span>
                      <strong>{record.scenario.name}</strong>
                      <small>{compactTime(record.savedAt)}</small>
                      <ScenarioSummary scenario={record.scenario} />
                    </span>
                  </button>
                  <button type="button" className="delete-scenario" onClick={() => handleDelete(record.scenario.id)} aria-label="删除场景">
                    <Trash2 size={14} />
                  </button>
                </article>
              ))}
            </div>
          </div>
        </div>

        <footer className="modal-footer">
          <span><HardDrive size={13} /> 单机优先 · 无后端依赖</span>
          <button type="button" className="ghost-button" onClick={onClose}>关闭</button>
        </footer>
      </section>
    </div>
  )
}
