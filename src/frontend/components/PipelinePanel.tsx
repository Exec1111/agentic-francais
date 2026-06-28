'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Bot, X } from 'lucide-react'
import { WorkflowPipeline, WorkflowProgress } from './WorkflowPipeline'
import { ReactTrace, ReactStepData } from './ReactTrace'

type AgentName = 'orchestrateur' | 'architecte' | 'conseiller' | 'generateur' | 'reviewer'
type AgentStatus = 'idle' | 'running' | 'done' | 'error'

interface AgentState {
  name: AgentName
  status: AgentStatus
  logs: string[]
}

interface PipelinePanelProps {
  isOpen: boolean
  onClose: () => void
  agents: AgentState[]
  progress: WorkflowProgress | null
  isRunning: boolean
  reactSteps: ReactStepData[]
}

export function PipelinePanel({ isOpen, onClose, agents, progress, isRunning, reactSteps }: PipelinePanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-y-0 right-0 w-full max-w-md bg-gray-950 border-l border-gray-800 z-[100] flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-white">Pipeline Agentique</h2>
              {isRunning && (
                <span className="text-xs bg-purple-900/50 text-purple-400 px-2 py-0.5 rounded-full animate-pulse">
                  en cours…
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-gray-400 hover:text-white bg-gray-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Contenu */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-6">
            <WorkflowPipeline agents={agents} progress={progress} isRunning={isRunning} />
            <ReactTrace steps={reactSteps} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
