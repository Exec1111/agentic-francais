'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles, Loader2, Printer, RefreshCw, GraduationCap, User,
  AlertCircle, Eye, Edit3, Save, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/shared/utils'
import { renderMarkdown, printResource } from './ResourcePanel'
import type { RessourceStructuree } from '@/shared/schemas'

interface EvaluationFinaleSectionProps {
  /** Id de la séquence (présent dès qu'elle a été générée). */
  sequenceId?: string
  /**
   * Déclenche la génération du bundle. Le parent garantit la sauvegarde préalable
   * de la séquence (FK) puis appelle l'API. Retourne la liste plate des ressources.
   */
  onGenerate: (consignes?: string) => Promise<RessourceStructuree[]>
}

type DocKey = 'sujetEleve' | 'sujetProf' | 'grilleEleve'

interface OrganizedBundle {
  sujetEleve?: RessourceStructuree
  sujetProf?: RessourceStructuree
  grilleEleve?: RessourceStructuree
}

const DOC_META: { key: DocKey; label: string; audience: 'eleve' | 'professeur' }[] = [
  { key: 'sujetEleve', label: 'Sujet — Élève', audience: 'eleve' },
  { key: 'sujetProf', label: 'Sujet — Professeur', audience: 'professeur' },
  { key: 'grilleEleve', label: 'Autoévaluation — Élève', audience: 'eleve' },
]

function organize(ressources: RessourceStructuree[]): OrganizedBundle {
  return {
    sujetEleve: ressources.find((r) => r.type === 'evaluation_sommative' && r.audience === 'eleve'),
    sujetProf: ressources.find((r) => r.type === 'evaluation_sommative' && r.audience === 'professeur'),
    grilleEleve: ressources.find((r) => r.type === 'grille_evaluation' && r.audience === 'eleve'),
  }
}

