'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Zap, Eye, ChevronRight } from 'lucide-react'
import { cn } from '@/shared/utils'

export interface ReactStepData {
  step: number
  thought?: string
  action?: string
  actionInput?: string
  observation?: string
  status: 'thinking' | 'acting' | 'observing' | 'done'
}

interface ReactTraceProps {
  steps: ReactStepData[]
}

export function ReactTrace({ steps }: ReactTraceProps) {
  if (steps.length === 0) return null

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
        <Brain className="h-4 w-4 text-purple-400" />
        Raisonnement ReAct
      </h2>
      <div className="space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin pr-2">
        <AnimatePresence>
          {steps.map((step) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-900/70 rounded-lg border border-gray-800 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/50 bg-gray-900/50">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-900/50 text-purple-400 text-[10px] font-bold">
                  {step.step}
                </span>
                <span className="text-xs text-gray-500">
                  Étape {step.step}
                </span>
                {step.status === 'thinking' && (
                  <span className="ml-auto text-xs text-purple-400 animate-pulse">réflexion...</span>
                )}
                {step.status === 'acting' && (
                  <span className="ml-auto text-xs text-blue-400 animate-pulse">exécution...</span>
                )}
                {step.status === 'done' && (
                  <span className="ml-auto text-xs text-green-500">✓</span>
                )}
              </div>

              <div className="p-3 space-y-2">
                {/* THOUGHT */}
                {step.thought && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-2"
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-purple-900/40">
                      <Brain className="h-3 w-3 text-purple-400" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">Thought</span>
                      <p className="text-xs text-gray-300 mt-0.5 leading-relaxed">{step.thought}</p>
                    </div>
                  </motion.div>
                )}

                {/* ACTION */}
                {step.action && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="flex gap-2"
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-blue-900/40">
                      <Zap className="h-3 w-3 text-blue-400" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">Action</span>
                      <p className="text-xs text-gray-200 mt-0.5 font-mono">
                        <span className="text-blue-300">{step.action}</span>
                        {step.actionInput && (
                          <span className="text-gray-500">({step.actionInput})</span>
                        )}
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* OBSERVATION */}
                {step.observation && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex gap-2"
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-900/40">
                      <Eye className="h-3 w-3 text-emerald-400" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Observation</span>
                      <p className="text-xs text-gray-300 mt-0.5">{step.observation}</p>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
