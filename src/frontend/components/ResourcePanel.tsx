'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Sparkles, GraduationCap, User, Edit3, Eye,
  Printer, CheckCircle2, Loader2, Plus, AlertCircle, Save, RefreshCw, Trash2, Lock,
} from 'lucide-react'
import { cn } from '@/shared/utils'
import type { RessourcePaire, RessourceStructuree, RessourceType } from '@/shared/schemas'
import { RessourceTypeSchema } from '@/shared/schemas'
import type { FicheQuestionsContenu } from '@/shared/resource-blocks'
import { FicheBlocsRenderer } from './fiche-blocs/FicheBlocsRenderer'
import { FicheBlocsEditor } from './fiche-blocs/FicheBlocsEditor'
import { parseFicheBlocs } from './fiche-blocs/parse'

// ── Config des types ───────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; color: string; activeColor: string }> = {
  cours:             { label: 'Cours',               color: 'border-blue-700/40 text-blue-400',    activeColor: 'bg-blue-600' },
  bilan:             { label: 'Bilan',               color: 'border-green-700/40 text-green-400',  activeColor: 'bg-green-600' },
  extrait_oeuvre:    { label: "Extrait d'œuvre",     color: 'border-purple-700/40 text-purple-400',activeColor: 'bg-purple-600' },
  oeuvre_complete:   { label: 'Texte complet',       color: 'border-amber-700/40 text-amber-400',  activeColor: 'bg-amber-600' },
  fiche_questions:   { label: 'Fiche questions',      color: 'border-pink-700/40 text-pink-400',    activeColor: 'bg-pink-600' },
  grille_evaluation: { label: "Grille d'évaluation", color: 'border-orange-700/40 text-orange-400',activeColor: 'bg-orange-600' },
  fiche_methode:     { label: 'Fiche méthode',       color: 'border-cyan-700/40 text-cyan-400',    activeColor: 'bg-cyan-600' },
  fiche_lecture:     { label: 'Fiche de lecture',    color: 'border-indigo-700/40 text-indigo-400',activeColor: 'bg-indigo-600' },
  carte_mentale:     { label: 'Carte mentale',       color: 'border-teal-700/40 text-teal-400',    activeColor: 'bg-teal-600' },
  dictee:            { label: 'Dictée (prof)',        color: 'border-rose-700/40 text-rose-400',    activeColor: 'bg-rose-600' },
}

const DEFAULT_TITLES: Record<string, string> = {
  cours:             'Cours théorique',
  bilan:             'Bilan de séance',
  extrait_oeuvre:    "Extrait d'œuvre",
  oeuvre_complete:   'Texte court complet',
  fiche_questions:   'Fiche de questions',
  grille_evaluation: "Grille d'évaluation",
  fiche_methode:     'Fiche méthode',
  fiche_lecture:     'Fiche de lecture',
  carte_mentale:     'Carte mentale',
  dictee:            'Dictée',
}

// ── Types props ────────────────────────────────────────────────────────────────

export interface ResourcePanelContext {
  sequenceTitle: string
  niveau: string
  theme: string
  seanceNumero: number
  seanceTitle: string
  activiteId?: string
  activiteTitre: string
  activiteType: string
  activiteConsigne: string
  corpusRefs?: string[]
  /** @deprecated Utiliser corpusRefs */
  corpusRef?: string
  /** Si true, le panel s'ouvre sans sélectionner la première ressource existante
   *  → les chips de suggestions sont au premier plan pour générer un nouveau type. */
  startInGenerateMode?: boolean

  // ── Contexte pédagogique enrichi (rempli par SequenceEditor.openResourcePanel) ──
  sequenceProblematique?: string
  sequenceObjectifs?: string[]
  sequenceCompetences?: string[]
  seanceObjectifs?: string[]
  activiteDuree?: number
  progression?: { numero: number; titre: string }[]
  autresActivites?: { titre: string; type: string; duree?: number }[]
}

interface ResourcePanelProps {
  isOpen: boolean
  onClose: () => void
  context: ResourcePanelContext
  provider?: string
}

// ── Markdown renderer (léger, dédié aux ressources pédagogiques) ───────────────

