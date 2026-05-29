'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Target, Award, Clock, FileText, Plus, Trash2, X, Search,
  ChevronUp, ChevronDown, ChevronRight, Undo2, Redo2, AlertTriangle,
  RefreshCw, Loader2, Sparkles, User, GraduationCap, Lock,
} from 'lucide-react'
import { cn } from '@/shared/utils'
import { EditableText } from './EditableText'
import { EditableList } from './EditableList'
import { ResourceSection } from './ResourceSection'
import { ResourceDrawer } from './ResourceDrawer'
import { ResourcePanel } from './ResourcePanel'
import type { ResourcePanelContext } from './ResourcePanel'
import type { useSequenceEditor, SequencePath } from '@/frontend/hooks/useSequenceEditor'
import type { Activite, Ressource, RessourceType, ExerciceFormat } from '@/shared/schemas'

// Config visuelle des types de ressources IA (utilisée dans l'accordéon)
const RESOURCE_TYPE_CONFIG: Record<string, { label: string; chip: string }> = {
  cours:             { label: 'Cours',          chip: 'bg-blue-500/10 text-blue-400 border-blue-600/30' },
  bilan:             { label: 'Bilan',          chip: 'bg-green-500/10 text-green-400 border-green-600/30' },
  extrait_oeuvre:    { label: "Extrait d'œuvre",chip: 'bg-purple-500/10 text-purple-400 border-purple-600/30' },
  oeuvre_complete:   { label: 'Texte complet',  chip: 'bg-amber-500/10 text-amber-400 border-amber-600/30' },
  exercice:          { label: 'Exercice',       chip: 'bg-pink-500/10 text-pink-400 border-pink-600/30' },
  grille_evaluation: { label: "Grille d'éval.", chip: 'bg-orange-500/10 text-orange-400 border-orange-600/30' },
  fiche_methode:     { label: 'Fiche méthode',  chip: 'bg-cyan-500/10 text-cyan-400 border-cyan-600/30' },
  fiche_lecture:     { label: 'Fiche lecture',  chip: 'bg-indigo-500/10 text-indigo-400 border-indigo-600/30' },
  carte_mentale:     { label: 'Carte mentale',  chip: 'bg-teal-500/10 text-teal-400 border-teal-600/30' },
  dictee:            { label: 'Dictée',         chip: 'bg-rose-500/10 text-rose-400 border-rose-600/30' },
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

const ACTIVITY_TYPES = [
  'exercice', 'production_ecrite', 'debat', 'lecture',
  'oral', 'evaluation', 'collaboration', 'recherche',
]

// Types d'activités qui bénéficient d'un texte du corpus (même définition que côté serveur)
const CORPUS_ACTIVITE_TYPES = new Set(['lecture', 'exercice', 'production_ecrite'])

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

const PANEL_CLOSED: ResourcePanelContext = {
  sequenceTitle: '', niveau: '', theme: '',
  seanceNumero: 1, seanceTitle: '',
  activiteTitre: '', activiteType: 'exercice', activiteConsigne: '',
}

export function SequenceEditor({ editor, provider }: SequenceEditorProps) {
  const { sequence } = editor
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelContext, setPanelContext] = useState<ResourcePanelContext>(PANEL_CLOSED)
  // refreshKey[activiteId] s'incrémente à chaque fermeture du panel → ActiviteBlock recharge son compteur
  const [refreshKey, setRefreshKey] = useState<Record<string, number>>({})
  const [objectifsOpen, setObjectifsOpen] = useState(false)
  const [competencesOpen, setCompetencesOpen] = useState(false)

  const openResourcePanel = useCallback((ctx: ResourcePanelContext) => {
    setPanelContext(ctx)
    setPanelOpen(true)
  }, [])

  const handlePanelClose = useCallback(() => {
    // Incrémenter le refreshKey de l'activité active → ActiviteBlock recharge son compteur
    if (panelContext.activiteId) {
      setRefreshKey(prev => ({
        ...prev,
        [panelContext.activiteId!]: (prev[panelContext.activiteId!] ?? 0) + 1,
      }))
    }
    setPanelOpen(false)
  }, [panelContext.activiteId])

  const handleRegenerateActivite = useCallback(async (
    seanceIndex: number,
    activiteIndex: number,
    motif: string,
  ) => {
    if (!sequence) return
    const seance = sequence.seances[seanceIndex]
    const activite = seance.activites[activiteIndex]

    const res = await fetch('/api/generate/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seanceContext: {
          titre_sequence: sequence.titre,
          niveau: sequence.niveau,
          theme: sequence.theme,
          objectifs_sequence: sequence.objectifs,
          seanceNumero: seance.numero,
          seanceTitre: seance.titre,
          seanceObjectifs: seance.objectifs,
          seanceDuree: seance.duree,
          autresActivites: seance.activites
            .filter((_, i) => i !== activiteIndex)
            .map((a) => ({ titre: a.titre, type: a.type, duree: a.duree })),
        },
        activiteActuelle: {
          titre: activite.titre,
          type: activite.type,
          duree: activite.duree,
          consigne: activite.consigne,
        },
        motif,
        provider,
        corpus_refs: sequence.corpus_refs,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Erreur serveur')
    }

    const data = await res.json()

    // Fix C : Ré-évaluer le lien corpus avec les textes actuels de la séquence.
    // Si l'activité n'avait pas de corpus_ref mais que la séquence en a un, on le lie maintenant.
    const newCorpusRef = (() => {
      if (activite.corpus_ref) return activite.corpus_ref           // Déjà lié — on conserve
      if (!sequence.corpus_refs?.length) return undefined            // Pas de texte dans la séquence
      if (!CORPUS_ACTIVITE_TYPES.has(activite.type)) return undefined // Type non concerné
      return sequence.corpus_refs[0]                                 // Premier texte disponible
    })()

    editor.replaceActivite(seanceIndex, activiteIndex, {
      ...data.activite,
      ressources: activite.ressources || [],
      corpus_ref: newCorpusRef,
      corpus_status: newCorpusRef
        ? 'trouve'
        : (activite.corpus_status ?? data.activite.corpus_status),
      corpus_suggestion: activite.corpus_suggestion,
    })
  }, [sequence, provider, editor])

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

        {/* Corpus de la séquence — gestion inline */}
        <CorpusManager
          corpusRefs={sequence.corpus_refs ?? []}
          onAdd={(ref) => editor.updateField(
            { level: 'sequence', field: 'corpus_refs' },
            [...(sequence.corpus_refs ?? []), ref],
          )}
          onRemove={(ref) => editor.updateField(
            { level: 'sequence', field: 'corpus_refs' },
            (sequence.corpus_refs ?? []).filter(r => r !== ref),
          )}
        />
      </div>

      {/* Objectifs */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
        <button
          onClick={() => setObjectifsOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center gap-2 hover:bg-gray-800/30 transition-colors"
        >
          <Target className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-300">Objectifs</h3>
          <span className="ml-1 text-xs text-gray-600">({sequence.objectifs.length})</span>
          <div className="ml-auto">
            {objectifsOpen ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
          </div>
        </button>
        <AnimatePresence>
          {objectifsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-gray-800 px-4 py-3"
            >
              <EditableList
                items={sequence.objectifs}
                onUpdate={(i, v) => editor.updateListItem({ level: 'sequence', field: 'objectifs' }, i, v)}
                onAdd={(v) => editor.addListItem({ level: 'sequence', field: 'objectifs' }, v)}
                onRemove={(i) => editor.removeListItem({ level: 'sequence', field: 'objectifs' }, i)}
                bulletColor="text-blue-500"
                placeholder="Nouvel objectif..."
                addLabel="Ajouter un objectif"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Compétences */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
        <button
          onClick={() => setCompetencesOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center gap-2 hover:bg-gray-800/30 transition-colors"
        >
          <Award className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-gray-300">Compétences</h3>
          <span className="ml-1 text-xs text-gray-600">({sequence.competences.length})</span>
          <div className="ml-auto">
            {competencesOpen ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
          </div>
        </button>
        <AnimatePresence>
          {competencesOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-gray-800 px-4 py-3"
            >
              <EditableList
                items={sequence.competences}
                onUpdate={(i, v) => editor.updateListItem({ level: 'sequence', field: 'competences' }, i, v)}
                onAdd={(v) => editor.addListItem({ level: 'sequence', field: 'competences' }, v)}
                onRemove={(i) => editor.removeListItem({ level: 'sequence', field: 'competences' }, i)}
                bulletColor="text-emerald-500"
                placeholder="Nouvelle compétence..."
                addLabel="Ajouter une compétence"
              />
            </motion.div>
          )}
        </AnimatePresence>
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
            onOpenPanel={openResourcePanel}
            onRegenerate={handleRegenerateActivite}
            sequenceCorpusRefs={sequence.corpus_refs ?? []}
            sequenceTitle={sequence.titre}
            niveau={sequence.niveau}
            theme={sequence.theme}
            refreshKey={refreshKey}
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

    {/* Drawer ressources — ancien système (backward compat) */}
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

    {/* Resource Panel — nouveau système structuré (élève + prof) */}
    <ResourcePanel
      isOpen={panelOpen}
      onClose={handlePanelClose}
      context={panelContext}
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
  onOpenPanel,
  onRegenerate,
  sequenceCorpusRefs,
  sequenceTitle,
  niveau,
  theme,
  refreshKey,
}: {
  seance: any
  seanceIndex: number
  totalSeances: number
  editor: EditorReturn
  onOpenDrawer: (r: Ressource, si: number, ai: number | undefined, seanceTitre: string, activiteTitre?: string, activiteType?: string, corpusRef?: string) => void
  onOpenPanel: (ctx: ResourcePanelContext) => void
  onRegenerate: (si: number, ai: number, motif: string) => Promise<void>
  sequenceCorpusRefs: string[]
  sequenceTitle: string
  niveau: string
  theme: string
  refreshKey: Record<string, number>
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
                  onOpenPanel={onOpenPanel}
                  onRegenerate={onRegenerate}
                  seanceTitre={seance.titre}
                  seanceNumero={seance.numero}
                  sequenceCorpusRefs={sequenceCorpusRefs}
                  sequenceTitle={sequenceTitle}
                  niveau={niveau}
                  theme={theme}
                  refreshTrigger={refreshKey[activite.id ?? ''] ?? 0}
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
  onOpenPanel,
  onRegenerate,
  seanceTitre,
  seanceNumero,
  sequenceCorpusRefs,
  sequenceTitle,
  niveau,
  theme,
  refreshTrigger,
}: {
  activite: Activite
  seanceIndex: number
  activiteIndex: number
  totalActivites: number
  editor: EditorReturn
  onOpenDrawer: (r: Ressource, si: number, ai: number | undefined, seanceTitre: string, activiteTitre?: string, activiteType?: string, corpusRef?: string) => void
  onOpenPanel: (ctx: ResourcePanelContext) => void
  onRegenerate: (si: number, ai: number, motif: string) => Promise<void>
  seanceTitre: string
  seanceNumero: number
  sequenceCorpusRefs: string[]
  sequenceTitle: string
  niveau: string
  theme: string
  refreshTrigger: number
}) {
  const [collapsed, setCollapsed] = useState(true)
  const [isRejecting, setIsRejecting] = useState(false)
  const [motif, setMotif] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [regenError, setRegenError] = useState<string | null>(null)
  const [isResourcesOpen, setIsResourcesOpen] = useState(false)

  // Paires de ressources IA chargées depuis la DB
  const [resourcePairs, setResourcePairs] = useState<Array<{ type: string; hasEleve: boolean }>>([])

  // Fix A : Fallback vers le premier texte du corpus de la séquence si l'activité n'en a pas encore.
  // Permet d'injecter le corpus dans le panneau ResourcePanel même si le lien n'a pas été
  // établi lors de la génération initiale de la séquence.
  const effectiveCorpusRef = activite.corpus_ref
    ?? (CORPUS_ACTIVITE_TYPES.has(activite.type) && sequenceCorpusRefs.length > 0
      ? sequenceCorpusRefs[0]
      : undefined)

  // Charge (ou recharge) les ressources IA pour cette activité
  useEffect(() => {
    if (!activite.id) return
    fetch(`/api/resources?activite_id=${encodeURIComponent(activite.id)}`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data.ressources)) return
        const rows = data.ressources as Array<{ id: string; type: string; audience: string; paired_with?: string }>
        // Une paire = 1 ligne professeur + éventuellement 1 ligne élève
        // L'élève pointe vers le prof via paired_with → on construit un Set des prof_id qui ont un élève
        const profIds = new Set(rows.filter(r => r.audience === 'eleve').map(r => r.paired_with).filter(Boolean))
        const profRows = rows.filter(r => r.audience === 'professeur')
        setResourcePairs(profRows.map(r => ({
          type: r.type,
          hasEleve: profIds.has(r.id),
        })))
      })
      .catch(() => { /* silencieux */ })
  }, [activite.id, refreshTrigger])

  const handleRegenerate = async () => {
    setIsRegenerating(true)
    setRegenError(null)
    try {
      await onRegenerate(seanceIndex, activiteIndex, motif)
      setIsRejecting(false)
      setMotif('')
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Erreur lors de la régénération')
    } finally {
      setIsRegenerating(false)
    }
  }

  const toggleReject = () => {
    setIsRejecting((v) => !v)
    setMotif('')
    setRegenError(null)
  }

  return (
    <div
      className={cn(
        'rounded-lg border group',
        TYPE_COLORS[activite.type] || 'bg-gray-800/50 text-gray-300 border-gray-700',
        isRegenerating && 'opacity-60 pointer-events-none',
      )}
    >
      {/* Header — toujours visible */}
      <div className="flex items-center justify-between px-3 py-2">
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

          {isRegenerating
            ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            : <FileText className="h-3.5 w-3.5 shrink-0" />
          }
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
          {/* Rejeter & régénérer */}
          <button
            onClick={toggleReject}
            className={cn(
              'p-0.5 transition-all',
              isRejecting
                ? 'opacity-100 text-amber-400'
                : 'opacity-0 group-hover:opacity-100 hover:text-amber-400',
            )}
            title="Rejeter et régénérer"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          <button
            onClick={() => editor.removeActivite(seanceIndex, activiteIndex)}
            className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
            title="Supprimer"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          {/* Toggle collapse */}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="p-0.5 opacity-60 hover:opacity-100 transition-opacity"
          >
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Body collapsable */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-current/10 pt-2">
              <EditableText
                value={activite.consigne}
                onSave={(v) => editor.updateField({ level: 'activite', seanceIndex, activiteIndex, field: 'consigne' }, v)}
                className="text-xs opacity-80"
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
        sequenceCorpusRefs={sequenceCorpusRefs}
        onAssociate={(ref) => editor.replaceActivite(seanceIndex, activiteIndex, {
          ...activite,
          corpus_ref: ref,
          corpus_status: 'trouve',
        })}
      />

      {/* ── Zone Ressources IA ── */}
      {(() => {
        const openPanel = () => onOpenPanel({
          sequenceTitle, niveau, theme, seanceNumero,
          seanceTitle: seanceTitre,
          activiteId: activite.id,
          activiteTitre: activite.titre,
          activiteType: activite.type,
          activiteConsigne: activite.consigne,
          corpusRef: effectiveCorpusRef,
        })

        if (resourcePairs.length === 0) {
          return (
            <div className="mt-2">
              <button
                onClick={openPanel}
                className="flex items-center gap-1.5 px-2.5 py-1.5 w-full rounded-lg border border-dashed border-blue-700/40 text-xs text-blue-400/80 hover:text-blue-300 hover:border-blue-600/60 hover:bg-blue-500/5 transition-all font-medium"
              >
                <Sparkles className="h-3 w-3 shrink-0" />
                Ressources IA — Générer fiche élève + corrigé prof
              </button>
            </div>
          )
        }

        return (
          <div className="mt-2 rounded-lg border border-blue-600/40 bg-blue-500/5 overflow-hidden">
            {/* En-tête accordéon */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5">
              <Sparkles className="h-3 w-3 text-blue-400 shrink-0" />
              <span className="text-xs font-semibold text-blue-300">Ressources IA</span>
              {/* Chips types (max 3) */}
              <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                {resourcePairs.slice(0, 3).map(p => {
                  const cfg = RESOURCE_TYPE_CONFIG[p.type]
                  return cfg ? (
                    <span key={p.type} className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', cfg.chip)}>
                      {cfg.label}
                    </span>
                  ) : null
                })}
                {resourcePairs.length > 3 && (
                  <span className="text-[10px] text-gray-500">+{resourcePairs.length - 3}</span>
                )}
              </div>
              {/* Expand / collapse */}
              <button
                onClick={() => setIsResourcesOpen(v => !v)}
                className="p-0.5 text-gray-500 hover:text-blue-300 transition-colors shrink-0"
                title={isResourcesOpen ? 'Réduire' : 'Voir le détail'}
              >
                {isResourcesOpen
                  ? <ChevronUp className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {/* Ouvrir panel */}
              <button
                onClick={openPanel}
                className="text-[10px] text-blue-400 hover:text-blue-200 font-semibold px-2 py-0.5 rounded border border-blue-700/40 hover:border-blue-500/60 hover:bg-blue-500/10 transition-all shrink-0"
              >
                Gérer / Ajouter
              </button>
            </div>

            {/* Corps accordéon */}
            <AnimatePresence>
              {isResourcesOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-blue-700/20 px-2.5 py-2 space-y-1">
                    {resourcePairs.map(pair => {
                      const cfg = RESOURCE_TYPE_CONFIG[pair.type]
                      return (
                        <button
                          key={pair.type}
                          onClick={openPanel}
                          className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md hover:bg-blue-500/10 transition-colors group"
                        >
                          <span className={cn('text-[11px] px-2 py-0.5 rounded border font-medium shrink-0', cfg?.chip ?? 'text-gray-400 border-gray-700')}>
                            {cfg?.label ?? pair.type}
                          </span>
                          <span className="flex-1" />
                          {/* Indicateurs audience */}
                          {pair.hasEleve && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-400/80 bg-blue-500/10 border border-blue-700/30 px-1.5 py-0.5 rounded-full">
                              <User className="h-2.5 w-2.5" />Élève
                            </span>
                          )}
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400/80 bg-amber-500/10 border border-amber-700/30 px-1.5 py-0.5 rounded-full">
                            <GraduationCap className="h-2.5 w-2.5" />Prof
                          </span>
                          <ChevronRight className="h-3 w-3 text-gray-600 group-hover:text-gray-400 shrink-0" />
                        </button>
                      )
                    })}

                    {/* Invite à générer d'autres types */}
                    <button
                      onClick={() => onOpenPanel({
                        sequenceTitle, niveau, theme, seanceNumero,
                        seanceTitle: seanceTitre,
                        activiteId: activite.id,
                        activiteTitre: activite.titre,
                        activiteType: activite.type,
                        activiteConsigne: activite.consigne,
                        corpusRef: effectiveCorpusRef,
                        startInGenerateMode: true,
                      })}
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md border border-dashed border-blue-800/40 text-[11px] text-blue-500/70 hover:text-blue-400 hover:border-blue-700/60 hover:bg-blue-500/5 transition-all"
                    >
                      <Plus className="h-3 w-3 shrink-0" />
                      Générer un autre type de ressource…
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })()}

      {/* Panel de rejet / régénération */}
      <AnimatePresence>
        {isRejecting && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-current/10">
              <p className="text-xs font-medium opacity-70 mb-1.5">
                Motif du rejet <span className="opacity-50 font-normal">(optionnel)</span>
              </p>
              <textarea
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Ex : Trop simple, consigne peu claire, type inadapté au niveau…"
                className="w-full bg-black/20 rounded-lg px-3 py-2 text-xs placeholder:opacity-30 border border-current/20 focus:outline-none resize-none"
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) handleRegenerate()
                  if (e.key === 'Escape') toggleReject()
                }}
              />
              {regenError && (
                <p className="text-xs text-red-400 mt-1.5">{regenError}</p>
              )}
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={toggleReject}
                  disabled={isRegenerating}
                  className="px-3 py-1.5 rounded-lg text-xs opacity-60 hover:opacity-100 transition-opacity disabled:pointer-events-none"
                >
                  Annuler
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/30 border border-current/20 text-xs font-medium hover:bg-black/50 transition-all disabled:opacity-50"
                >
                  {isRegenerating
                    ? <><Loader2 className="h-3 w-3 animate-spin" />Génération…</>
                    : <><RefreshCw className="h-3 w-3" />Régénérer</>
                  }
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// === Gestion du corpus de séquence ===

function CorpusManager({
  corpusRefs,
  onAdd,
  onRemove,
}: {
  corpusRefs: string[]
  onAdd: (ref: string) => void
  onRemove: (ref: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Array<{ id: string; auteur: string; oeuvre: string; titre: string; has_content: boolean; domaine_public: boolean }>>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const openPicker = async () => {
    setOpen(true)
    if (items.length > 0) return
    setLoading(true)
    try {
      const res = await fetch('/api/corpus')
      const data = await res.json()
      setItems(data.items ?? [])
    } catch { /* silencieux */ }
    finally { setLoading(false) }
  }

  const filtered = items.filter(item => {
    const q = search.toLowerCase()
    return !q
      || item.auteur.toLowerCase().includes(q)
      || item.oeuvre.toLowerCase().includes(q)
      || item.titre.toLowerCase().includes(q)
  })

  const currentRefs = new Set(corpusRefs)

  return (
    <div className="mt-4 pt-3 border-t border-primary-800/40">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-primary-500 font-semibold uppercase tracking-wider shrink-0">
          Corpus :
        </span>

        {/* Chips supprimables */}
        {corpusRefs.map(ref => {
          const meta = items.find(i => i.id === ref)
          const isProtected = meta ? !meta.has_content : false
          return (
            <span
              key={ref}
              className={cn(
                'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border group',
                isProtected
                  ? 'bg-amber-950/30 text-amber-400/80 border-amber-700/30'
                  : 'bg-emerald-950/50 text-emerald-400 border-emerald-700/40',
              )}
              title={isProtected ? 'Texte protégé — contenu non disponible' : undefined}
            >
              {isProtected
                ? <Lock className="h-3 w-3 shrink-0" />
                : <BookOpen className="h-3 w-3 shrink-0" />
              }
              {meta ? `${meta.auteur}, ${meta.oeuvre}` : ref.replace(/-/g, ' ')}
              <button
                onClick={() => onRemove(ref)}
                className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                title="Retirer du corpus"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )
        })}

        {/* Bouton ajouter */}
        <div className="relative">
          <button
            onClick={open ? () => setOpen(false) : openPicker}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-dashed border-emerald-700/40 text-emerald-500/70 hover:text-emerald-400 hover:border-emerald-600/60 hover:bg-emerald-500/5 transition-all"
          >
            <Plus className="h-3 w-3" />
            Ajouter un texte
          </button>

          {/* Dropdown picker */}
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden"
              >
                {/* Recherche */}
                <div className="p-2 border-b border-gray-800">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500 pointer-events-none" />
                    <input
                      autoFocus
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Auteur, titre, œuvre…"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-700"
                    />
                  </div>
                </div>

                {/* Liste */}
                <div className="max-h-64 overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-6 text-gray-500 gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span className="text-xs">Chargement…</span>
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-6">Aucun résultat.</p>
                  ) : (
                    filtered.map(item => {
                      const already = currentRefs.has(item.id)
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (!already) { onAdd(item.id); setOpen(false); setSearch('') }
                          }}
                          disabled={already}
                          className={cn(
                            'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-gray-800/60 last:border-0',
                            already
                              ? 'opacity-50 cursor-default bg-emerald-950/20'
                              : 'hover:bg-gray-800/60 cursor-pointer',
                          )}
                        >
                          {item.has_content
                            ? <BookOpen className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', already ? 'text-emerald-500' : 'text-gray-500')} />
                            : <Lock className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', already ? 'text-emerald-500' : 'text-amber-600/70')} />
                          }
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-200 truncate">
                              {item.auteur}, <em>{item.oeuvre}</em>
                            </p>
                            <p className="text-[10px] text-gray-500 truncate mt-0.5">{item.titre}</p>
                          </div>
                          <div className="ml-auto flex items-center gap-1.5 shrink-0 mt-0.5">
                            {!item.has_content && (
                              <span className="text-[10px] text-amber-600/80 bg-amber-950/40 border border-amber-800/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                Protégé
                              </span>
                            )}
                            {already && (
                              <span className="text-[10px] text-emerald-500 whitespace-nowrap">✓ Ajouté</span>
                            )}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>

                {/* Footer — fermer */}
                <div className="px-3 py-2 border-t border-gray-800 flex justify-end">
                  <button
                    onClick={() => { setOpen(false); setSearch('') }}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Fermer
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {corpusRefs.length === 0 && !open && (
          <span className="text-xs text-primary-600 italic">Aucun texte — cliquez pour en ajouter</span>
        )}
      </div>
    </div>
  )
}

// === Badge Corpus ===

import type { CorpusSuggestion } from '@/shared/schemas'

function CorpusBadge({
  status,
  corpusRef,
  suggestion,
  sequenceCorpusRefs,
  onAssociate,
}: {
  status?: string
  corpusRef?: string
  suggestion?: CorpusSuggestion
  sequenceCorpusRefs: string[]
  onAssociate?: (ref: string) => void
}) {
  const [showPicker, setShowPicker] = useState(false)

  if (!status || status === 'non_requis') return null

  // Bouton "Associer" : visible quand un texte manque ET la séquence en a au moins un
  const associerEl = onAssociate && sequenceCorpusRefs.length > 0 ? (
    <div className="relative">
      <button
        onClick={() => {
          if (sequenceCorpusRefs.length === 1) {
            onAssociate(sequenceCorpusRefs[0])
          } else {
            setShowPicker(v => !v)
          }
        }}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-900/40 transition-colors whitespace-nowrap"
        title={
          sequenceCorpusRefs.length === 1
            ? `Associer "${sequenceCorpusRefs[0].replace(/-/g, ' ')}"`
            : 'Choisir un texte du corpus à associer'
        }
      >
        <BookOpen className="h-2.5 w-2.5 shrink-0" />
        {sequenceCorpusRefs.length === 1 ? 'Associer' : 'Associer un texte'}
      </button>
      {showPicker && sequenceCorpusRefs.length > 1 && (
        <div className="absolute left-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[13rem] overflow-hidden">
          {sequenceCorpusRefs.map(ref => (
            <button
              key={ref}
              onClick={() => { onAssociate(ref); setShowPicker(false) }}
              className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors border-b border-gray-800/60 last:border-0 capitalize"
            >
              {ref.replace(/-/g, ' ')}
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null

  // Texte trouvé : n'afficher que si plusieurs textes coexistent dans la séquence
  // (sinon l'info est déjà visible dans l'en-tête)
  if (status === 'trouve' && corpusRef) {
    if (sequenceCorpusRefs.length <= 1) return null
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
      <div className="mt-2 mb-1 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-950/50 text-amber-400 border border-amber-700/40">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Texte manquant · Suggestion : {suggestion.auteur}, <em className="ml-0.5">{suggestion.oeuvre}</em>
        </span>
        {associerEl}
      </div>
    )
  }

  // Texte manquant sans suggestion
  if (status === 'manquant' || status === 'manquant_sans_suggestion') {
    return (
      <div className="mt-2 mb-1 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-gray-900/50 text-gray-500 border border-gray-700/30">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Aucun texte disponible dans le corpus
        </span>
        {associerEl}
      </div>
    )
  }

  return null
}
