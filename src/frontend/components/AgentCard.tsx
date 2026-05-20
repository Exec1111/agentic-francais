'use client'

import { motion } from 'framer-motion'
import { Bot, Brain, Pencil, ShieldCheck, Loader2 } from 'lucide-react'
import { cn } from '@/shared/utils'

type AgentStatus = 'idle' | 'running' | 'done' | 'error'
type AgentName = 'orchestrateur' | 'architecte' | 'generateur' | 'reviewer'

interface AgentCardProps {
  name: AgentName
  status: AgentStatus
  logs: string[]
}

const AGENT_CONFIG: Record<AgentName, {
  label: string
  description: string
  icon: typeof Bot
  color: string
  bgColor: string
  borderColor: string
  glowColor: string
}> = {
  orchestrateur: {
    label: 'Orchestrateur',
    description: 'Analyse la demande et pilote le workflow',
    icon: Bot,
    color: 'text-purple-400',
    bgColor: 'bg-purple-950/50',
    borderColor: 'border-purple-500/30',
    glowColor: 'shadow-purple-500/20',
  },
  architecte: {
    label: 'Architecte Pédagogique',
    description: 'Structure la séquence et les séances',
    icon: Brain,
    color: 'text-blue-400',
    bgColor: 'bg-blue-950/50',
    borderColor: 'border-blue-500/30',
    glowColor: 'shadow-blue-500/20',
  },
  generateur: {
    label: 'Générateur d\'Activités',
    description: 'Crée les activités pédagogiques',
    icon: Pencil,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-950/50',
    borderColor: 'border-emerald-500/30',
    glowColor: 'shadow-emerald-500/20',
  },
  reviewer: {
    label: 'Reviewer Qualité',
    description: 'Vérifie la cohérence pédagogique',
    icon: ShieldCheck,
    color: 'text-amber-400',
    bgColor: 'bg-amber-950/50',
    borderColor: 'border-amber-500/30',
    glowColor: 'shadow-amber-500/20',
  },
}

export function AgentCard({ name, status, logs }: AgentCardProps) {
  const config = AGENT_CONFIG[name]
  const Icon = config.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'relative rounded-xl border p-4 transition-all duration-500',
        config.bgColor,
        config.borderColor,
        status === 'running' && `shadow-lg ${config.glowColor}`,
        status === 'done' && 'opacity-90',
        status === 'idle' && 'opacity-50',
      )}
    >
      {/* Barre de statut lumineuse */}
      {status === 'running' && (
        <motion.div
          className={cn('absolute top-0 left-0 right-0 h-0.5 rounded-t-xl', config.color.replace('text-', 'bg-'))}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.5 }}
        />
      )}

      <div className="flex items-start gap-3">
        {/* Icône */}
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg',
          status === 'running' ? config.color.replace('text-', 'bg-').replace('400', '900') : 'bg-gray-800',
        )}>
          {status === 'running' ? (
            <Loader2 className={cn('h-5 w-5 animate-spin', config.color)} />
          ) : (
            <Icon className={cn('h-5 w-5', status === 'done' ? config.color : 'text-gray-500')} />
          )}
        </div>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={cn('font-semibold text-sm', status !== 'idle' ? config.color : 'text-gray-500')}>
              {config.label}
            </h3>
            {status === 'done' && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full"
              >
                ✓
              </motion.span>
            )}
            {status === 'error' && (
              <span className="text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full">
                ✗
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{config.description}</p>

          {/* Logs en temps réel */}
          {logs.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="mt-2 space-y-1 max-h-32 overflow-y-auto scrollbar-thin"
            >
              {logs.map((log, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="text-xs text-gray-400 font-mono"
                >
                  {log}
                </motion.p>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
