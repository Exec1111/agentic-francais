'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import {
  BookOpen, Target, Award, Clock, FileText, Plus, Trash2, X, Search,
  ChevronRight, Undo2, Redo2, AlertTriangle,
  RefreshCw, Loader2, Sparkles, User, GraduationCap, Lock, Eye, GripVertical, Upload, Users,
} from 'lucide-react'
import { cn } from '@/shared/utils'
import { PROFIL_UI_LIST, resolveActiveProfils } from '@/shared/differentiation-profils'
import type { DifferentiationProfil } from '@/shared/schemas'
import { EditableText } from './EditableText'
import { EditableList } from './EditableList'
import { ResourcePanel } from './ResourcePanel'
import { CorpusViewer } from './CorpusViewer'
import { TextDepositPanel } from './TextDepositPanel'
import { EvaluationFinaleSection } from './EvaluationFinaleSection'
import { FichePreparationSection } from './FichePreparationSection'
import type { ResourcePanelContext } from './ResourcePanel'
import type { useSequenceEditor, SequencePath } from '@/frontend/hooks/useSequenceEditor'
import type { Activite, CorpusItem, RessourceStructuree } from '@/shared/schemas'

// Config visuelle des types de ressources IA (utilisée dans l'accordéon)
const RESOURCE_TYPE_CONFIG: Record<string, { label: string; chip: string }> = {
  cours:             { label: 'Cours',          chip: 'bg-blue-500/10 text-blue-400 border-blue-600/30' },
  bilan:             { label: 'Bilan',          chip: 'bg-green-500/10 text-green-400 border-green-600/30' },
  extrait_oeuvre:    { label: "Extrait d'œuvre",chip: 'bg-purple-500/10 text-purple-400 border-purple-600/30' },
  oeuvre_complete:   { label: 'Texte complet',  chip: 'bg-amber-500/10 text-amber-400 border-amber-600/30' },
  fiche_questions:   { label: 'Fiche questions', chip: 'bg-pink-500/10 text-pink-400 border-pink-600/30' },
  grille_evaluation: { label: "Grille d'éval.", chip: 'bg-orange-500/10 text-orange-400 border-orange-600/30' },
  fiche_methode:     { label: 'Fiche méthode',  chip: 'bg-cyan-500/10 text-cyan-400 border-cyan-600/30' },
  fiche_lecture:     { label: 'Fiche lecture',  chip: 'bg-indigo-500/10 text-indigo-400 border-indigo-600/30' },
  carte_mentale:     { label: 'Carte mentale',  chip: 'bg-teal-500/10 text-teal-400 border-teal-600/30' },
  dictee:            { label: 'Dictée',         chip: 'bg-rose-500/10 text-rose-400 border-rose-600/30' },
  evaluation_sommative: { label: "Sujet d'éval.", chip: 'bg-red-500/10 text-red-400 border-red-600/30' },
  fiche_preparation: { label: 'Fiche de prép.', chip: 'bg-amber-500/10 text-amber-400 border-amber-600/30' },
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

// Phases du canevas d'enseignement explicite — libellé court + style du badge.
const PHASE_CONFIG: Record<string, { label: string; cls: string }> = {
  ouverture:         { label: '1 · Ouverture',        cls: 'bg-sky-900/30 text-sky-300 border-sky-700/50' },
  modelage:          { label: '2 · Modelage',         cls: 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50' },
  pratique_guidee:   { label: '3 · Pratique guidée',  cls: 'bg-violet-900/30 text-violet-300 border-violet-700/50' },
  pratique_autonome: { label: '4 · Pratique autonome',cls: 'bg-fuchsia-900/30 text-fuchsia-300 border-fuchsia-700/50' },
  cloture:           { label: '5 · Clôture',          cls: 'bg-teal-900/30 text-teal-300 border-teal-700/50' },
}

const ACTIVITY_TYPES = [
  'exercice', 'production_ecrite', 'debat', 'lecture',
  'oral', 'evaluation', 'collaboration', 'recherche',
]

// Types de ressources suggérés par type d'activité (affichage inline)
const SUGGESTED_RESOURCES: Record<string, string[]> = {
  exercice: ['fiche_questions'],
  lecture: ['extrait_oeuvre', 'fiche_questions'],
  production_ecrite: ['fiche_methode'],
  evaluation: ['fiche_questions', 'grille_evaluation'],
  debat: ['fiche_methode'],
  oral: ['fiche_methode'],
  collaboration: [],
  recherche: ['fiche_methode'],
}

type EditorReturn = ReturnType<typeof useSequenceEditor>

interface SequenceEditorProps {
  editor: EditorReturn
  provider?: string
  /**
   * Génère le bundle « évaluation finale ». Implémenté par le parent (HomePage) qui
   * garantit la sauvegarde préalable de la séquence puis appelle l'API. Si absent,
   * la section évaluation finale masque le bouton de génération.
   */
  onGenerateEvaluation?: (consignes?: string) => Promise<RessourceStructuree[]>
  /**
   * Génère la fiche de préparation d'une séance (même contrat : le parent sauvegarde
   * la séquence puis appelle l'API). Si absent, la section est masquée.
   */
  onGeneratePreparation?: (seanceId: string, consignes?: string) => Promise<RessourceStructuree>
}

const PANEL_CLOSED: ResourcePanelContext = {
  sequenceTitle: '', niveau: '', theme: '',
  seanceNumero: 1, seanceTitle: '',
  activiteTitre: '', activiteType: 'exercice', activiteConsigne: '',
}

// Métadonnées d'un texte du corpus (réponse de /api/corpus)
export interface CorpusMeta {
  id: string
  auteur: string
  oeuvre: string
  titre: string
  has_content: boolean
  domaine_public: boolean
  /** Pour un passage : id de l'œuvre source. */
  parent_id?: string
  /** Pour un passage : angle d'étude. */
  angle?: string
}

/** Libellé court et lisible d'un texte corpus pour les chips/badges. */
export function corpusLabel(meta: CorpusMeta | undefined, fallbackRef: string): string {
  if (meta) {
    // Un passage : l'œuvre seule ne distingue pas plusieurs extraits du même texte
    // (« Fables », « Fables »…). On affiche le titre du passage ; l'angle d'étude
    // est rappelé en infobulle (voir corpusTooltip).
    if (meta.parent_id) return meta.titre || meta.angle || meta.oeuvre
    return meta.oeuvre || meta.titre || meta.auteur
  }
  // Repli si la métadonnée n'est pas (encore) chargée
  return fallbackRef.startsWith('ia-') ? 'Texte IA' : fallbackRef.replace(/-/g, ' ')
}

/** Infobulle d'un chip corpus : rappelle l'œuvre et l'angle d'étude pour un passage. */
export function corpusTooltip(meta: CorpusMeta | undefined, label: string): string {
  if (meta?.parent_id) {
    const contexte = [meta.oeuvre, meta.angle].filter(Boolean).join(' — ')
    return contexte ? `Lire le passage — ${contexte}` : `Lire le passage : ${label}`
  }
  return `Lire le texte : ${label}`
}

export function SequenceEditor({ editor, provider, onGenerateEvaluation, onGeneratePreparation }: SequenceEditorProps) {
  const { sequence } = editor
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelContext, setPanelContext] = useState<ResourcePanelContext>(PANEL_CLOSED)
  // refreshKey[activiteId] s'incrémente à chaque fermeture du panel → ActiviteBlock recharge son compteur
  const [refreshKey, setRefreshKey] = useState<Record<string, number>>({})
  const [objectifsOpen, setObjectifsOpen] = useState(false)
  const [competencesOpen, setCompetencesOpen] = useState(false)
  const [differenciationOpen, setDifferenciationOpen] = useState(false)
  // Texte du corpus affiché dans le panneau de lecture (null = fermé)
  const [viewCorpusId, setViewCorpusId] = useState<string | null>(null)
  // Métadonnées corpus chargées une seule fois ici, partagées avec les chips
  // (CorpusManager) et les badges d'activité (CorpusBadge) → source unique.
  const [corpusItems, setCorpusItems] = useState<CorpusMeta[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/corpus')
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setCorpusItems(data.items ?? []) })
      .catch(() => { /* silencieux */ })
    return () => { cancelled = true }
  }, [])

  const corpusById = useMemo(() => {
    const map: Record<string, CorpusMeta> = {}
    for (const it of corpusItems) map[it.id] = it
    return map
  }, [corpusItems])

  // Dépôt d'un texte depuis le badge « Texte manquant » d'une activité :
  // (1) enrichit le cache de métadonnées partagé, (2) ajoute le texte au corpus
  // de la séquence. L'association à l'activité elle-même est faite par ActiviteBlock.
  const handleCorpusDeposited = useCallback((item: CorpusItem) => {
    setCorpusItems((prev) =>
      prev.some((c) => c.id === item.id)
        ? prev
        : [
            ...prev,
            {
              id: item.id,
              auteur: item.auteur,
              oeuvre: item.oeuvre,
              titre: item.titre,
              has_content: item.contenu !== '',
              domaine_public: item.domaine_public,
            },
          ],
    )
    editor.updateField(
      { level: 'sequence', field: 'corpus_refs' },
      Array.from(new Set([...(sequence?.corpus_refs ?? []), item.id])),
    )
  }, [editor, sequence])

  // Enrichit le contexte minimal fourni par ActiviteBlock avec les données
  // de la séquence complète (problématique, objectifs, progression…) afin que
  // les prompts de génération soient ancrés dans la progression pédagogique.
  const openResourcePanel = useCallback((ctx: ResourcePanelContext) => {
    let enriched = ctx
    if (sequence) {
      const seance = sequence.seances.find((s) => s.numero === ctx.seanceNumero)
      const activite = seance?.activites.find(
        (a) => (ctx.activiteId && a.id === ctx.activiteId) || a.titre === ctx.activiteTitre
      )
      enriched = {
        ...ctx,
        sequenceProblematique: sequence.problematique,
        sequenceObjectifs: sequence.objectifs,
        sequenceCompetences: sequence.competences,
        seanceObjectifs: seance?.objectifs,
        activiteDuree: activite?.duree,
        progression: sequence.seances.map((s) => ({ numero: s.numero, titre: s.titre })),
        autresActivites: seance?.activites
          .filter((a) => a !== activite)
          .map((a) => ({ titre: a.titre, type: a.type, duree: a.duree })),
        activeProfils: sequence.differentiation_profils,
      }
    }
    setPanelContext(enriched)
    setPanelOpen(true)
  }, [sequence])

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

    editor.replaceActivite(seanceIndex, activiteIndex, {
      ...data.activite,
      ressources: activite.ressources || [],
      // Les textes sont désormais portés par les ressources, pas par l'activité.
      corpus_refs: [],
      corpus_status: 'non_requis',
      corpus_suggestion: undefined,
    })
  }, [sequence, provider, editor, corpusById])

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
          onView={setViewCorpusId}
          items={corpusItems}
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

      {/* Différenciation — profils d'élèves de la classe (préférences séquence) */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
        <button
          onClick={() => setDifferenciationOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center gap-2 hover:bg-gray-800/30 transition-colors"
        >
          <Users className="h-4 w-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-gray-300">Différenciation</h3>
          <span className="ml-1 text-xs text-gray-600">
            ({resolveActiveProfils(sequence.differentiation_profils).length}/{PROFIL_UI_LIST.length} profils)
          </span>
        </button>
        <AnimatePresence>
          {differenciationOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-gray-800 px-4 py-3"
            >
              <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                Sélectionnez les profils d'élèves présents dans cette classe. Seules ces variantes
                seront proposées lors de la génération des ressources (allégée, enrichie, dys, allophone).
              </p>
              <div className="flex flex-wrap gap-2">
                {PROFIL_UI_LIST.map((p) => {
                  const enabledIds = resolveActiveProfils(sequence.differentiation_profils).map((x) => x.id)
                  const enabled = enabledIds.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        const set = new Set<DifferentiationProfil>(enabledIds)
                        if (enabled) set.delete(p.id); else set.add(p.id)
                        editor.updateField(
                          { level: 'sequence', field: 'differentiation_profils' },
                          PROFIL_UI_LIST.filter((x) => set.has(x.id)).map((x) => x.id),
                        )
                      }}
                      title={p.description}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                        enabled
                          ? 'bg-indigo-600/20 border-indigo-600/50 text-indigo-200'
                          : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300',
                      )}
                    >
                      <span>{p.emoji}</span>
                      {p.label}
                    </button>
                  )
                })}
              </div>
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

        <Reorder.Group
          as="div"
          axis="y"
          values={sequence.seances.map((s) => s.id ?? '')}
          onReorder={(ids: string[]) => {
            const byId = new Map(sequence.seances.map((s) => [s.id, s]))
            editor.reorderSeances(ids.map((id) => byId.get(id)!).filter(Boolean))
          }}
          className="space-y-4"
        >
          {sequence.seances.map((seance, si) => (
            <SeanceBlock
              key={seance.id ?? si}
              seance={seance}
              seanceIndex={si}
              totalSeances={sequence.seances.length}
              editor={editor}
              onOpenPanel={openResourcePanel}
              onRegenerate={handleRegenerateActivite}
              sequenceCorpusRefs={sequence.corpus_refs ?? []}
              sequenceTitle={sequence.titre}
              niveau={sequence.niveau}
              theme={sequence.theme}
              refreshKey={refreshKey}
              onViewCorpus={setViewCorpusId}
              corpusById={corpusById}
              onCorpusDeposited={handleCorpusDeposited}
              onGeneratePreparation={onGeneratePreparation}
            />
          ))}
        </Reorder.Group>
      </div>

      {/* Évaluation finale */}
      <div className="bg-red-950/30 rounded-xl border border-red-800/30 p-4 space-y-4">
        <div>
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
        {onGenerateEvaluation && (
          <EvaluationFinaleSection
            sequenceId={sequence.id}
            onGenerate={onGenerateEvaluation}
          />
        )}
      </div>
    </motion.div>

    {/* Resource Panel — nouveau système structuré (élève + prof) */}
    <ResourcePanel
      isOpen={panelOpen}
      onClose={handlePanelClose}
      context={panelContext}
      provider={provider}
    />

    {/* Panneau de lecture d'un texte du corpus */}
    <CorpusViewer corpusId={viewCorpusId} onClose={() => setViewCorpusId(null)} />
    </>
  )
}