export function EvaluationFinaleSection({ sequenceId, onGenerate }: EvaluationFinaleSectionProps) {
  const [bundle, setBundle] = useState<OrganizedBundle>({})
  const [consignes, setConsignes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DocKey | null>(null)

  // Documents présents, dans l'ordre canonique
  const docs = DOC_META.filter((d) => bundle[d.key])
  const hasBundle = docs.length > 0
  const current = selected ? bundle[selected] : undefined
  const currentMeta = DOC_META.find((d) => d.key === selected)

  // Charge le bundle existant au montage / changement de séquence (lecture seule).
  useEffect(() => {
    if (!sequenceId) {
      setBundle({})
      return
    }
    let cancelled = false
    fetch(`/api/resources?sequence_id=${encodeURIComponent(sequenceId)}&scope=evaluation_finale`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.ressources)) return
        setBundle(organize(data.ressources))
      })
      .catch(() => { /* silencieux */ })
    return () => { cancelled = true }
  }, [sequenceId])

  // Sélectionne automatiquement le premier document disponible
  useEffect(() => {
    if (!selected && docs.length > 0) setSelected(docs[0].key)
    if (selected && !bundle[selected]) setSelected(docs[0]?.key ?? null)
  }, [bundle]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = useCallback(async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const ressources = await onGenerate(consignes.trim() || undefined)
      setBundle(organize(ressources))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la génération')
    } finally {
      setLoading(false)
    }
  }, [consignes, loading, onGenerate])

  // Reflète une sauvegarde d'un document dans le bundle.
  const handleSaved = useCallback((key: DocKey, markdown: string) => {
    setBundle((prev) => {
      const r = prev[key]
      if (!r) return prev
      return { ...prev, [key]: { ...r, contenu_markdown: markdown } }
    })
  }, [])

  return (
    <div className="space-y-4">
      <p className="text-xs text-red-200/60">
        Génère en une fois le sujet d'évaluation (versions élève et professeur avec barème
        et corrigé) et la fiche d'autoévaluation de l'élève, à partir du contenu complet de la séquence.
      </p>

      {/* Instructions complémentaires */}
      <textarea
        value={consignes}
        onChange={(e) => setConsignes(e.target.value)}
        placeholder="Instructions complémentaires (optionnel) : durée, type d'exercices, points de vigilance…"
        rows={2}
        disabled={loading}
        className="w-full text-sm bg-gray-900/50 border border-red-800/30 rounded-lg px-3 py-2 text-red-100/90 placeholder:text-red-200/30 focus:outline-none focus:border-red-600/50 resize-none disabled:opacity-50"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-red-900/50 border border-red-700/50 hover:bg-red-800/50 text-red-100 rounded-lg text-sm transition-all disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : hasBundle ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading
            ? 'Génération en cours…'
            : hasBundle
              ? "Régénérer l'évaluation finale"
              : "Générer l'évaluation finale"}
        </button>
        {loading && (
          <span className="text-xs text-red-200/50">
            Sujet puis autoévaluation — cela peut prendre un moment.
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-300 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Bundle : sélecteur de documents + vue/édition (style ResourcePanel) */}
      {hasBundle && (
        <div className="rounded-xl border border-gray-800 bg-gray-950/40 overflow-hidden">
          {/* Sélecteur */}
          <div className="flex flex-wrap gap-1.5 p-2 border-b border-gray-800 bg-gray-900/40">
            {docs.map((d) => {
              const isSel = d.key === selected
              return (
                <button
                  key={d.key}
                  onClick={() => setSelected(d.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                    isSel
                      ? 'bg-gray-800 border-gray-600 text-gray-100'
                      : 'border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700',
                  )}
                >
                  {d.audience === 'eleve' ? (
                    <GraduationCap className="h-3.5 w-3.5 text-blue-400" />
                  ) : (
                    <User className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  {d.label}
                </button>
              )
            })}
          </div>

          {/* Vue / édition du document sélectionné */}
          {current && currentMeta && (
            <EvalResourceView
              key={current.id}
              resource={current}
              docKey={currentMeta.key}
              onSaved={handleSaved}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Vue d'un document : aperçu rendu / édition Markdown + sauvegarde + impression ──
// Reproduit le comportement du ResourcePanel pour les ressources « schéma dédié ».

function EvalResourceView({
  resource,
  docKey,
  onSaved,
}: {
  resource: RessourceStructuree
  docKey: DocKey
  onSaved: (key: DocKey, markdown: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(resource.contenu_markdown)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = draft !== resource.contenu_markdown

  const handleSave = useCallback(async () => {
    if (saving || !dirty) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch(`/api/resources/${resource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu_markdown: draft }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      onSaved(docKey, draft)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }, [saving, dirty, resource.id, draft, docKey, onSaved])

  return (
    <div>
      {/* Barre d'actions */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/70 bg-gray-900/30">
        <div className="flex gap-1 bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setEditing(false)}
            className={cn('p-1.5 transition-colors', !editing ? 'bg-gray-700 text-gray-100' : 'text-gray-600 hover:text-gray-400')}
            title="Aperçu rendu"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setEditing(true)}
            className={cn('p-1.5 transition-colors', editing ? 'bg-gray-700 text-gray-100' : 'text-gray-600 hover:text-gray-400')}
            title="Éditer le Markdown"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {editing && (
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs transition-all disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {saved ? 'Enregistré' : 'Enregistrer'}
            </button>
          )}
          <button
            onClick={() => printResource(resource, resource.audience)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all',
              resource.audience === 'eleve'
                ? 'border-blue-800/50 text-blue-400 hover:bg-blue-500/10'
                : 'border-amber-800/50 text-amber-400 hover:bg-amber-500/10',
            )}
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimer
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-2 flex items-start gap-2 text-xs text-red-300 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Contenu */}
      <div className="p-4 max-h-[32rem] overflow-y-auto scrollbar-thin">
        {!editing ? (
          <div
            className="prose prose-invert max-w-none font-sans"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(resource.contenu_markdown) }}
          />
        ) : (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full min-h-[28rem] bg-transparent border-0 resize-none font-mono text-sm text-gray-300 focus:outline-none leading-relaxed"
            placeholder="Contenu Markdown…"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  )
}
