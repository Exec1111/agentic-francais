'use client'

import { motion } from 'framer-motion'
import { AgentCard } from './AgentCard'
import { ArrowDown } from 'lucide-react'
import { cn } from '@/shared/utils'

type AgentName = 'orchestrateur' | 'architecte' | 'generateur' | 'reviewer'
type AgentStatus = 'idle' | 'running' | 'done' | 'error'

interface AgentState {
  name: AgentName
  status: AgentStatus
  logs: string[]
}

interface WorkflowPipelineProps {
  agents: AgentState[]
}

const PIPELINE_ORDER: AgentName[] = ['orchestrateur', 'architecte', 'generateur', 'reviewer']

export function WorkflowPipeline({ agents }: WorkflowPipelineProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Pipeline Agentique
      </h2>

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
