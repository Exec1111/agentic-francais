'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck, AlertTriangle, Lightbulb, ChevronDown, ChevronUp,
  Wand2, Loader2, Check, X, RotateCcw, Plus, Trash2, PenLine, Target, RefreshCw,
} from 'lucide-react'
import { cn } from '@/shared/utils'
import type { useSequenceEditor } from '@/frontend/hooks/useSequenceEditor'
import { useSuggestionApply, type SuggestionPreview } from '@/frontend/hooks/useSuggestionApply'
import type { Review, ActionableSuggestion, SuggestionAction } from '@/shared/schemas'

type EditorReturn = ReturnType<typeof useSequenceEditor>

// Compteur global servant à versionner les clés de liste : à chaque NOUVELLE
// review (relance), la version change → les SuggestionItem sont remontés et leur
// état local (« Appliqué ») repart à zéro, au lieu d'être réutilisé par position.
let reviewRenderSeq = 0

interface ReviewPanelProps {
  review: Review
  /** Optionnel : permet d'appliquer les correctifs depuis les suggestions. */
  editor?: EditorReturn
  provider?: string
  /** Optionnel : relance le Reviewer sur la séquence courante. */
  onRerun?: () => void
  rerunning?: boolean
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

// Métadonnées d'affichage par action
const ACTION_META: Record<SuggestionAction, { label: string; Icon: typeof Wand2 } | null> = {
  remplacer_activite: { label: 'Remplacer', Icon: RotateCcw },
  ajouter_activite: { label: 'Ajouter', Icon: Plus },
  supprimer_activite: { label: 'Supprimer', Icon: Trash2 },
  modifier_consigne: { label: 'Modifier', Icon: PenLine },
  modifier_objectifs: { label: 'Modifier', Icon: Target },
  aucune: null,
}

/** Tolère d'éventuelles suggestions au format texte (rétrocompat défensive). */
function asSuggestion(s: ActionableSuggestion | string): ActionableSuggestion {
  if (typeof s === 'string') {
    return { instruction: s, action: 'aucune', seance_numero: null, activite_titre: null }
  }
  return s
}

type ItemState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'preview'; preview: SuggestionPreview }
  | { phase: 'applied' }
  | { phase: 'error'; message: string }

function PreviewBody({ preview }: { preview: SuggestionPreview }) {
  switch (preview.kind) {
    case 'supprimer_activite':
      return <p className="text-gray-300">Supprimer l'activité « <strong>{preview.before.titre}</strong> ».</p>
    case 'ajouter_activite':
      return (
        <div className="space-y-1">
          <p className="text-green-400 font-medium">+ {preview.after.titre} <span className="text-gray-500 text-xs">({preview.after.type}, {preview.after.duree} min)</span></p>
          <p className="text-gray-400 text-xs">{preview.after.consigne}</p>
        </div>
      )
    case 'remplacer_activite':
      return (
        <div className="space-y-1">
          <p className="text-gray-500 line-through text-xs">{preview.before.titre}</p>
          <p className="text-green-400 font-medium">{preview.after.titre} <span className="text-gray-500 text-xs">({preview.after.type}, {preview.after.duree} min)</span></p>
          <p className="text-gray-400 text-xs">{preview.after.consigne}</p>
        </div>
      )
    case 'modifier_consigne':
      return (
        <div className="space-y-1">
          <p className="text-gray-500 line-through text-xs">{preview.before}</p>
          <p className="text-green-400 text-xs">{preview.after}</p>
        </div>
      )
    case 'modifier_objectifs':
      return (
        <div className="space-y-1 text-xs">
          <p className="text-gray-500">Avant : {preview.before.join(' · ') || '—'}</p>
          <p className="text-green-400">Après : {preview.after.join(' · ')}</p>
        </div>
      )
  }
}

