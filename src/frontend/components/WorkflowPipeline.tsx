'use client'

import { motion } from 'framer-motion'
import { AgentCard } from './AgentCard'
import { ArrowDown } from 'lucide-react'
import { cn } from '@/shared/utils'

type AgentName = 'orchestrateur' | 'architecte' | 'conseiller' | 'generateur' | 'reviewer'
type AgentStatus = 'idle' | 'running' | 'done' | 'error'

interface AgentState {
  name: AgentName
  status: AgentStatus
  logs: string[]
}

export interface WorkflowProgress {
  percent: number
  label: string
}

interface WorkflowPipelineProps {
  agents: AgentState[]
  progress?: WorkflowProgress | null
  isRunning?: boolean
}

const PIPELINE_ORDER: AgentName[] = ['orchestrateur', 'architecte', 'conseiller', 'generateur', 'reviewer']

export function WorkflowPipeline({ agents, progress, isRunning }: WorkflowPipelineProps) {
  const showProgress = isRunning || (progress !== null && progress !== undefined)
  const percent = progress?.percent ?? 0
  const isDone = percent === 100

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Pipeline Agentique
      </h2>

      {/* Barre de progression */}
      {showProgress && (
        <div className="mb-5 space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400 truncate pr-2">
              {progress?.label ?? 'Initialisation…'}
            </span>
            <span className={cn(
              'text-xs font-mono tabular-nums shrink-0',
              isDone ? 'text-green-400' : 'text-gray-500',
            )}>
              {percent}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                isDone
                  ? 'bg-green-500'
                  : 'bg-gradient-to-r from-primary-600 via-primary-500 to-purple-500',
              )}
              initial={{ width: '0%' }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {PIPELINE_ORDER.map((agentName, index) => {
        const agent = agents.find(a => a.name === agentName) || {
          name: agentName,
          status: 'idle' as AgentStatus,
          logs: [],
        }

        const prevAgent = index > 0 ? agents.find(a => a.name === PIPELINE_ORDER[index - 1]) : null
        const showConnector = index > 0

        return (
          <div key={agentName}>
            {/* Connecteur entre agents */}
            {showConnector && (
              <div className="flex justify-center py-1">
                <motion.div
                  className={cn(
                    'flex flex-col items-center',
                    prevAgent?.status === 'done' ? 'text-green-500' : 'text-gray-700',
                  )}
                  animate={prevAgent?.status === 'done' ? { opacity: [0.5, 1, 0.5] } : {}}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <div className={cn(
                    'w-0.5 h-3',
                    prevAgent?.status === 'done' ? 'bg-green-500/50' : 'bg-gray-800',
                  )} />
                  <ArrowDown className="h-3 w-3" />
                  <div className={cn(
                    'w-0.5 h-3',
                    prevAgent?.status === 'done' ? 'bg-green-500/50' : 'bg-gray-800',
                  )} />
                </motion.div>
              </div>
            )}

            <AgentCard
              name={agent.name}
              status={agent.status}
              logs={agent.logs}
            />
          </div>
        )
      })}
    </div>
  )
}
