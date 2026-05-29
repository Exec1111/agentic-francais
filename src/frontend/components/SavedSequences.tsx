'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, Trash2, Clock, Plus } from 'lucide-react'
import type { SequenceSummary } from '@/frontend/hooks/useSequenceStore'

interface Props {
  sequences: SequenceSummary[]
  loading: boolean
  onLoad: (id: string) => void
  onDelete: (id: string) => void
  onRefresh: () => void
  onNew: () => void
}

export function SavedSequences({ sequences, loading, onLoad, onDelete, onRefresh, onNew }: Props) {
  useEffect(() => {
    onRefresh()
  }, [onRefresh])

  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <FolderOpen className="h-4 w-4 text-primary-400" />
        <h3 className="text-sm font-medium text-gray-300">Séquences sauvegardées</h3>
        {sequences.length > 0 && <span className="text-xs text-gray-600">({sequences.length})</span>}
        <button
          onClick={onNew}
          className="ml-auto flex items-center justify-center h-6 w-6 rounded-md bg-primary-600 hover:bg-primary-500 text-white transition-all"
          title="Nouvelle séquence"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading && sequences.length === 0 && (
        <p className="text-xs text-gray-600 animate-pulse">Chargement...</p>
      )}

      {!loading && sequences.length === 0 && (
        <button
          onClick={onNew}
          className="w-full flex flex-col items-center gap-2 py-8 rounded-lg border border-dashed border-gray-800 text-gray-600 hover:text-primary-400 hover:border-primary-700/50 transition-all"
        >
          <Plus className="h-6 w-6" />
          <span className="text-xs">Créer une première séquence</span>
        </button>
      )}

      <AnimatePresence>
        <div className="space-y-2">
          {sequences.map((seq) => (
            <motion.div
              key={seq.id}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-950/50 border border-gray-800 hover:border-primary-700/50 transition-all cursor-pointer"
              onClick={() => onLoad(seq.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 truncate group-hover:text-white transition-colors">
                  {seq.titre}
                </p>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-gray-600 truncate">
                    {seq.niveau} · {seq.seanceCount} séance{seq.seanceCount > 1 ? 's' : ''}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-gray-700 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(seq.createdAt)}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(seq.id) }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-950/50 text-gray-600 hover:text-red-400 transition-all"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}
