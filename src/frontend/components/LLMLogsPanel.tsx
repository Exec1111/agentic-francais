'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, X, RefreshCw, Trash2, ChevronDown, ChevronRight, Clock, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { cn } from '@/shared/utils'

interface LLMCallLog {
  id: number
  timestamp: string
  provider: string
  messages: { role: string; content: string }[]
  options?: { temperature?: number; json?: boolean }
  response?: string
  error?: string
  durationMs: number
}

interface LLMLogsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function LLMLogsPanel({ isOpen, onClose }: LLMLogsPanelProps) {
  const [logs, setLogs] = useState<LLMCallLog[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchLogs = useCallback(async () => {
    try {
      const resp = await fetch('/api/logs')
      if (resp.ok) {
        const data = await resp.json()
        setLogs(data)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (!isOpen) return
    fetchLogs()
    if (autoRefresh) {
      const interval = setInterval(fetchLogs, 2000)
      return () => clearInterval(interval)
    }
  }, [isOpen, autoRefresh, fetchLogs])

  const clearLogs = async () => {
    await fetch('/api/logs', { method: 'DELETE' })
    setLogs([])
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-y-0 right-0 w-full max-w-2xl bg-gray-950 border-l border-gray-800 z-[100] flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-green-400" />
              <h2 className="text-sm font-semibold text-white">LLM Call Logs</h2>
              <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                {logs.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={cn(
                  'p-1.5 rounded text-xs',
                  autoRefresh ? 'text-green-400 bg-green-900/30' : 'text-gray-500 bg-gray-800'
                )}
                title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', autoRefresh && 'animate-spin')} style={{ animationDuration: '3s' }} />
              </button>
              <button onClick={fetchLogs} className="p-1.5 rounded text-gray-400 hover:text-white bg-gray-800">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button onClick={clearLogs} className="p-1.5 rounded text-gray-400 hover:text-red-400 bg-gray-800">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={onClose} className="p-1.5 rounded text-gray-400 hover:text-white bg-gray-800">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Logs */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-2">
            {logs.length === 0 && (
              <div className="text-center py-12 text-gray-600 text-sm">
                Aucun appel LLM enregistré.
              </div>
            )}

            {logs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  'rounded-lg border overflow-hidden',
                  log.error ? 'border-red-800/50 bg-red-950/20' : 'border-gray-800 bg-gray-900/50'
                )}
              >
                {/* Log header */}
                <button
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-gray-800/50 transition-colors"
                >
                  {expandedId === log.id ? (
                    <ChevronDown className="h-3 w-3 text-gray-500 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-gray-500 shrink-0" />
                  )}
                  <span className="text-xs font-mono text-gray-500">#{log.id}</span>
                  <span className="text-xs font-medium text-blue-400">{log.provider}</span>
                  <div className="flex items-center gap-1 text-xs text-gray-500 ml-auto">
                    <Clock className="h-3 w-3" />
                    {log.durationMs}ms
                  </div>
                  {log.error && <span className="text-xs text-red-400">ERROR</span>}
                </button>

                {/* Log details */}
                {expandedId === log.id && (
                  <div className="px-3 pb-3 space-y-3 border-t border-gray-800/50">
                    {/* Messages envoyés */}
                    <div className="mt-2">
                      <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-orange-400 mb-1">
                        <ArrowUpRight className="h-3 w-3" />
                        Input ({log.messages.length} messages)
                      </div>
                      {log.messages.map((msg, i) => (
                        <div key={i} className="mb-2">
                          <span className={cn(
                            'text-[10px] uppercase font-bold',
                            msg.role === 'system' ? 'text-purple-400' :
                            msg.role === 'user' ? 'text-blue-400' : 'text-green-400'
                          )}>
                            {msg.role}:
                          </span>
                          <pre className="text-xs text-gray-300 mt-0.5 whitespace-pre-wrap font-mono bg-black/30 rounded p-2 max-h-40 overflow-y-auto scrollbar-thin">
                            {msg.content}
                          </pre>
                        </div>
                      ))}
                    </div>

                    {/* Réponse */}
                    {log.response && (
                      <div>
                        <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-green-400 mb-1">
                          <ArrowDownLeft className="h-3 w-3" />
                          Output
                        </div>
                        <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-black/30 rounded p-2 max-h-60 overflow-y-auto scrollbar-thin">
                          {log.response}
                        </pre>
                      </div>
                    )}

                    {/* Erreur */}
                    {log.error && (
                      <div>
                        <div className="text-[10px] uppercase font-bold text-red-400 mb-1">Error</div>
                        <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono bg-red-950/30 rounded p-2">
                          {log.error}
                        </pre>
                      </div>
                    )}

                    {/* Options */}
                    {log.options && (
                      <div className="text-[10px] text-gray-600">
                        Options: temp={log.options.temperature} json={String(log.options.json)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