// === Bloc Séance ===

function SeanceBlock({
  seance,
  seanceIndex,
  totalSeances,
  editor,
  onOpenPanel,
  onRegenerate,
  sequenceCorpusRefs,
  sequenceTitle,
  niveau,
  theme,
  refreshKey,
  onViewCorpus,
  corpusById,
  onCorpusDeposited,
  onGeneratePreparation,
}: {
  seance: any
  seanceIndex: number
  totalSeances: number
  editor: EditorReturn
  onOpenPanel: (ctx: ResourcePanelContext) => void
  onRegenerate: (si: number, ai: number, motif: string) => Promise<void>
  sequenceCorpusRefs: string[]
  sequenceTitle: string
  niveau: string
  theme: string
  refreshKey: Record<string, number>
  onViewCorpus: (ref: string) => void
  corpusById: Record<string, CorpusMeta>
  onCorpusDeposited: (item: CorpusItem) => void
  onGeneratePreparation?: (seanceId: string, consignes?: string) => Promise<RessourceStructuree>
}) {
  const [collapsed, setCollapsed] = useState(false)
  const dragControls = useDragControls()

  return (
    <Reorder.Item
      as="div"
      value={seance.id ?? ''}
      dragListener={false}
      dragControls={dragControls}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden"
    >
      {/* Header séance — tout l'en-tête plie/déplie (sauf les contrôles internes) */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 cursor-pointer hover:bg-gray-800/20 transition-colors"
      >
        {/* Poignée de glissement (réordonner la séance) */}
        <button
          onPointerDown={(e) => { e.stopPropagation(); dragControls.start(e) }}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-300 touch-none transition-colors"
          title="Glisser pour réordonner la séance"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-900/50 text-primary-400 text-xs font-bold shrink-0">
          {seance.numero}
        </span>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="inline-block max-w-full" onClick={(e) => e.stopPropagation()}>
            <EditableText
              value={seance.titre}
              onSave={(v) => editor.updateField({ level: 'seance', seanceIndex, field: 'titre' }, v)}
              className="font-medium text-gray-200"
            />
          </span>
          {seance.mode_pedagogique === 'explicite' && (
            <span
              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary-700/50 bg-primary-900/30 text-primary-300 text-[10px] font-semibold"
              title="Séance structurée en enseignement explicite (5 phases)"
            >
              <GraduationCap className="h-3 w-3" />
              Explicite
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="h-3 w-3" />
            <span onClick={(e) => e.stopPropagation()}>
              <EditableText
                value={String(seance.duree)}
                onSave={(v) => editor.updateField({ level: 'seance', seanceIndex, field: 'duree' }, Number(v) || 55)}
                className="text-xs text-gray-500 w-8 text-center"
              />
            </span>
            <span>min</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); editor.removeSeance(seanceIndex) }}
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

            {/* Activités */}
            <div className="p-4 space-y-3">
              <span className="text-xs text-gray-600 uppercase font-semibold">Activités</span>

              <Reorder.Group
                as="div"
                axis="y"
                values={seance.activites.map((a: Activite) => a.id ?? '')}
                onReorder={(ids: string[]) => {
                  const byId = new Map(seance.activites.map((a: Activite) => [a.id, a]))
                  editor.reorderActivites(seanceIndex, ids.map((id) => byId.get(id)!).filter(Boolean) as Activite[])
                }}
                className="space-y-3"
              >
                {seance.activites.map((activite: Activite, ai: number) => (
                  <ActiviteBlock
                    key={activite.id ?? ai}
                    activite={activite}
                    seanceIndex={seanceIndex}
                    activiteIndex={ai}
                    totalActivites={seance.activites.length}
                    editor={editor}
                    onOpenPanel={onOpenPanel}
                    onRegenerate={onRegenerate}
                    seanceTitre={seance.titre}
                    seanceNumero={seance.numero}
                    seanceObjectifs={seance.objectifs}
                    sequenceCorpusRefs={sequenceCorpusRefs}
                    sequenceTitle={sequenceTitle}
                    niveau={niveau}
                    theme={theme}
                    refreshTrigger={refreshKey[activite.id ?? ''] ?? 0}
                    onViewCorpus={onViewCorpus}
                    corpusById={corpusById}
                    onCorpusDeposited={onCorpusDeposited}
                  />
                ))}
              </Reorder.Group>

              <button
                onClick={() => editor.addActivite(seanceIndex, {
                  titre: 'Nouvelle activité',
                  type: 'exercice',
                  duree: 15,
                  consigne: '',
                  ressources: [],
                  corpus_refs: [],
                })}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-gray-700 text-xs text-gray-600 hover:text-primary-400 hover:border-primary-700/50 transition-all"
              >
                <Plus className="h-3 w-3" />
                Ajouter une activité
              </button>
            </div>

            {/* Fiche de préparation (déroulé enseignant) — nécessite une séance persistée (FK) */}
            {onGeneratePreparation && seance.id && (
              <FichePreparationSection
                seance={seance}
                onGenerate={(consignes) => onGeneratePreparation(seance.id, consignes)}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  )
}

// === Bloc Activité ===

function ActiviteBlock({
  activite,
  seanceIndex,
  activiteIndex,
  totalActivites,
  editor,
  onOpenPanel,
  onRegenerate,
  seanceTitre,
  seanceNumero,
  seanceObjectifs,
  sequenceCorpusRefs,
  sequenceTitle,
  niveau,
  theme,
  refreshTrigger,
  onViewCorpus,
  corpusById,
  onCorpusDeposited,
}: {
  activite: Activite
  seanceIndex: number
  activiteIndex: number
  totalActivites: number
  editor: EditorReturn
  onOpenPanel: (ctx: ResourcePanelContext) => void
  onRegenerate: (si: number, ai: number, motif: string) => Promise<void>
  seanceTitre: string
  seanceNumero: number
  seanceObjectifs: string[]
  sequenceCorpusRefs: string[]
  sequenceTitle: string
  niveau: string
  theme: string
  refreshTrigger: number
  onViewCorpus: (ref: string) => void
  corpusById: Record<string, CorpusMeta>
  onCorpusDeposited: (item: CorpusItem) => void
}) {
  const [collapsed, setCollapsed] = useState(true)
  const dragControls = useDragControls()
  const [isRejecting, setIsRejecting] = useState(false)
  const [motif, setMotif] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [regenError, setRegenError] = useState<string | null>(null)
  const [isResourcesOpen, setIsResourcesOpen] = useState(false)

  // Paires de ressources IA chargées depuis la DB
  const [resourcePairs, setResourcePairs] = useState<Array<{ type: string; hasEleve: boolean; corpusRefs: string[] }>>([])

  // Charge (ou recharge) les ressources IA pour cette activité
  useEffect(() => {
    if (!activite.id) return
    fetch(`/api/resources?activite_id=${encodeURIComponent(activite.id)}`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data.ressources)) return
        const rows = data.ressources as Array<{ id: string; type: string; audience: string; paired_with?: string; corpus_refs?: string[] }>
        // Une paire = 1 ligne professeur + éventuellement 1 ligne élève
        // L'élève pointe vers le prof via paired_with → on construit un Set des prof_id qui ont un élève
        const profIds = new Set(rows.filter(r => r.audience === 'eleve').map(r => r.paired_with).filter(Boolean))
        const profRows = rows.filter(r => r.audience === 'professeur')
        setResourcePairs(profRows.map(r => ({
          type: r.type,
          hasEleve: profIds.has(r.id),
          // Les ressources historiques n'ont pas encore de sélection persistée :
          // elles héritent du corpus complet de la séquence.
          corpusRefs: r.corpus_refs ?? sequenceCorpusRefs,
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
    <Reorder.Item
      as="div"
      value={activite.id ?? ''}
      dragListener={false}
      dragControls={dragControls}
      className={cn(
        'rounded-lg border group',
        TYPE_COLORS[activite.type] || 'bg-gray-800/50 text-gray-300 border-gray-700',
        isRegenerating && 'opacity-60 pointer-events-none',
      )}
    >
      {/* Header — tout l'en-tête plie/déplie (sauf les contrôles internes) */}
      <div
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Poignée de glissement (réordonner l'activité) */}
          <button
            onPointerDown={(e) => { e.stopPropagation(); dragControls.start(e) }}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 cursor-grab active:cursor-grabbing text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 touch-none transition-opacity"
            title="Glisser pour réordonner l'activité"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          {isRegenerating
            ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            : <FileText className="h-3.5 w-3.5 shrink-0" />
          }
          <span className="min-w-0" onClick={(e) => e.stopPropagation()}>
            <EditableText
              value={activite.titre}
              onSave={(v) => editor.updateField({ level: 'activite', seanceIndex, activiteIndex, field: 'titre' }, v)}
              className="text-sm font-medium"
            />
          </span>
          {activite.phase && PHASE_CONFIG[activite.phase] && (
            <span
              className={cn('shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-semibold', PHASE_CONFIG[activite.phase].cls)}
              title="Phase du canevas d'enseignement explicite"
            >
              {PHASE_CONFIG[activite.phase].label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs opacity-70 shrink-0">
          <select
            value={activite.type}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => editor.updateField({ level: 'activite', seanceIndex, activiteIndex, field: 'type' }, e.target.value)}
            className="bg-transparent border-none text-xs capitalize cursor-pointer focus:outline-none hover:opacity-100"
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
          <span>•</span>
          <span onClick={(e) => e.stopPropagation()}>
            <EditableText
              value={String(activite.duree)}
              onSave={(v) => editor.updateField({ level: 'activite', seanceIndex, activiteIndex, field: 'duree' }, Number(v) || 15)}
              className="text-xs w-6 text-center"
            />
          </span>
          <span>min</span>
          {/* Rejeter & régénérer */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleReject() }}
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
            onClick={(e) => { e.stopPropagation(); editor.removeActivite(seanceIndex, activiteIndex) }}
            className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
            title="Supprimer"
          >
            <Trash2 className="h-3 w-3" />
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

      {resourcePairs.some((pair) => pair.corpusRefs.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">Textes travaillés :</span>
          {Array.from(new Set(resourcePairs.flatMap((pair) => pair.corpusRefs))).map((ref) => {
            const label = corpusLabel(corpusById[ref], ref)
            return (
              <button
                key={ref}
                onClick={() => onViewCorpus(ref)}
                title={corpusTooltip(corpusById[ref], label)}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-500/80 border border-emerald-800/30 hover:bg-emerald-900/40 hover:text-emerald-300 transition-colors"
              >
                <BookOpen className="h-2.5 w-2.5" />{label}<Eye className="h-2.5 w-2.5 opacity-60" />
              </button>
            )
          })}
        </div>
      )}

      {/* ── Zone Ressources IA ── */}
      {(() => {
        const openPanel = () => onOpenPanel({
          sequenceTitle, niveau, theme, seanceNumero,
          seanceTitle: seanceTitre,
          activiteId: activite.id,
          activiteTitre: activite.titre,
          activiteType: activite.type,
          activiteConsigne: activite.consigne,
          corpusRefs: sequenceCorpusRefs,
        })

        if (resourcePairs.length === 0) {
          const suggestions = SUGGESTED_RESOURCES[activite.type] ?? []
          return (
            <div className="mt-2">
              <button
                onClick={openPanel}
                className="flex items-center gap-2 px-2.5 py-2 w-full rounded-lg border border-dashed border-blue-700/40 text-xs hover:border-blue-600/60 hover:bg-blue-500/5 transition-all"
              >
                <Sparkles className="h-3 w-3 shrink-0 text-blue-400" />
                <span className="text-blue-400/80 font-medium">Ressources IA</span>
                {suggestions.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {suggestions.map(t => {
                      const cfg = RESOURCE_TYPE_CONFIG[t]
                      return cfg ? (
                        <span key={t} className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', cfg.chip)}>
                          {cfg.label}
                        </span>
                      ) : null
                    })}
                  </div>
                )}
                <span className="ml-auto text-blue-500/60 text-[10px] shrink-0">Générer →</span>
              </button>
            </div>
          )
        }

        return (
          <div className="mt-2 rounded-lg border border-blue-600/40 bg-blue-500/5 overflow-hidden">
            {/* En-tête accordéon — tout l'en-tête plie/déplie (sauf « Gérer / Ajouter ») */}
            <div
              onClick={() => setIsResourcesOpen(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer hover:bg-blue-500/10 transition-colors"
            >
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
              {/* Ouvrir panel */}
              <button
                onClick={(e) => { e.stopPropagation(); openPanel() }}
                className="ml-auto text-[10px] text-blue-400 hover:text-blue-200 font-semibold px-2 py-0.5 rounded border border-blue-700/40 hover:border-blue-500/60 hover:bg-blue-500/10 transition-all shrink-0"
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
                           <div className="flex flex-wrap gap-1 min-w-0">
                             {pair.corpusRefs.map(ref => (
                               <span
                                 key={ref}
                                 className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-950/40 text-emerald-400/80 border border-emerald-800/40"
                                 title={corpusTooltip(corpusById[ref], corpusLabel(corpusById[ref], ref))}
                               >
                                 <BookOpen className="h-2.5 w-2.5" />{corpusLabel(corpusById[ref], ref)}
                               </span>
                             ))}
                           </div>
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
                        corpusRefs: sequenceCorpusRefs,
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
    </Reorder.Item>
  )
}

// === Gestion du corpus de séquence ===

function CorpusManager({
  corpusRefs,
  onAdd,
  onRemove,
  onView,
  items,
}: {
  corpusRefs: string[]
  onAdd: (ref: string) => void
  onRemove: (ref: string) => void
  onView: (ref: string) => void
  items: CorpusMeta[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  // Les métadonnées sont chargées une fois par le parent (SequenceEditor) et
  // transmises ici → pas de requête en double.

  const openPicker = () => setOpen(true)

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
            >
              <button
                onClick={() => onView(ref)}
                className={cn(
                  'inline-flex items-center gap-1.5 transition-colors',
                  isProtected ? 'hover:text-amber-300' : 'hover:text-emerald-300',
                )}
                title={isProtected
                  ? 'Texte protégé — voir la référence'
                  : 'Lire le texte'}
              >
                {isProtected
                  ? <Lock className="h-3 w-3 shrink-0" />
                  : <BookOpen className="h-3 w-3 shrink-0" />
                }
                {meta ? `${meta.auteur}, ${meta.oeuvre}` : ref.replace(/-/g, ' ')}
                <Eye className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
              </button>
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
                  {filtered.length === 0 ? (
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
  corpusRefs,
  suggestion,
  sequenceCorpusRefs,
  niveau,
  onAssociate,
  onDeposit,
  onView,
  corpusById,
}: {
  status?: string
  corpusRefs: string[]
  suggestion?: CorpusSuggestion
  sequenceCorpusRefs: string[]
  niveau?: string
  onAssociate?: (ref: string) => void
  onDeposit?: (item: CorpusItem) => void
  onView?: (ref: string) => void
  corpusById: Record<string, CorpusMeta>
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [showDeposit, setShowDeposit] = useState(false)

  if (!status || status === 'non_requis') return null

  const unlinkedRefs = sequenceCorpusRefs.filter((ref) => !corpusRefs.includes(ref))

  const depositEl = onDeposit ? (
    <button
      onClick={() => setShowDeposit((v) => !v)}
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-950/50 text-blue-300 border border-blue-700/40 hover:bg-blue-900/40 transition-colors whitespace-nowrap"
      title="Déposer ou coller le texte de cette œuvre"
    >
      <Upload className="h-2.5 w-2.5 shrink-0" />
      Déposer le texte
    </button>
  ) : null

  const depositPanelEl = showDeposit && onDeposit ? (
    <div className="mt-2 w-full">
      <TextDepositPanel
        niveau={niveau ?? ''}
        defaultAuteur={suggestion?.auteur ?? ''}
        defaultOeuvre={suggestion?.oeuvre ?? ''}
        defaultGenres={suggestion?.genres ?? []}
        defaultThemes={suggestion?.themes ?? []}
        defaultAnnee={suggestion?.annee_publication ?? null}
        onDeposited={(item) => { onDeposit(item); setShowDeposit(false) }}
      />
    </div>
  ) : null

  const associerEl = onAssociate && unlinkedRefs.length > 0 ? (
    <div className="relative">
      <button
        onClick={() => {
          if (unlinkedRefs.length === 1) {
            onAssociate(unlinkedRefs[0])
          } else {
            setShowPicker(v => !v)
          }
        }}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-900/40 transition-colors whitespace-nowrap"
        title={
          unlinkedRefs.length === 1
            ? `Associer « ${corpusLabel(corpusById[unlinkedRefs[0]], unlinkedRefs[0])} »`
            : 'Choisir un texte du corpus à associer'
        }
      >
        <BookOpen className="h-2.5 w-2.5 shrink-0" />
        {unlinkedRefs.length === 1 ? 'Associer' : 'Associer un texte'}
      </button>
      {showPicker && unlinkedRefs.length > 1 && (
        <div className="absolute left-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[13rem] overflow-hidden">
          {unlinkedRefs.map(ref => (
            <button
              key={ref}
              onClick={() => { onAssociate(ref); setShowPicker(false) }}
              className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors border-b border-gray-800/60 last:border-0"
            >
              {corpusLabel(corpusById[ref], ref)}
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null

  if (status === 'trouve' && corpusRefs.length > 0) {
    return (
      <div className="mt-2 mb-1 flex flex-wrap items-center gap-1.5">
        {corpusRefs.map((ref) => {
          const label = corpusLabel(corpusById[ref], ref)
          return (
            <button
              key={ref}
              onClick={() => onView?.(ref)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-500/80 border border-emerald-800/30 hover:bg-emerald-900/40 hover:text-emerald-300 hover:border-emerald-700/50 transition-colors"
              title={corpusTooltip(corpusById[ref], label)}
            >
              <BookOpen className="h-2.5 w-2.5 shrink-0" />
              {label}
              <Eye className="h-2.5 w-2.5 shrink-0 opacity-60" />
            </button>
          )
        })}
        {associerEl}
      </div>
    )
  }

  // Texte manquant avec suggestion IA
  if (status === 'manquant' && suggestion) {
    return (
      <div className="mt-2 mb-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-950/50 text-amber-400 border border-amber-700/40">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Texte manquant · Suggestion : {suggestion.auteur}, <em className="ml-0.5">{suggestion.oeuvre}</em>
          </span>
          {associerEl}
          {depositEl}
        </div>
        {depositPanelEl}
      </div>
    )
  }

  // Texte manquant sans suggestion
  if (status === 'manquant' || status === 'manquant_sans_suggestion') {
    return (
      <div className="mt-2 mb-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-gray-900/50 text-gray-500 border border-gray-700/30">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Aucun texte disponible dans le corpus
          </span>
          {associerEl}
          {depositEl}
        </div>
        {depositPanelEl}
      </div>
    )
  }

  return null
}