function SuggestionItem({
  suggestion,
  apply,
}: {
  suggestion: ActionableSuggestion
  apply: ReturnType<typeof useSuggestionApply>
}) {
  const [state, setState] = useState<ItemState>({ phase: 'idle' })
  const meta = ACTION_META[suggestion.action]
  const blocker = apply.blocker(suggestion)
  const actionable = meta != null && blocker == null

  const handlePrepare = async () => {
    setState({ phase: 'loading' })
    try {
      const preview = await apply.prepare(suggestion)
      setState({ phase: 'preview', preview })
    } catch (e) {
      setState({ phase: 'error', message: e instanceof Error ? e.message : 'Erreur' })
    }
  }

  const handleConfirm = () => {
    if (state.phase !== 'preview') return
    apply.commit(state.preview)
    setState({ phase: 'applied' })
  }

  return (
    <li className="text-sm text-gray-400">
      <div className="flex gap-2 items-start">
        <span className="text-blue-500 mt-0.5">→</span>
        <div className="flex-1">
          <span>{suggestion.instruction}</span>
          {suggestion.seance_numero != null && (
            <span className="text-gray-600 text-xs"> (séance {suggestion.seance_numero}{suggestion.activite_titre ? ` · ${suggestion.activite_titre}` : ''})</span>
          )}
        </div>

        {actionable && state.phase === 'idle' && meta && (
          <button
            onClick={handlePrepare}
            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-blue-900/40 border border-blue-700/50 text-blue-300 hover:bg-blue-800/50 text-xs transition-colors"
          >
            <meta.Icon className="h-3 w-3" />
            {meta.label}
          </button>
        )}
        {state.phase === 'loading' && (
          <span className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-blue-400">
            <Loader2 className="h-3 w-3 animate-spin" /> Préparation…
          </span>
        )}
        {state.phase === 'applied' && (
          <span className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-green-400">
            <Check className="h-3 w-3" /> Appliqué
          </span>
        )}
        {!actionable && !meta && (
          <span className="shrink-0 px-2 py-1 text-[10px] text-gray-600 uppercase" title="Conseil général">manuel</span>
        )}
        {!actionable && meta && blocker && (
          <span className="shrink-0 px-2 py-1 text-[10px] text-gray-600" title={blocker}>
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </div>

      {/* Prévisualisation à valider */}
      <AnimatePresence>
        {state.phase === 'preview' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden ml-4 mt-2"
          >
            <div className="rounded-lg border border-blue-800/40 bg-blue-950/20 p-3 space-y-2">
              <PreviewBody preview={state.preview} />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleConfirm}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-700/60 hover:bg-green-600/60 text-green-100 text-xs"
                >
                  <Check className="h-3 w-3" /> Appliquer
                </button>
                <button
                  onClick={() => setState({ phase: 'idle' })}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs"
                >
                  <X className="h-3 w-3" /> Annuler
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {state.phase === 'error' && (
        <div className="ml-4 mt-1 flex items-center gap-2 text-xs text-red-400">
          <span>{state.message}</span>
          <button onClick={() => setState({ phase: 'idle' })} className="underline hover:text-red-300">réessayer</button>
        </div>
      )}
    </li>
  )
}

export function ReviewPanel({ review, editor, provider, onRerun, rerunning }: ReviewPanelProps) {
  const [open, setOpen] = useState(false)
  // Toujours appelé (règle des hooks) ; n'agit que si un éditeur est fourni.
  const apply = useSuggestionApply(editor, provider)
  const canApply = !!editor
  // Nouvelle référence de `review` (ex : après « Relancer ») → nouvelle version
  // → remount des suggestions (pas d'état « Appliqué » hérité d'une analyse passée).
  const reviewVersion = useMemo(() => ++reviewRenderSeq, [review])

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
              <div className="flex items-start gap-3 pt-3">
                <p className="text-sm text-gray-300 flex-1">{review.resume}</p>
                {onRerun && (
                  <button
                    onClick={onRerun}
                    disabled={rerunning}
                    title="Relancer la relecture qualité sur la séquence actuelle"
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-900/30 border border-amber-700/40 text-amber-300 hover:bg-amber-800/40 text-xs transition-colors disabled:opacity-50"
                  >
                    {rerunning
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />}
                    {rerunning ? 'Analyse…' : 'Relancer'}
                  </button>
                )}
              </div>
            </div>

            {/* Problèmes */}
            {review.problemes.length > 0 && (
              <div className="p-4 border-t border-gray-800">
                <h4 className="flex items-center gap-2 text-sm font-medium text-yellow-400 mb-3">
                  <AlertTriangle className="h-4 w-4" />
                  Problèmes détectés ({review.problemes.length})
                </h4>
                <div className="space-y-4">
                  {review.problemes.map((p, i) => {
                    const fixes = (p.suggestions ?? []).map((s) => asSuggestion(s as ActionableSuggestion))
                    return (
                      <div key={i}>
                        <div className="flex gap-2 text-sm">
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
                        {fixes.length > 0 && (
                          <ul className="space-y-3 mt-2 ml-4 pl-3 border-l border-gray-800">
                            {fixes.map((suggestion, j) =>
                              canApply ? (
                                <SuggestionItem key={`${reviewVersion}:${i}:${j}`} suggestion={suggestion} apply={apply} />
                              ) : (
                                <li key={j} className="text-sm text-gray-400 flex gap-2">
                                  <span className="text-blue-500 mt-0.5">→</span>
                                  {suggestion.instruction}
                                </li>
                              )
                            )}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Suggestions */}
            {review.suggestions.length > 0 && (
              <div className="p-4 border-t border-gray-800">
                <h4 className="flex items-center gap-2 text-sm font-medium text-blue-400 mb-3">
                  <Lightbulb className="h-4 w-4" />
                  Suggestions d'amélioration
                  {canApply && <span className="text-[10px] text-gray-600 font-normal normal-case">— cliquez pour appliquer</span>}
                </h4>
                <ul className="space-y-3">
                  {review.suggestions.map((s, i) => {
                    const suggestion = asSuggestion(s as ActionableSuggestion)
                    return canApply ? (
                      <SuggestionItem key={`${reviewVersion}:${i}`} suggestion={suggestion} apply={apply} />
                    ) : (
                      <li key={i} className="text-sm text-gray-400 flex gap-2">
                        <span className="text-blue-500 mt-0.5">→</span>
                        {suggestion.instruction}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
