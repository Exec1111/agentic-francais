'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, AlertTriangle, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/shared/utils'

interface Problem {
  type: string
  description: string
  seance_concernee?: number
}

interface Review {
  score_qualite: number
  problemes: Problem[]
  suggestions: string[]
  resume: string
}

interface ReviewPanelProps {
  review: Review
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

function getScoreLabel(score: number) {
  if (score >= 80) return 'Bonne qualité'
  if (score >= 60) return 'Améliorations possibles'
  return 'Problèmes détectés'
}

export function ReviewPanel({ review }: ReviewPanelProps) {
  const [open, setOpen] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden"
    >
      {/* Header — toujours visible, cliquable */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full p-4 flex items-center gap-4 hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-400" />
          <h3 className="font-semibold text-gray-200">Relecture Qualité</h3>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className={cn('text-2xl font-bold', getScoreColor(review.score_qualite))}>
            {review.score_qualite}
          </span>
          <span className="text-xs text-gray-500">/100</span>
          <span className={cn('text-xs px-2 py-1 rounded-full',
            review.score_qualite >= 80 ? 'bg-green-900/50 text-green-400' :
            review.score_qualite >= 60 ? 'bg-yellow-900/50 text-yellow-400' :
            'bg-red-900/50 text-red-400'
          )}>
            {getScoreLabel(review.score_qualite)}
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Résumé */}
            <div className="px-4 pb-3 border-t border-gray-800">
              <p className="text-sm text-gray-300 pt-3">{review.resume}</p>
            </div>

            {/* Problèmes */}
            {review.problemes.length > 0 && (
              <div className="p-4 border-t border-gray-800">
                <h4 className="flex items-center gap-2 text-sm font-medium text-yellow-400 mb-3">
                  <AlertTriangle className="h-4 w-4" />
                  Problèmes détectés ({review.problemes.length})
                </h4>
                <div className="space-y-2">
                  {review.problemes.map((p, i) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <span className="text-yellow-500/70 text-xs mt-0.5 shrink-0 uppercase font-mono">
                        [{p.type}]
                      </span>
                      <span className="text-gray-400">
                        {p.description}
                        {p.seance_concernee && (
                          <span className="text-gray-600"> (séance {p.seance_concernee})</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions */}
            {review.suggestions.length > 0 && (
              <div className="p-4 border-t border-gray-800">
                <h4 className="flex items-center gap-2 text-sm font-medium text-blue-400 mb-3">
                  <Lightbulb className="h-4 w-4" />
                  Suggestions
                </h4>
                <ul className="space-y-2">
                  {review.suggestions.map((s, i) => (
                    <li key={i} className="text-sm text-gray-400 flex gap-2">
                      <span className="text-blue-500 mt-0.5">→</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
