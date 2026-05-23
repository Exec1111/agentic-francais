'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, AlertTriangle, Plus, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/shared/utils'
import type { CorpusSuggestResponse } from '@/app/api/corpus/suggest/route'

interface CorpusSelectorProps {
  response: CorpusSuggestResponse
  onConfirm: (selectedRefs: string[]) => void
  onSkip: () => void
  isLoading?: boolean
}

const NIVEAU_LABELS: Record<string, string> = {
  sixieme: '6e', cinquieme: '5e', quatrieme: '4e', troisieme: '3e',
  seconde: '2nde', premiere: '1re', terminale: 'Tle',
}

/** Vrai si aucun des niveaux du texte ne correspond aux niveaux recherchés. */
function hasNiveauMismatch(itemNiveaux: string[], niveauxRecherches: string[]): boolean {
  if (niveauxRecherches.length === 0) return false // niveau inconnu → pas d'avertissement
  return !itemNiveaux.some((n) => niveauxRecherches.includes(n))
}

/** Formate la liste de niveaux d'un texte pour l'afficher dans le badge. */
function formatNiveaux(niveaux: string[]): string {
  return niveaux.map((n) => NIVEAU_LABELS[n] ?? n).join(' / ')
}

export function CorpusSelector({
  response,
  onConfirm,
  onSkip,
  isLoading = false,
}: CorpusSelectorProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(response.corpus_found.map((item) => item.id))
  )

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = () => onConfirm(Array.from(selected))

  const displayNiveau = NIVEAU_LABELS[response.niveau] ?? response.niveau

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/60 rounded-xl border border-gray-800 p-5 space-y-5"
    >
      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-400" />
            Textes du corpus pour cette séquence
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {displayNiveau} — {response.theme}
          </p>
        </div>
        <button
          onClick={onSkip}
          className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1 transition-colors"
        >
          Ignorer
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Textes trouvés dans le corpus */}
      {response.corpus_found.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Disponibles dans votre corpus
          </p>
          {response.corpus_found.map((item) => {
            const mismatch = hasNiveauMismatch(item.niveaux, response.niveaux_recherches)
            return (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
                  selected.has(item.id)
                    ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300'
                    : 'bg-gray-900/40 border-gray-800 text-gray-400 hover:border-gray-700'
                )}
              >
                {/* Checkbox */}
                <div className={cn(
                  'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                  selected.has(item.id) ? 'border-emerald-500 bg-emerald-500' : 'border-gray-600'
                )}>
                  {selected.has(item.id) && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                {/* Infos texte */}
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm block truncate">
                    {item.auteur}, <em>« {item.oeuvre} »</em>
                  </span>
                  <span className="text-xs opacity-60 block truncate">
                    {item.titre} · {item.genres.join(', ')}
                    {item.pages && ` · ${item.pages}`}
                  </span>

                  {/* Badge niveau décalé */}
                  {mismatch && (
                    <span className="inline-flex items-center gap-1 mt-1.5 text-xs px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-700/40">
                      <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                      Prévu pour {formatNiveaux(item.niveaux)} — à adapter
                    </span>
                  )}
                </div>

                <BookOpen className="h-4 w-4 shrink-0 opacity-50" />
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-900/30 rounded-lg p-3 border border-gray-800">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          Aucun texte trouvé dans votre corpus pour ce thème.
        </div>
      )}

      {/* Suggestions IA */}
      {response.suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-amber-400" />
            Suggérés par l'IA (à ajouter au corpus)
          </p>
          {response.suggestions.map((sugg, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-lg border border-amber-900/30 bg-amber-950/20 text-amber-300/80"
            >
              <Plus className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm block">
                  {sugg.auteur}, <em>« {sugg.oeuvre} »</em>
                </span>
                <span className="text-xs opacity-70 block mt-0.5">{sugg.extrait_recommande}</span>
                <span className="text-xs opacity-50 block mt-0.5 italic">{sugg.pourquoi}</span>
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-600 pl-1">
            Ces textes ne sont pas dans votre corpus. Ajoutez-les via <code className="text-gray-500">data/corpus/</code> pour les utiliser dans la génération.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-800">
        <span className="text-xs text-gray-600">
          {selected.size === 0
            ? 'Aucun texte sélectionné — génération sans corpus'
            : `${selected.size} texte${selected.size > 1 ? 's' : ''} sélectionné${selected.size > 1 ? 's' : ''}`}
        </span>
        <button
          onClick={handleConfirm}
          disabled={isLoading}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
            selected.size > 0
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {selected.size > 0 ? 'Générer avec ces textes' : 'Générer sans corpus'}
        </button>
      </div>
    </motion.div>
  )
}
