'use client'

import { useState } from 'react'
import { Plus, Trash2, FileText, Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/shared/utils'
import type { Ressource, RessourceType, ExerciceFormat } from '@/shared/schemas'

interface ResourceSectionProps {
  ressources: Ressource[]
  onOpen: (ressource: Ressource) => void
  onAdd: (type: RessourceType, formatExercice?: ExerciceFormat, titre?: string) => void
  onRemove: (ressourceId: string) => void
}

const TYPE_CONFIG: Record<RessourceType, { label: string; color: string }> = {
  cours:             { label: 'Cours',              color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  bilan:             { label: 'Bilan',              color: 'bg-green-500/10 text-green-400 border-green-500/30' },
  extrait_oeuvre:    { label: "Extrait d'œuvre",    color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  oeuvre_complete:   { label: 'Texte complet',      color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  exercice:          { label: 'Exercice',           color: 'bg-pink-500/10 text-pink-400 border-pink-500/30' },
  grille_evaluation: { label: "Grille d'évaluation", color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  fiche_methode:     { label: 'Fiche méthode',      color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  fiche_lecture:     { label: 'Fiche de lecture',   color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  carte_mentale:     { label: 'Carte mentale',      color: 'bg-teal-500/10 text-teal-400 border-teal-500/30' },
  dictee:            { label: 'Dictée',             color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
}

const FORMAT_OPTIONS: { value: ExerciceFormat; label: string }[] = [
  { value: 'texte_a_trous',      label: 'Texte à trous' },
  { value: 'relier_notions',     label: 'Relier les notions' },
  { value: 'entourer_reponse',   label: 'QCM / Entourer' },
  { value: 'questions_reponses', label: 'Questions / Réponses' },
  { value: 'libre',              label: 'Format libre' },
]

const DEFAULT_TITLES: Record<RessourceType, string> = {
  cours:             'Cours théorique',
  bilan:             'Bilan de séance',
  extrait_oeuvre:    "Extrait d'œuvre",
  oeuvre_complete:   'Texte court complet',
  exercice:          "Fiche d'exercice",
  grille_evaluation: "Grille d'évaluation",
  fiche_methode:     'Fiche méthode',
  fiche_lecture:     'Fiche de lecture',
  carte_mentale:     'Carte mentale',
  dictee:            'Dictée',
}

function StatusIcon({ status }: { status: Ressource['status'] }) {
  if (status === 'generating') return <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
  if (status === 'ready')      return <CheckCircle2 className="h-3 w-3 text-green-400" />
  if (status === 'error')      return <AlertCircle className="h-3 w-3 text-red-400" />
  return <Sparkles className="h-3 w-3 text-gray-500" />
}

export function ResourceSection({ ressources, onOpen, onAdd, onRemove }: ResourceSectionProps) {
  const [adding, setAdding] = useState(false)
  const [selectedType, setSelectedType] = useState<RessourceType>('cours')
  const [selectedFormat, setSelectedFormat] = useState<ExerciceFormat>('libre')
  const [customTitle, setCustomTitle] = useState('')

  const handleAdd = () => {
    const titre = customTitle.trim() || DEFAULT_TITLES[selectedType]
    onAdd(selectedType, selectedType === 'exercice' ? selectedFormat : undefined, titre)
    setAdding(false)
    setCustomTitle('')
    setSelectedType('cours')
    setSelectedFormat('libre')
  }

  return (
    <div className="mt-2 space-y-1.5">
      {/* Liste des ressources existantes */}
      {ressources.map((r) => {
        const cfg = TYPE_CONFIG[r.type]
        return (
          <div key={r.id} className="group flex items-center gap-2">
            <button
              onClick={() => onOpen(r)}
              className={cn(
                'flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all hover:brightness-110',
                cfg.color,
              )}
            >
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{r.titre}</span>
              {r.type === 'exercice' && r.format_exercice && (
                <span className="ml-auto shrink-0 text-[10px] font-mono opacity-60">
                  {r.format_exercice.replace(/_/g, ' ')}
                </span>
              )}
              <StatusIcon status={r.status} />
            </button>
            <button
              onClick={() => onRemove(r.id)}
              className="p-1 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
              title="Supprimer"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )
      })}

      {/* Formulaire d'ajout inline */}
      {adding ? (
        <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/50 p-3 space-y-2">
          {/* Sélecteur de type */}
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TYPE_CONFIG) as RessourceType[]).map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={cn(
                  'px-2 py-0.5 rounded text-xs border transition-all',
                  selectedType === t ? TYPE_CONFIG[t].color : 'text-gray-500 border-gray-800 hover:border-gray-700',
                )}
              >
                {TYPE_CONFIG[t].label}
              </button>
            ))}
          </div>

          {/* Format exercice */}
          {selectedType === 'exercice' && (
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value as ExerciceFormat)}
              className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
            >
              {FORMAT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          )}

          {/* Titre personnalisé */}
          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
            placeholder={DEFAULT_TITLES[selectedType]}
            autoFocus
            className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="flex-1 py-1 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              Ajouter
            </button>
            <button
              onClick={() => setAdding(false)}
              className="flex-1 py-1 text-xs rounded text-gray-500 hover:text-gray-300 transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-blue-400 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Ajouter une ressource
        </button>
      )}
    </div>
  )
}