function renderMarkdown(md: string): string {
  if (!md) return ''
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<h4 class="text-md font-semibold text-gray-200 mt-5 mb-2">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 class="text-lg font-bold text-blue-400 mt-6 mb-3 border-b border-gray-800/50 pb-1">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 class="text-xl font-extrabold text-white mt-7 mb-4 pb-2 border-b border-gray-800">$1</h2>')
    .replace(/^\&gt;\s?(.*$)/gim, '<blockquote class="border-l-4 border-blue-500 bg-blue-500/5 px-4 py-2.5 my-4 rounded-r text-gray-300 italic font-serif leading-relaxed">$1</blockquote>')
    .replace(/^\s*-\s?\[ \]\s?(.*$)/gim, '<div class="flex items-start gap-2 my-2"><input type="checkbox" disabled class="mt-1 rounded border-gray-700 bg-gray-800" /><span class="text-gray-300 text-sm">$1</span></div>')
    .replace(/^\s*-\s?(.*$)/gim, '<li class="list-disc ml-5 my-1 text-gray-300 text-sm">$1</li>')
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_{2}(.*?)_{2}/g, '<u>$1</u>')
    .replace(/_{60,}/g, '<div class="border-b border-dashed border-gray-700 my-3 w-full"></div>')

  // Tableaux
  html = html.replace(/((?:\|[^\n]*\|(?:\n|$))+)/g, (match) => {
    const lines = match.trim().split('\n').filter(Boolean)
    if (lines.length < 2) return match
    const hasSep = lines[1].includes('-')
    const startIdx = hasSep ? 2 : 1
    const headers = lines[0].split('|').map(x => x.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
    const headerHtml = `<thead><tr class="bg-gray-800/80">${headers.map(h => `<th class="p-2 text-left text-xs font-semibold text-gray-300 uppercase">${h}</th>`).join('')}</tr></thead>`
    const bodyHtml = `<tbody>${lines.slice(startIdx).map((line, idx) => {
      const cols = line.split('|').map(x => x.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
      return `<tr class="${idx % 2 === 0 ? 'bg-gray-900/30' : ''} border-b border-gray-800/40">${cols.map(c => `<td class="p-2 text-sm text-gray-300">${c}</td>`).join('')}</tr>`
    }).join('')}</tbody>`
    return `<div class="overflow-x-auto my-4 rounded-lg border border-gray-800"><table class="min-w-full">${headerHtml}${bodyHtml}</table></div>`
  })

  // Paragraphes
  const paragraphs = html.split(/\n\n+/)
  html = paragraphs.map(p => {
    const t = p.trim()
    if (!t) return ''
    if (/^<(h[1-6]|blockquote|li|div|table)/.test(t)) return p
    return `<p class="my-3 text-gray-300 leading-relaxed text-sm">${p.replace(/\n/g, '<br />')}</p>`
  }).join('\n')

  return html
}

// ── Utilitaire : grouper resources plates en paires ────────────────────────────

function groupIntoPairs(resources: RessourceStructuree[]): RessourcePaire[] {
  const pairs: RessourcePaire[] = []
  const seen = new Set<string>()

  for (const r of resources) {
    if (seen.has(r.id)) continue
    if (r.audience === 'professeur') {
      seen.add(r.id)
      const eleve = r.paired_with ? resources.find(x => x.id === r.paired_with) : undefined
      if (eleve) seen.add(eleve.id)
      pairs.push({ professeur: r, eleve })
    }
  }

  // Ressources sans paire prof (TEACHER_ONLY comme dictée)
  for (const r of resources) {
    if (!seen.has(r.id)) {
      seen.add(r.id)
      pairs.push({ professeur: r })
    }
  }

  return pairs
}

// ── Impression PDF ─────────────────────────────────────────────────────────────

