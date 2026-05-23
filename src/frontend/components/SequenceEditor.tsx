'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Target, Award, Clock, FileText, Plus, Trash2,
  ChevronUp, ChevronDown, Undo2, Redo2, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/shared/utils'
import { EditableText } from './EditableText'
import { EditableList } from './EditableList'
import { ResourceSection } from './ResourceSection'
import { ResourceDrawer } from './ResourceDrawer'
import type { useSequenceEditor, SequencePath } from '@/frontend/hooks/useSequenceEditor'
import type { Activite, Ressource, RessourceType, ExerciceFormat } from '@/shared/schemas'

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

const ACTIVITY_TYPES = [
  'exercice', 'production_ecrite', 'debat', 'lecture',
  'oral', 'evaluation', 'collaboration', 'recherche',
]

type EditorReturn = ReturnType<typeof useSequenceEditor>

interface DrawerState {
  ressource: Ressource
  seanceIndex: number
  activiteIndex?: number
  corpusRef?: string
  sequenceContext: {
    sequenceTitle: string
    niveau: string
    theme: string
    seanceTitle: string
    activiteTitle?: string
    activiteType?: string
  }
}

interface SequenceEditorProps {
  editor: EditorReturn
  provider?: string
}

export function SequenceEditor({ editor, provider }: SequenceEditorProps) {
  const { sequence } = editor
  const [drawer, setDrawer] = useState<DrawerState | null>(null)

  const openDrawer = useCallback((
    ressource: Ressource,
    seanceIndex: number,
    activiteIndex: number | undefined,
    seanceTitle: string,
    activiteTitle?: string,
    activiteType?: string,
    corpusRef?: string,
  ) => {
    if (!sequence) return
    setDrawer({
      ressource,
      seanceIndex,
      activiteIndex,
      corpusRef,
      sequenceContext: {
        sequenceTitle: sequence.titre,
        niveau: sequence.niveau,
        theme: sequence.theme,
        seanceTitle,
        activiteTitle,
        activiteType,
      },
    })
  }, [sequence])

  if (!sequence) return null

  return (
    <>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Toolbar undo/redo */}
      <div className="flex items-center gap-2 justify-end">
        <span className="text-xs text-gray-600 mr-2">
          {editor.isDirty && '● Modifié'}
        </span>
        <button
          onClick={editor.undo}
          disabled={!editor.canUndo}
          className={cn(
            'p-1.5 rounded-lg border transition-all',
            editor.canUndo
              ? 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 bg-gray-800'
              : 'border-gray-800 text-gray-700 cursor-not-allowed bg-gray-900'
          )}
          title="Annuler (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={editor.redo}
          disabled={!editor.canRedo}
          className={cn(
            'p-1.5 rounded-lg border transition-all',
            editor.canRedo
              ? 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 bg-gray-800'
              : 'border-gray-800 text-gray-700 cursor-not-allowed bg-gray-900'
          )}
          title="Rétablir (Ctrl+Y)"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      {/* En-tête séquence */}
      <div className="bg-gradient-to-br from-primary-900/40 to-primary-950/40 rounded-xl border border-primary-700/30 p-6">
        <div className="flex items-center gap-2 text-primary-400 text-sm mb-2">
          <BookOpen className="h-4 w-4" />
          <EditableText
            value={sequence.niveau}
            onSave={(v) => editor.updateField({ level: 'sequence', field: 'niveau' }, v)}
            className="text-primary-400 text-sm"
          />
          <span className="text-primary-600">—</span>
          <EditableText
            value={sequence.theme}
            onSave={(v) => editor.updateField({ level: 'sequence', field: 'theme' }, v)}
            className="text-primary-400 text-sm"
          />
        </div>
        <EditableText
          value={sequence.titre}
          onSave={(v) => editor.updateField({ level: 'sequence', field: 'titre' }, v)}
          className="text-2xl font-bold text-white"
          as="h1"
        />
        <EditableText
          value={sequence.problematique || ''}
          onSave={(v) => editor.updateField({ level: 'sequence', field: 'problematique' }, v)}
          className="text-primary-300 italic mt-2"
          placeholder="Ajouter une problématique..."
          as="p"
        />

        {/* Corpus de la séquence */}
        {sequence.corpus_refs && sequence.corpus_refs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-primary-800/40">
            <span className="text-xs text-primary-500 font-semibold uppercase tracking-wider">
              Corpus :
            </span>
            {sequence.corpus_refs.map((ref) => (
              <span
                key={ref}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-700/40"
              >
                <BookOpen className="h-3 w-3 shrink-0" />
                {ref.replace(/-/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Objectifs & Compétences */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-3">
            <Target className="h-4 w-4 text-blue-400" />
            Objectifs
          </h3>
          <EditableList
            items={sequence.objectifs}
            onUpdate={(i, v) => editor.updateListItem({ level: 'sequence', field: 'objectifs' }, i, v)}
            onAdd={(v) => editor.addListItem({ level: 'sequence', field: 'objectifs' }, v)}
            onRemove={(i) => editor.removeListItem({ level: 'sequence', field: 'objectifs' }, i)}
            bulletColor="text-blue-500"
            placeholder="Nouvel objectif..."
            addLabel="Ajouter un objectif"
          />
        </div>

        <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-3">
            <Award className="h-4 w-4 text-emerald-400" />
            Compétences
          </h3>
          <EditableList
            items={sequence.competences}
            onUpdate={(i, v) => editor.updateListItem({ level: 'sequence', field: 'competences' }, i, v)}
            onAdd={(v) => editor.addListItem({ level: 'sequence', field: 'competences' }, v)}
            onRemove={(i) => editor.removeListItem({ level: 'sequence', field: 'competences' }, i)}
            bulletColor="text-emerald-500"
            placeholder="Nouvelle compétence..."
            addLabel="Ajouter une compétence"
          />
        </div>
      </div>

      {/* Séances */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-200">Séances</h2>
          <button
            onClick={() => editor.addSeance({
              numero: sequence.seances.length + 1,
              titre: 'Nouvelle séance',
              duree: 55,
              objectifs: [],
              activites: [],
              ressources: [],
            })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-700 text-xs text-gray-500 hover:text-primary-400 hover:border-primary-700/50 transition-all"
          >
            <Plus className="h-3 w-3" />
            Ajouter une séance
          </button>
        </div>

        {sequence.seances.map((seance, si) => (
          <SeanceBlock
            key={`seance-${si}-${seance.numero}`}
            seance={seance}
            seanceIndex={si}
            totalSeances={sequence.seances.length}
            editor={editor}
            onOpenDrawer={openDrawer}
            corpusCount={sequence.corpus_refs?.length ?? 0}
          />
        ))}
      </div>

      {/* Évaluation finale */}
      <div className="bg-red-950/30 rounded-xl border border-red-800/30 p-4">
        <h3 className="text-sm font-semibold text-red-300 mb-2">Évaluation finale</h3>
        <EditableText
          value={sequence.evaluation_finale || ''}
          onSave={(v) => editor.updateField({ level: 'sequence', field: 'evaluation_finale' }, v)}
          className="text-sm text-red-200/80"
          placeholder="Ajouter une évaluation finale..."
          multiline
          as="p"
        />
      </div>
    </motion.div>

    {/* Drawer ressources (rendu en dehors du flux pour éviter les problèmes de z-index) */}
    <ResourceDrawer
      isOpen={drawer !== null}
      onClose={() => setDrawer(null)}
      ressource={drawer?.ressource ?? null}
      seanceIndex={drawer?.seanceIndex ?? 0}
      activiteIndex={drawer?.activiteIndex}
      corpusRef={drawer?.corpusRef}
      sequenceContext={drawer?.sequenceContext ?? { sequenceTitle: '', niveau: '', theme: '', seanceTitle: '' }}
      onUpdateContent={(si, ai, id, contenu, fmt) => {
        editor.updateRessourceContent(si, ai, id, contenu, fmt)
        setDrawer((d) => d && d.ressource.id === id
          ? { ...d, ressource: { ...d.ressource, contenu, status: 'ready', format_exercice: fmt ?? d.ressource.format_exercice } }
          : d)
      }}
      onUpdateStatus={(si, ai, id, status) => {
        editor.updateRessourceStatus(si, ai, id, status)
        setDrawer((d) => d && d.ressource.id === id ? { ...d, ressource: { ...d.ressource, status } } : d)
      }}
      provider={provider}
    />
    </>
  )
}

// === Bloc Séance ===

function SeanceBlock({
  seance,
  seanceIndex,
  totalSeances,
  editor,
  onOpenDrawer,
  corpusCount,
}: {
  seance: any
  seanceIndex: number
  totalSeances: number
  editor: EditorReturn
  onOpenDrawer: (r: Ressource, si: number, ai: number | undefined, seanceTitre: string, activiteTitre?: string, activiteType?: string, corpusRef?: string) => void
  corpusCount: number
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: seanceIndex * 0.05 }}
      className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden"
    >
      {/* Header séance */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        {/* Drag / reorder */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            onClick={() => seanceIndex > 0 && editor.moveSeance(seanceIndex, seanceIndex - 1)}
            disabled={seanceIndex === 0}
            className={cn('p-0.5', seanceIndex > 0 ? 'text-gray-500 hover:text-white' : 'text-gray-800')}
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            onClick={() => seanceIndex < totalSeances - 1 && editor.moveSeance(seanceIndex, seanceIndex + 1)}
            disabled={seanceIndex >= totalSeances - 1}
            className={cn('p-0.5', seanceIndex < totalSeances - 1 ? 'text-gray-500 hover:text-white' : 'text-gray-800')}
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-900/50 text-primary-400 text-xs font-bold shrink-0">
          {seance.numero}
        </span>

        <div className="flex-1 min-w-0">
          <EditableText
            value={seance.titre}
            onSave={(v) => editor.updateField({ level: 'seance', seanceIndex, field: 'titre' }, v)}
            className="font-medium text-gray-200"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="h-3 w-3" />
            <EditableText
              value={String(seance.duree)}
              onSave={(v) => editor.updateField({ level: 'seance', seanceIndex, field: 'duree' }, Number(v) || 55)}
              className="text-xs text-gray-500 w-8 text-center"
            />
            <span>min</span>
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 text-gray-600 hover:text-gray-300"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            onClick={() => editor.removeSeance(seanceIndex)}
            className="p-1 text-gray-700 hover:text-red-400 transition-colors"
            title="Supprimer la séance"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Objectifs séance */}
            <div className="px-4 py-3 border-b border-gray-800/50">
              <span className="text-xs text-gray-600 uppercase font-semibold mb-2 block">Objectifs de la séance</span>
              <EditableList
                items={seance.objectifs}
                onUpdate={(i, v) => editor.updateListItem({ level: 'seance', seanceIndex, field: 'objectifs' }, i, v)}
                onAdd={(v) => editor.addListItem({ level: 'seance', seanceIndex, field: 'objectifs' }, v)}
                onRemove={(i) => editor.removeListItem({ level: 'seance', seanceIndex, field: 'objectifs' }, i)}
                bulletColor="text-primary-500"
                placeholder="Nouvel objectif..."
                addLabel="Ajouter"
              />
            </div>

            {/* Ressources de séance */}
            <div className="px-4 py-3 border-b border-gray-800/50">
              <span className="text-xs text-gray-600 uppercase font-semibold block mb-1">Ressources de séance</span>
              <ResourceSection
                ressources={seance.ressources || []}
                onOpen={(r) => onOpenDrawer(r, seanceIndex, undefined, seance.titre)}
                onAdd={(type, fmt, titre) => {
                  const id = `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
                  editor.addRessource(seanceIndex, undefined, { id, titre: titre || type, type, format_exercice: fmt, status: 'empty', contenu: '' })
                }}
                onRemove={(id) => editor.removeRessource(seanceIndex, undefined, id)}
              />
            </div>

            {/* Activités */}
            <div className="p-4 space-y-3">
              <span className="text-xs text-gray-600 uppercase font-semibold">Activités</span>

              {seance.activites.map((activite: Activite, ai: number) => (
                <ActiviteBlock
                  key={`act-${seanceIndex}-${ai}`}
                  activite={activite}
                  seanceIndex={seanceIndex}
                  activiteIndex={ai}
                  totalActivites={seance.activites.length}
                  editor={editor}
                  onOpenDrawer={onOpenDrawer}
                  seanceTitre={seance.titre}
                  corpusCount={corpusCount}
                />
              ))}

              <button
                onClick={() => editor.addActivite(seanceIndex, {
                  titre: 'Nouvelle activité',
                  type: 'exercice',
                  duree: 15,
                  consigne: '',
                  ressources: [],
                })}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-gray-700 text-xs text-gray-600 hover:text-primary-400 hover:border-primary-700/50 transition-all"
              >
                <Plus className="h-3 w-3" />
                Ajouter une activité
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// === Bloc Activité ===

function ActiviteBlock({
  activite,
  seanceIndex,
  activiteIndex,
  totalActivites,
  editor,
  onOpenDrawer,
  seanceTitre,
  corpusCount,
}: {
  activite: Activite
  seanceIndex: number
  activiteIndex: number
  totalActivites: number
  editor: EditorReturn
  onOpenDrawer: (r: Ressource, si: number, ai: number | undefined, seanceTitre: string, activiteTitre?: string, activiteType?: string, corpusRef?: string) => void
  seanceTitre: string
  corpusCount: number
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 group',
        TYPE_COLORS[activite.type] || 'bg-gray-800/50 text-gray-300 border-gray-700',
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Move up/down */}
          <div className="flex flex-col gap-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => activiteIndex > 0 && editor.moveActivite(seanceIndex, activiteIndex, activiteIndex - 1)}
              disabled={activiteIndex === 0}
              className={cn('p-0', activiteIndex > 0 ? 'hover:text-white' : 'text-transparent')}
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              onClick={() => activiteIndex < totalActivites - 1 && editor.moveActivite(seanceIndex, activiteIndex, activiteIndex + 1)}
              disabled={activiteIndex >= totalActivites - 1}
              className={cn('p-0', activiteIndex < totalActivites - 1 ? 'hover:text-white' : 'text-transparent')}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>

          <FileText className="h-3.5 w-3.5 shrink-0" />
          <EditableText
            value={activite.titre}
            onSave={(v) => editor.updateField({ level: 'activite', seanceIndex, activiteIndex, field: 'titre' }, v)}
            className="text-sm font-medium"
          />
        </div>
        <div className="flex items-center gap-2 text-xs opacity-70 shrink-0">
          <select
            value={activite.type}
            onChange={(e) => editor.updateField({ level: 'activite', seanceIndex, activiteIndex, field: 'type' }, e.target.value)}
            className="bg-transparent border-none text-xs capitalize cursor-pointer focus:outline-none hover:opacity-100"
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
          <span>•</span>
          <EditableText
            value={String(activite.duree)}
            onSave={(v) => editor.updateField({ level: 'activite', seanceIndex, activiteIndex, field: 'duree' }, Number(v) || 15)}
            className="text-xs w-6 text-center"
          />
          <span>min</span>
          <button
            onClick={() => editor.removeActivite(seanceIndex, activiteIndex)}
            className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
            title="Supprimer"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <EditableText
        value={activite.consigne}
        onSave={(v) => editor.updateField({ level: 'activite', seanceIndex, activiteIndex, field: 'consigne' }, v)}
        className="text-xs opacity-80 mt-1"
        placeholder="Ajouter une consigne..."
        multiline
        as="p"
      />

      {activite.supports && activite.supports.length > 0 && (
        <div className="mt-2">
          <EditableList
            items={activite.supports}
            onUpdate={(i, v) => editor.updateListItem({ level: 'activite', seanceIndex, activiteIndex, field: 'supports' }, i, v)}
            onAdd={(v) => editor.addListItem({ level: 'activite', seanceIndex, activiteIndex, field: 'supports' }, v)}
            onRemove={(i) => editor.removeListItem({ level: 'activite', seanceIndex, activiteIndex, field: 'supports' }, i)}
            bulletColor="opacity-60"
            placeholder="Support..."
            addLabel="Ajouter un support"
          />
        </div>
      )}

      <CorpusBadge
        status={activite.corpus_status}
        corpusRef={activite.corpus_ref}
        suggestion={activite.corpus_suggestion}
        sequenceCorpusCount={corpusCount}
      />

      <ResourceSection
        ressources={activite.ressources || []}
        onOpen={(r) => onOpenDrawer(r, seanceIndex, activiteIndex, seanceTitre, activite.titre, activite.type, activite.corpus_ref)}
        onAdd={(type, fmt, titre) => {
          const id = `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          editor.addRessource(seanceIndex, activiteIndex, { id, titre: titre || type, type, format_exercice: fmt, status: 'empty', contenu: '' })
        }}
        onRemove={(id) => editor.removeRessource(seanceIndex, activiteIndex, id)}
      />
    </div>
  )
}

// === Badge Corpus ===

import type { CorpusSuggestion } from '@/shared/schemas'

function CorpusBadge({
  status,
  corpusRef,
  suggestion,
  sequenceCorpusCount,
}: {
  status?: string
  corpusRef?: string
  suggestion?: CorpusSuggestion
  sequenceCorpusCount: number
}) {
  if (!status || status === 'non_requis') return null

  // Texte trouvé : n'afficher que si plusieurs textes coexistent dans la séquence
  // (sinon l'info est déjà visible dans l'en-tête de séquence)
  if (status === 'trouve' && corpusRef) {
    if (sequenceCorpusCount <= 1) return null
    // Plusieurs textes → indiquer lequel est utilisé ici (compact)
    const shortLabel = corpusRef.split('-').slice(0, 2).join(' ')
    return (
      <div className="mt-2 mb-1">
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-500/80 border border-emerald-800/30">
          <BookOpen className="h-2.5 w-2.5 shrink-0" />
          {shortLabel}
        </span>
      </div>
    )
  }

  // Texte manquant avec suggestion IA
  if (status === 'manquant' && suggestion) {
    return (
      <div className="mt-2 mb-1">
        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-950/50 text-amber-400 border border-amber-700/40">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Texte manquant · Suggestion : {suggestion.auteur}, <em className="ml-0.5">{suggestion.oeuvre}</em>
        </span>
      </div>
    )
  }

  // Texte manquant sans suggestion
  if (status === 'manquant' || status === 'manquant_sans_suggestion') {
    return (
      <div className="mt-2 mb-1">
        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-gray-900/50 text-gray-500 border border-gray-700/30">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Aucun texte disponible dans le corpus
        </span>
      </div>
    )
  }

  return null
}
