'use client'

import { motion } from 'framer-motion'
import { BookOpen, Target, Award, Clock, FileText } from 'lucide-react'
import { cn } from '@/shared/utils'

interface Activite {
  titre: string
  type: string
  duree: number
  consigne: string
  supports?: string[]
}

interface Seance {
  numero: number
  titre: string
  duree: number
  objectifs: string[]
  activites: Activite[]
}

interface Sequence {
  titre: string
  niveau: string
  theme: string
  problematique?: string
  objectifs: string[]
  competences: string[]
  seances: Seance[]
  evaluation_finale?: string
}

interface SequenceViewProps {
  sequence: Sequence
}

const TYPE_COLORS: Record<string, string> = {
  exercice: 'bg-blue-900/30 text-blue-300 border-blue-700/50',
  production_ecrite: 'bg-purple-900/30 text-purple-300 border-purple-700/50',
  debat: 'bg-orange-900/30 text-orange-300 border-orange-700/50',
  lecture: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50',
  oral: 'bg-pink-900/30 text-pink-300 border-pink-700/50',
  evaluation: 'bg-red-900/30 text-red-300 border-red-700/50',
  collaboration: 'bg-cyan-900/30 text-cyan-300 border-cyan-700/50',
  recherche: 'bg-yellow-900/30 text-yellow-300 border-yellow-700/50',
}

export function SequenceView({ sequence }: SequenceViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* En-tête */}
      <div className="bg-gradient-to-br from-primary-900/40 to-primary-950/40 rounded-xl border border-primary-700/30 p-6">
        <div className="flex items-center gap-2 text-primary-400 text-sm mb-2">
          <BookOpen className="h-4 w-4" />
          <span>{sequence.niveau} — {sequence.theme}</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">{sequence.titre}</h1>
        {sequence.problematique && (
          <p className="text-primary-300 italic">« {sequence.problematique} »</p>
        )}
      </div>

      {/* Objectifs & Compétences */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-3">
            <Target className="h-4 w-4 text-blue-400" />
            Objectifs
          </h3>
          <ul className="space-y-2">
            {sequence.objectifs.map((obj, i) => (
              <li key={i} className="text-sm text-gray-400 flex gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                {obj}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-3">
            <Award className="h-4 w-4 text-emerald-400" />
            Compétences
          </h3>
          <ul className="space-y-2">
            {sequence.competences.map((comp, i) => (
              <li key={i} className="text-sm text-gray-400 flex gap-2">
                <span className="text-emerald-500 mt-0.5">•</span>
                {comp}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Séances */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-200">Séances</h2>
        {sequence.seances.map((seance, index) => (
          <motion.div
            key={seance.numero}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden"
          >
            {/* Header séance */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-900/50 text-primary-400 text-xs font-bold">
                  {seance.numero}
                </span>
                <h3 className="font-medium text-gray-200">{seance.titre}</h3>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                {seance.duree} min
              </div>
            </div>

            {/* Objectifs séance */}
            {seance.objectifs.length > 0 && (
              <div className="px-4 py-2 border-b border-gray-800/50">
                <div className="flex flex-wrap gap-2">
                  {seance.objectifs.map((obj, i) => (
                    <span key={i} className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">
                      {obj}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Activités */}
            {seance.activites.length > 0 && (
              <div className="p-4 space-y-3">
                {seance.activites.map((activite, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-lg border p-3',
                      TYPE_COLORS[activite.type] || 'bg-gray-800/50 text-gray-300 border-gray-700',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5" />
                        <span className="text-sm font-medium">{activite.titre}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs opacity-70">
                        <span className="capitalize">{activite.type.replace('_', ' ')}</span>
                        <span>• {activite.duree} min</span>
                      </div>
                    </div>
                    <p className="text-xs opacity-80 mt-1">{activite.consigne}</p>
                    {activite.supports && activite.supports.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {activite.supports.map((s, j) => (
                          <span key={j} className="text-xs bg-black/20 px-2 py-0.5 rounded">
                            📎 {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Évaluation finale */}
      {sequence.evaluation_finale && (
        <div className="bg-red-950/30 rounded-xl border border-red-800/30 p-4">
          <h3 className="text-sm font-semibold text-red-300 mb-2">📝 Évaluation finale</h3>
          <p className="text-sm text-red-200/80">{sequence.evaluation_finale}</p>
        </div>
      )}
    </motion.div>
  )
}