function printResource(resource: RessourceStructuree, audience: 'eleve' | 'professeur') {
  const typeLabel = TYPE_CONFIG[resource.type]?.label || resource.type
  const suffix = audience === 'eleve' ? 'Élève' : 'Professeur'
  const badgeColor = audience === 'eleve' ? '#2563eb' : '#d97706'

  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${typeLabel} — ${suffix}</title>
    <style>
      body { font-family: 'Georgia', serif; max-width: 800px; margin: 0 auto; padding: 40px 48px; color: #1a1a1a; line-height: 1.7; }
      .badge { display: inline-flex; align-items: center; gap: 6px; background: ${badgeColor}22; color: ${badgeColor}; border: 1px solid ${badgeColor}44; border-radius: 20px; padding: 3px 12px; font-size: 12px; font-family: sans-serif; font-weight: 600; margin-bottom: 24px; }
      h1, h2 { border-bottom: 1px solid #ddd; padding-bottom: 6px; }
      h1 { font-size: 22px; } h2 { font-size: 18px; margin-top: 28px; } h3 { font-size: 15px; margin-top: 18px; }
      blockquote { border-left: 3px solid ${badgeColor}; background: ${badgeColor}11; padding: 12px 16px; margin: 16px 0; font-style: italic; border-radius: 0 4px 4px 0; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      th, td { border: 1px solid #e0e0e0; padding: 8px 12px; text-align: left; }
      th { background: #f5f5f5; font-weight: 700; font-size: 13px; }
      p { margin-bottom: 12px; }
      li { margin-bottom: 4px; }
      strong { font-weight: 700; }
      em { font-style: italic; }
      hr { border: none; border-top: 1px solid #e0e0e0; margin: 20px 0; }
      @media print { body { padding: 20px 24px; } .badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <div class="badge">${typeLabel} · ${suffix}</div>
    ${renderMarkdown(resource.contenu_markdown)}
    <script>window.onload = function() { window.print(); }</script>
  </body>
</html>`)
  printWindow.document.close()
}

// ── Composant principal ────────────────────────────────────────────────────────

export function ResourcePanel({ isOpen, onClose, context, provider }: ResourcePanelProps) {
  const [pairs, setPairs] = useState<RessourcePaire[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [activeAudience, setActiveAudience] = useState<'eleve' | 'professeur'>('eleve')
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  // Brouillon des blocs (fiche_questions). null = ressource non structurée en blocs → mode Markdown.
  const [blocsDraft, setBlocsDraft] = useState<FicheQuestionsContenu | null>(null)
  const [isLoadingDb, setIsLoadingDb] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [generatingType, setGeneratingType] = useState<RessourceType | null>(null)
  const [batchRunning, setBatchRunning] = useState(false)
  const [suggestedTypes, setSuggestedTypes] = useState<RessourceType[]>([])
  // Menu déroulant "Autre type…" : permet de générer n'importe quel type déclaré,
  // au-delà des suggestions liées au type d'activité.
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  // Instructions complémentaires libres du professeur (portée : prochaine génération).
  const [consignes, setConsignes] = useState('')
  const [consignesOpen, setConsignesOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // null = inconnu (pas encore chargé), true = contenu disponible, false = protégé
  const [corpusHasContent, setCorpusHasContent] = useState<boolean | null>(null)
  const [corpusMeta, setCorpusMeta] = useState<{ auteur: string; oeuvre: string; pages?: string } | null>(null)

  // Ref pour détecter un vrai changement de ressource (vs mise à jour de pairs après save)
  const currentResourceIdRef = useRef<string | null>(null)
  // Sérialisation des blocs au dernier état sauvegardé (détection de modifications)
  const savedBlocsRef = useRef<string>('')

  // ── Chargement au montage ──────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) {
      // Réinitialiser l'état quand le panel se ferme
      setPairs([])
      setSelectedIdx(null)
      setActiveAudience('eleve')
      setIsEditing(false)
      setError(null)
      setTypeMenuOpen(false)
      setConsignes('')
      setConsignesOpen(false)
      return
    }

    // Charger les suggestions pour ce type d'activité
    fetch(`/api/generate/resource?activiteType=${encodeURIComponent(context.activiteType)}`)
      .then(r => r.json())
      .then(data => { if (data.suggestions) setSuggestedTypes(data.suggestions) })
      .catch(() => { /* silencieux */ })

    // Charger les ressources existantes depuis la DB si activiteId disponible
    if (context.activiteId) {
      setIsLoadingDb(true)
      fetch(`/api/resources?activite_id=${context.activiteId}`)
        .then(r => r.json())
        .then(data => {
          if (data.ressources && data.ressources.length > 0) {
            const grouped = groupIntoPairs(data.ressources as RessourceStructuree[])
            setPairs(grouped)
            // En mode "générer un nouveau type", on ne sélectionne pas la première ressource
            // afin que les chips de suggestions soient visibles et cliquables au premier plan.
            if (!context.startInGenerateMode) {
              setSelectedIdx(0)
            }
          }
        })
        .catch(console.error)
        .finally(() => setIsLoadingDb(false))
    }
  }, [isOpen, context.activiteId, context.activiteType])

  // ── Vérification disponibilité du texte corpus ────────────────────────────

  const activeCorpusRefs = context.corpusRefs?.length
    ? context.corpusRefs
    : (context.corpusRef ? [context.corpusRef] : [])

  useEffect(() => {
    if (!isOpen || activeCorpusRefs.length === 0) {
      setCorpusHasContent(null)
      setCorpusMeta(null)
      return
    }
    fetch(`/api/corpus/${encodeURIComponent(activeCorpusRefs[0])}`)
      .then(r => r.json())
      .then(data => {
        if (data.item) {
          setCorpusHasContent(data.item.contenu !== '')
          const extra = activeCorpusRefs.length > 1 ? ` (+${activeCorpusRefs.length - 1} autre${activeCorpusRefs.length > 2 ? 's' : ''})` : ''
          setCorpusMeta({
            auteur: data.item.auteur,
            oeuvre: data.item.oeuvre + extra,
            pages: data.item.pages,
          })
        }
      })
      .catch(() => { /* silencieux */ })
  }, [isOpen, activeCorpusRefs.join(',')])

  // ── Sync contenu édité avec la sélection ──────────────────────────────────
  // Règle : on réinitialise l'édition UNIQUEMENT si on change de ressource.
  // Si pairs change suite à une sauvegarde (même resource.id), on ne touche pas à isEditing.

  useEffect(() => {
    if (selectedIdx === null || !pairs[selectedIdx]) return
    const paire = pairs[selectedIdx]
    const resource = activeAudience === 'eleve' && paire.eleve ? paire.eleve : paire.professeur

    if (resource.id !== currentResourceIdRef.current) {
      // Changement de ressource → réinitialiser proprement
      currentResourceIdRef.current = resource.id
      setEditedContent(resource.contenu_markdown)
      // Tente de parser le contenu en blocs (fiche_questions). null → mode Markdown.
      const blocs = resource.type === 'fiche_questions' ? parseFicheBlocs(resource.contenu_json) : null
      setBlocsDraft(blocs)
      savedBlocsRef.current = blocs ? JSON.stringify(blocs) : ''
      setIsEditing(false)
      setSaveSuccess(false)
      setConfirmDelete(false)
    }
    // Si même ressource (ex : pairs mis à jour après save), on ne touche à rien
  }, [selectedIdx, activeAudience, pairs])

  // ── Génération d'une ressource ─────────────────────────────────────────────

  const generateOne = useCallback(async (type: RessourceType): Promise<RessourcePaire | null> => {
    setGeneratingType(type)
    setError(null)

    try {
      const res = await fetch('/api/generate/resource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequenceTitle:    context.sequenceTitle,
          niveau:           context.niveau,
          theme:            context.theme,
          seanceNumero:     context.seanceNumero,
          seanceTitle:      context.seanceTitle,
          activiteId:       context.activiteId,
          activiteTitre:    context.activiteTitre,
          activiteType:     context.activiteType,
          activiteConsigne: context.activiteConsigne,
          ressourceType:    type,
          ressourceTitre:   DEFAULT_TITLES[type] || type,
          corpus_refs:      activeCorpusRefs.length > 0 ? activeCorpusRefs : undefined,
          corpus_ref:       activeCorpusRefs[0],
          provider,
          // Contexte pédagogique enrichi
          sequenceProblematique: context.sequenceProblematique,
          sequenceObjectifs:     context.sequenceObjectifs,
          sequenceCompetences:   context.sequenceCompetences,
          seanceObjectifs:       context.seanceObjectifs,
          activiteDuree:         context.activiteDuree,
          progression:           context.progression,
          autresActivites:       context.autresActivites,
          // Instructions libres du professeur (vide → undefined côté serveur)
          consignes:             consignes.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)

      return data as RessourcePaire
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de génération')
      return null
    } finally {
      setGeneratingType(null)
    }
  }, [context, provider, consignes])

  const handleGenerate = useCallback(async (type: RessourceType) => {
    const paire = await generateOne(type)
    if (!paire) return
    setPairs(prev => {
      const next = [...prev, paire]
      setSelectedIdx(next.length - 1)
      setActiveAudience('eleve')
      return next
    })
  }, [generateOne])

  const handleGenerateAll = useCallback(async () => {
    const existingTypes = pairs.map(p => p.professeur.type)
    const toGenerate = suggestedTypes.filter(t => !existingTypes.includes(t))
    if (toGenerate.length === 0) return

    setBatchRunning(true)
    let currentPairs = [...pairs]

    for (const type of toGenerate) {
      const paire = await generateOne(type)
      if (paire) {
        currentPairs = [...currentPairs, paire]
        setPairs(currentPairs)
        setSelectedIdx(currentPairs.length - 1)
        setActiveAudience('eleve')
      }
    }

    setBatchRunning(false)
  }, [pairs, suggestedTypes, generateOne])

  // ── Dérivés ────────────────────────────────────────────────────────────────

  const generatedTypes = pairs.map(p => p.professeur.type)
  const pendingSuggestions = suggestedTypes.filter(t => !generatedTypes.includes(t))
  // Tous les autres types déclarés (hors suggestions et hors déjà générés), pour
  // le menu "Autre type…". Aucune restriction d'implémentation : un type non encore
  // implémenté renverra une erreur claire à la génération (assumé, cf. roadmap).
  const otherTypes = RessourceTypeSchema.options.filter(
    t => !generatedTypes.includes(t) && !pendingSuggestions.includes(t)
  )
  const currentPaire = selectedIdx !== null ? pairs[selectedIdx] : null
  const hasEleve = Boolean(currentPaire?.eleve)
  const effectiveAudience = (!hasEleve && activeAudience === 'eleve') ? 'professeur' : activeAudience
  const currentResource = currentPaire
    ? (effectiveAudience === 'eleve' && currentPaire.eleve ? currentPaire.eleve : currentPaire.professeur)
    : null
  // Mode blocs actif si la ressource courante est une fiche_questions structurée
  const isBlocksMode = blocsDraft !== null && currentResource?.type === 'fiche_questions'
  const hasUnsavedChanges = isBlocksMode
    ? JSON.stringify(blocsDraft) !== savedBlocsRef.current
    : isEditing && currentResource !== null && editedContent !== currentResource.contenu_markdown

  const isGeneratingAny = generatingType !== null || batchRunning

  // ── Sauvegarde du Markdown édité ──────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!currentResource || isSaving) return

    setIsSaving(true)
    setSaveSuccess(false)
    setError(null)

    try {
      // Mode blocs : on envoie le contenu_json, le Markdown est régénéré côté serveur
      const payload = isBlocksMode
        ? { contenu_json: blocsDraft as unknown as Record<string, unknown> }
        : { contenu_markdown: editedContent }

      const res = await fetch(`/api/resources/${currentResource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      // Markdown à jour : renvoyé par le serveur en mode blocs, sinon le contenu édité
      const nextMarkdown = isBlocksMode ? (data.contenu_markdown as string) : editedContent
      const nextJson = isBlocksMode ? (blocsDraft as unknown as Record<string, unknown>) : undefined

      // Mettre à jour pairs en mémoire sans déclencher de reset d'édition
      setPairs(prev => prev.map((paire, idx) => {
        if (idx !== selectedIdx) return paire
        const apply = (r: RessourceStructuree) =>
          r.id === currentResource.id
            ? { ...r, contenu_markdown: nextMarkdown, ...(nextJson ? { contenu_json: nextJson } : {}) }
            : r
        return {
          professeur: apply(paire.professeur),
          eleve: paire.eleve ? apply(paire.eleve) : paire.eleve,
        }
      }))

      // En mode blocs, on fige le nouvel état sauvegardé
      if (isBlocksMode) savedBlocsRef.current = JSON.stringify(blocsDraft)

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    } finally {
      setIsSaving(false)
    }
  }, [currentResource, editedContent, isSaving, selectedIdx, isBlocksMode, blocsDraft])

  // ── Régénération complète de la ressource sélectionnée ───────────────────

  const handleRegenerate = useCallback(async () => {
    if (!currentPaire) return
    const type = currentPaire.professeur.type as RessourceType
    setIsRegenerating(true)
    setError(null)

    try {
      // 1. Supprimer l'ancienne paire en DB (les deux versions : prof + élève)
      await fetch(`/api/resources?id=${currentPaire.professeur.id}`, { method: 'DELETE' })

      // 2. Générer la nouvelle paire (la route la sauvegarde automatiquement en DB)
      const newPaire = await generateOne(type)
      if (!newPaire) return // generateOne a déjà positionné l'erreur

      // 3. Remplacer dans l'état local — le changement d'ID déclenchera le reset via currentResourceIdRef
      setPairs(prev => prev.map((p, idx) => idx === selectedIdx ? newPaire : p))
      setActiveAudience('eleve')
    } finally {
      setIsRegenerating(false)
    }
  }, [currentPaire, generateOne, selectedIdx])

  // ── Suppression de la ressource sélectionnée ──────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!currentPaire) return
    setIsDeleting(true)
    setError(null)

    try {
      const res = await fetch(`/api/resources?id=${currentPaire.professeur.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      // Retirer la paire de l'état local
      const newPairs = pairs.filter((_, idx) => idx !== selectedIdx)
      setPairs(newPairs)
      setSelectedIdx(newPairs.length > 0 ? Math.min(selectedIdx ?? 0, newPairs.length - 1) : null)
      setConfirmDelete(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    } finally {
      setIsDeleting(false)
    }
  }, [currentPaire, pairs, selectedIdx])

  // ── Fermeture avec auto-save si modifications en cours ────────────────────

  const handleClose = useCallback(async () => {
    if (hasUnsavedChanges) {
      // Sauvegarde silencieuse avant de fermer (évite la perte de données)
      try {
        const payload = isBlocksMode
          ? { contenu_json: blocsDraft as unknown as Record<string, unknown> }
          : { contenu_markdown: editedContent }
        await fetch(`/api/resources/${currentResource!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } catch {
        // On ferme quand même en cas d'erreur réseau
      }
    }
    onClose()
  }, [hasUnsavedChanges, currentResource, editedContent, onClose, isBlocksMode, blocsDraft])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black backdrop-blur-sm z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-gray-950/97 backdrop-blur-xl border-l border-gray-800 shadow-2xl z-50 flex flex-col text-gray-200"
          >
            {/* ── Header ── */}
            <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between bg-gray-900/40 shrink-0">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-0.5">Ressources pédagogiques</p>
                <h3 className="font-bold text-gray-100 leading-tight">{context.activiteTitre}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{context.seanceTitle} · Séquence : {context.sequenceTitle}</p>
              </div>
              <button
                onClick={handleClose}
                className="h-8 w-8 rounded-full border border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white flex items-center justify-center transition-colors shrink-0 ml-3"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* ── Bandeau corpus protégé ── */}
            {corpusHasContent === false && corpusMeta && (
              <div className="px-4 py-2.5 border-b border-amber-800/30 bg-amber-950/20 shrink-0 flex items-start gap-2.5">
                <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-400">Texte protégé — génération par référence</p>
                  <p className="text-[11px] text-amber-500/70 mt-0.5 leading-relaxed">
                    <em>{corpusMeta.oeuvre}</em> de {corpusMeta.auteur}{corpusMeta.pages ? ` (${corpusMeta.pages})` : ''} est sous droits d'auteur.
                    Les ressources seront générées <strong>en référence à cette œuvre</strong> sans reproduire le texte.
                    Pour <em>Extrait d'œuvre</em>, un espace réservé [texte à insérer] sera créé.
                  </p>
                </div>
              </div>
            )}

            {/* ── Sélecteur de ressources (tabs) ── */}
            <div className="px-4 py-3 border-b border-gray-800/60 shrink-0 space-y-2.5">

              {/* Ressources générées */}
              {pairs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pairs.map((paire, idx) => {
                    const type = paire.professeur.type
                    const cfg = TYPE_CONFIG[type] ?? { label: type, color: 'border-gray-700 text-gray-400', activeColor: 'bg-gray-600' }
                    const isActive = idx === selectedIdx
                    return (
                      <button
                        key={paire.professeur.id}
                        onClick={() => { setSelectedIdx(idx); setActiveAudience('eleve'); setIsEditing(false) }}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all',
                          isActive
                            ? `${cfg.activeColor} text-white border-transparent shadow-sm`
                            : `bg-transparent ${cfg.color} hover:brightness-125`,
                        )}
                      >
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Suggestions à générer + sélecteur libre de tous les types */}
              <div className="flex flex-wrap gap-1.5 items-center">
                {pendingSuggestions.map(type => {
                  const cfg = TYPE_CONFIG[type] ?? { label: type, color: 'border-gray-700 text-gray-500' }
                  const isGen = generatingType === type
                  return (
                    <button
                      key={type}
                      onClick={() => handleGenerate(type as RessourceType)}
                      disabled={isGeneratingAny}
                      className={cn(
                        'flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed text-xs transition-all disabled:opacity-40',
                        isGen ? 'border-blue-600 text-blue-400' : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300',
                      )}
                    >
                      {isGen
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Plus className="h-3 w-3" />}
                      {cfg.label}
                    </button>
                  )
                })}

                {pendingSuggestions.length > 1 && (
                  <button
                    onClick={handleGenerateAll}
                    disabled={isGeneratingAny}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600/10 border border-blue-700/40 text-xs text-blue-400 hover:bg-blue-600/20 disabled:opacity-40 font-semibold transition-all"
                  >
                    {batchRunning
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Sparkles className="h-3 w-3" />}
                    {batchRunning ? 'Génération en cours...' : `Tout générer (${pendingSuggestions.length})`}
                  </button>
                )}

                {/* Sélecteur libre : n'importe quel type déclaré (au-delà des suggestions) */}
                {otherTypes.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setTypeMenuOpen(v => !v)}
                      disabled={isGeneratingAny}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-gray-700 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-300 disabled:opacity-40 transition-all"
                    >
                      <Plus className="h-3 w-3" />
                      Autre type…
                    </button>

                    {typeMenuOpen && (
                      <>
                        {/* Backdrop : ferme le menu au clic extérieur */}
                        <div className="fixed inset-0 z-20" onClick={() => setTypeMenuOpen(false)} />
                        <div className="absolute left-0 top-full mt-1 z-30 w-52 max-h-72 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl p-1">
                          <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500">Tous les types</p>
                          {otherTypes.map(type => {
                            const cfg = TYPE_CONFIG[type] ?? { label: type, color: 'border-gray-700 text-gray-400', activeColor: 'bg-gray-600' }
                            return (
                              <button
                                key={type}
                                onClick={() => { setTypeMenuOpen(false); handleGenerate(type) }}
                                disabled={isGeneratingAny}
                                className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md hover:bg-gray-800 disabled:opacity-40 transition-colors"
                              >
                                <span className={cn('text-[11px] px-2 py-0.5 rounded border font-medium', cfg.color)}>
                                  {cfg.label}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Instructions complémentaires (optionnel) — portée : prochaine génération */}
              <div>
                <button
                  onClick={() => setConsignesOpen(v => !v)}
                  className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <Edit3 className="h-3 w-3" />
                  Instructions complémentaires
                  {consignes.trim() && !consignesOpen && (
                    <span className="text-[10px] text-blue-400 bg-blue-500/10 border border-blue-700/30 px-1.5 py-0.5 rounded-full">actives</span>
                  )}
                  <span className="text-gray-600 text-[9px]">{consignesOpen ? '▲' : '▼'}</span>
                </button>

                {consignesOpen && (
                  <>
                    <textarea
                      value={consignes}
                      onChange={(e) => setConsignes(e.target.value)}
                      placeholder="Ex : insiste sur le vocabulaire des émotions, privilégie les QCM, évite les questions trop longues…"
                      rows={2}
                      className="mt-1.5 w-full text-xs bg-gray-900/60 border border-gray-700 rounded-lg px-2.5 py-2 text-gray-200 placeholder-gray-600 focus:border-blue-600/60 focus:outline-none resize-y"
                    />
                    <p className="mt-1 text-[10px] text-gray-500">
                      Appliquées à la prochaine génération (suggestions ou « Autre type… »). Non enregistrées.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* ── Corps ── */}
            <div className="flex-1 overflow-hidden flex flex-col">

              {/* État vide / chargement */}
              {pairs.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-10 space-y-5">
                  {isLoadingDb ? (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                      <p className="text-sm text-gray-400">Chargement des ressources...</p>
                    </>
                  ) : (
                    <>
                      <div className="h-14 w-14 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                        <Sparkles className="h-7 w-7" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-base">Aucune ressource générée</h4>
                        <p className="text-sm text-gray-500 mt-1.5 max-w-xs leading-relaxed">
                          Cliquez sur un type ci-dessus pour générer une fiche élève + corrigé professeur en un clic.
                        </p>
                      </div>
                      {!context.activiteId && (
                        <p className="text-xs text-amber-500/80 bg-amber-900/20 border border-amber-800/30 rounded-lg px-3 py-2 max-w-xs">
                          💡 Sauvegardez la séquence pour que les ressources générées soient persistées.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Mode "générer un nouveau type" : ressources existantes mais rien de sélectionné */}
              {pairs.length > 0 && selectedIdx === null && !isGeneratingAny && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-10 space-y-3">
                  <div className="h-12 w-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Plus className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-sm">Générer un nouveau type</h4>
                    <p className="text-xs text-gray-500 mt-1 max-w-xs leading-relaxed">
                      Cliquez sur un type en pointillés ci-dessus pour générer une ressource supplémentaire.
                    </p>
                  </div>
                </div>
              )}

              {/* Erreur */}
              {error && (
                <div className="mx-4 mt-3 p-3 rounded-lg bg-red-900/20 border border-red-800/30 flex items-start gap-2 shrink-0">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              )}

              {/* Génération en cours (quand pairs.length > 0) */}
              {isGeneratingAny && pairs.length > 0 && (
                <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-blue-900/20 border border-blue-800/30 flex items-center gap-2 shrink-0">
                  <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />
                  <p className="text-xs text-blue-300">
                    {generatingType
                      ? `Génération de la ${TYPE_CONFIG[generatingType]?.label ?? generatingType}...`
                      : 'Génération en cours...'}
                  </p>
                </div>
              )}

              {/* Visionneuse de ressource */}
              {currentPaire && (
                <div className="flex-1 overflow-hidden flex flex-col">

                  {/* Toggle Élève / Professeur + mode édition */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/50 shrink-0">
                    {/* Toggle audience */}
                    <div className="flex rounded-lg overflow-hidden border border-gray-800 bg-gray-900/60 shrink-0">
                      <button
                        onClick={() => { setActiveAudience('eleve'); setIsEditing(false) }}
                        disabled={!hasEleve}
                        title={!hasEleve ? "Ce type n'a pas de version élève" : undefined}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors',
                          effectiveAudience === 'eleve'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed',
                        )}
                      >
                        <User className="h-3.5 w-3.5" />
                        Élève
                      </button>
                      <button
                        onClick={() => { setActiveAudience('professeur'); setIsEditing(false) }}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors',
                          effectiveAudience === 'professeur'
                            ? 'bg-amber-600 text-white'
                            : 'text-gray-400 hover:text-gray-200',
                        )}
                      >
                        <GraduationCap className="h-3.5 w-3.5" />
                        Professeur
                      </button>
                    </div>

                    {/* Bouton Sauvegarder (visible en mode édition) */}
                    <AnimatePresence>
                      {isEditing && (
                        <motion.button
                          key="save-btn"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          onClick={handleSave}
                          disabled={isSaving || !hasUnsavedChanges}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                            saveSuccess
                              ? 'bg-green-600/20 border border-green-700/50 text-green-400'
                              : hasUnsavedChanges
                                ? 'bg-blue-600/20 border border-blue-700/50 text-blue-400 hover:bg-blue-600/30'
                                : 'bg-gray-800/50 border border-gray-700/40 text-gray-500 cursor-default',
                          )}
                          title={hasUnsavedChanges ? 'Sauvegarder les modifications' : 'Aucune modification'}
                        >
                          {isSaving
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : saveSuccess
                              ? <CheckCircle2 className="h-3.5 w-3.5" />
                              : <Save className="h-3.5 w-3.5" />}
                          {isSaving ? 'Sauvegarde…' : saveSuccess ? 'Sauvegardé' : 'Sauvegarder'}
                        </motion.button>
                      )}
                    </AnimatePresence>

                    {/* Mode aperçu / édition */}
                    <div className="flex gap-1 bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setIsEditing(false)}
                        className={cn(
                          'p-1.5 transition-colors',
                          !isEditing ? 'bg-gray-700 text-gray-100' : 'text-gray-600 hover:text-gray-400',
                        )}
                        title="Aperçu rendu"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setIsEditing(true)}
                        className={cn(
                          'p-1.5 transition-colors',
                          isEditing ? 'bg-gray-700 text-gray-100' : 'text-gray-600 hover:text-gray-400',
                        )}
                        title={isBlocksMode ? 'Éditer les blocs' : 'Éditer le Markdown'}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Zone de contenu */}
                  <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
                    {isBlocksMode && blocsDraft ? (
                      // ── Fiche de questions structurée en blocs ──
                      !isEditing ? (
                        <FicheBlocsRenderer contenu={blocsDraft} audience={effectiveAudience} />
                      ) : (
                        <FicheBlocsEditor contenu={blocsDraft} onChange={setBlocsDraft} />
                      )
                    ) : !isEditing ? (
                      <div
                        className="prose prose-invert max-w-none font-sans"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(editedContent) }}
                      />
                    ) : (
                      <textarea
                        value={editedContent}
                        onChange={e => setEditedContent(e.target.value)}
                        className="w-full h-full min-h-[500px] bg-transparent border-0 resize-none font-mono text-sm text-gray-300 focus:outline-none leading-relaxed"
                        placeholder="Contenu Markdown..."
                        spellCheck={false}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="px-4 py-3 border-t border-gray-800/80 bg-gray-900/40 flex items-center justify-between shrink-0 gap-2">

              {/* Impression */}
              <div className="flex gap-1.5 shrink-0">
                {currentResource && (
                  <>
                    {currentPaire?.eleve && (
                      <button
                        onClick={() => currentPaire.eleve && printResource(currentPaire.eleve, 'eleve')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-800/50 text-xs text-blue-400 hover:bg-blue-500/10 transition-all font-medium"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Imprimer Élève
                      </button>
                    )}
                    <button
                      onClick={() => printResource(currentPaire!.professeur, 'professeur')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-800/50 text-xs text-amber-400 hover:bg-amber-500/10 transition-all font-medium"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Imprimer Prof
                    </button>
                  </>
                )}
              </div>

              {/* Actions sur la ressource + Fermer */}
              <div className="flex items-center gap-1.5 shrink-0">

                {/* Régénérer */}
                {currentPaire && (
                  <button
                    onClick={handleRegenerate}
                    disabled={isRegenerating || isGeneratingAny || isDeleting}
                    title="Régénérer entièrement cette ressource (remplace le contenu actuel)"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700/60 text-xs text-gray-400 hover:text-white hover:border-gray-600 hover:bg-gray-800/60 disabled:opacity-40 transition-all font-medium"
                  >
                    {isRegenerating
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />}
                    {isRegenerating ? 'Régénération…' : 'Régénérer'}
                  </button>
                )}

                {/* Supprimer — deux clics (confirm) */}
                {currentPaire && (
                  confirmDelete ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600/20 border border-red-700/50 text-xs text-red-400 hover:bg-red-600/30 disabled:opacity-50 transition-all font-semibold"
                      >
                        {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Confirmer
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="text-xs text-gray-500 hover:text-gray-300 px-1.5 transition-colors"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      disabled={isRegenerating || isDeleting}
                      title="Supprimer cette ressource"
                      className="p-1.5 rounded-lg border border-gray-800 text-gray-600 hover:text-red-400 hover:border-red-800/50 hover:bg-red-500/5 disabled:opacity-40 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )
                )}

                <div className="w-px h-4 bg-gray-800 mx-0.5" />

                {/* Fermer */}
                <button
                  onClick={handleClose}
                  className={cn(
                    'text-xs px-3 py-1.5 transition-colors',
                    hasUnsavedChanges
                      ? 'text-amber-500 hover:text-amber-300'
                      : 'text-gray-500 hover:text-gray-300',
                  )}
                >
                  {hasUnsavedChanges ? 'Fermer (auto-save)' : 'Fermer'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
