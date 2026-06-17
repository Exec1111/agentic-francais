import { useCallback } from 'react'
import type { useSequenceEditor } from '@/frontend/hooks/useSequenceEditor'
import type { Activite, Sequence, ActionableSuggestion } from '@/shared/schemas'

type EditorReturn = ReturnType<typeof useSequenceEditor>

/**
 * Prévisualisation d'un correctif : on calcule le changement (en appelant un
 * agent IA si nécessaire) SANS l'appliquer. L'utilisateur valide ensuite via
 * `commit`, qui passe par useSequenceEditor (donc annulable avec Ctrl+Z).
 */
export type SuggestionPreview =
  | { kind: 'remplacer_activite'; seanceIndex: number; activiteIndex: number; before: Activite; after: Activite }
  | { kind: 'ajouter_activite'; seanceIndex: number; after: Activite }
  | { kind: 'supprimer_activite'; seanceIndex: number; activiteIndex: number; before: Activite }
  | { kind: 'modifier_consigne'; seanceIndex: number; activiteIndex: number; before: string; after: string }
  | { kind: 'modifier_objectifs'; seanceIndex: number; before: string[]; after: string[] }

interface Target {
  seanceIndex: number
  activiteIndex: number | null
}

/** Résout (numéro de séance + titre d'activité) → index. Lève si introuvable. */
function resolveTarget(sequence: Sequence, suggestion: ActionableSuggestion): Target {
  const seanceIndex = sequence.seances.findIndex((s) => s.numero === suggestion.seance_numero)
  if (seanceIndex === -1) {
    throw new Error(`Séance n°${suggestion.seance_numero} introuvable.`)
  }
  if (suggestion.activite_titre == null) {
    return { seanceIndex, activiteIndex: null }
  }
  const activites = sequence.seances[seanceIndex].activites
  const activiteIndex = activites.findIndex((a) => a.titre === suggestion.activite_titre)
  if (activiteIndex === -1) {
    throw new Error(`Activité « ${suggestion.activite_titre} » introuvable dans la séance n°${suggestion.seance_numero}.`)
  }
  return { seanceIndex, activiteIndex }
}

/**
 * Retourne `null` si la suggestion est applicable, sinon une raison (affichée
 * en tooltip et utilisée pour désactiver le bouton).
 */
export function suggestionBlocker(sequence: Sequence | null, suggestion: ActionableSuggestion): string | null {
  if (!sequence) return 'Aucune séquence chargée.'
  if (suggestion.action === 'aucune') return 'Conseil général — à appliquer manuellement.'
  if (suggestion.seance_numero == null) return 'Suggestion non rattachée à une séance précise.'

  const needsActivite =
    suggestion.action === 'remplacer_activite' ||
    suggestion.action === 'supprimer_activite' ||
    suggestion.action === 'modifier_consigne'
  if (needsActivite && suggestion.activite_titre == null) {
    return 'Activité cible non précisée.'
  }
  try {
    resolveTarget(sequence, suggestion)
  } catch (e) {
    return e instanceof Error ? e.message : 'Cible introuvable.'
  }
  return null
}

function buildSeanceContext(sequence: Sequence, seanceIndex: number, excludeActiviteIndex: number | null) {
  const seance = sequence.seances[seanceIndex]
  return {
    titre_sequence: sequence.titre,
    niveau: sequence.niveau,
    theme: sequence.theme,
    objectifs_sequence: sequence.objectifs,
    seanceNumero: seance.numero,
    seanceTitre: seance.titre,
    seanceObjectifs: seance.objectifs,
    seanceDuree: seance.duree,
    autresActivites: seance.activites
      .filter((_, i) => i !== excludeActiviteIndex)
      .map((a) => ({ titre: a.titre, type: a.type, duree: a.duree })),
  }
}

export function useSuggestionApply(editor: EditorReturn | undefined, provider?: string) {
  const sequence = editor?.sequence ?? null

  /** Calcule le correctif (sans l'appliquer) et renvoie une prévisualisation. */
  const prepare = useCallback(
    async (suggestion: ActionableSuggestion): Promise<SuggestionPreview> => {
      if (!sequence) throw new Error('Aucune séquence chargée.')
      const { seanceIndex, activiteIndex } = resolveTarget(sequence, suggestion)
      const seance = sequence.seances[seanceIndex]

      switch (suggestion.action) {
        case 'supprimer_activite': {
          const before = seance.activites[activiteIndex!]
          return { kind: 'supprimer_activite', seanceIndex, activiteIndex: activiteIndex!, before }
        }

        case 'remplacer_activite':
        case 'ajouter_activite': {
          const isAdd = suggestion.action === 'ajouter_activite'
          const current = isAdd ? undefined : seance.activites[activiteIndex!]
          const res = await fetch('/api/generate/activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              seanceContext: buildSeanceContext(sequence, seanceIndex, isAdd ? null : activiteIndex),
              activiteActuelle: current
                ? { titre: current.titre, type: current.type, duree: current.duree, consigne: current.consigne }
                : undefined,
              motif: suggestion.instruction,
              provider,
              corpus_refs: sequence.corpus_refs,
              mode: isAdd ? 'ajouter' : 'remplacer',
            }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error || 'Erreur serveur')
          }
          const data = await res.json()
          const after: Activite = {
            ...data.activite,
            differenciation: data.activite.differenciation ?? undefined,
            ressources: current?.ressources ?? [],
            corpus_refs: current?.corpus_refs ?? [],
            corpus_status: current?.corpus_status,
            corpus_suggestion: current?.corpus_suggestion,
          }
          return isAdd
            ? { kind: 'ajouter_activite', seanceIndex, after }
            : { kind: 'remplacer_activite', seanceIndex, activiteIndex: activiteIndex!, before: current!, after }
        }

        case 'modifier_consigne': {
          const current = seance.activites[activiteIndex!]
          const res = await fetch('/api/generate/field', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind: 'consigne',
              context: {
                titre_sequence: sequence.titre,
                niveau: sequence.niveau,
                theme: sequence.theme,
                seanceNumero: seance.numero,
                seanceTitre: seance.titre,
                seanceObjectifs: seance.objectifs,
                activiteTitre: current.titre,
                activiteType: current.type,
              },
              currentValue: current.consigne,
              instruction: suggestion.instruction,
              provider,
            }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error || 'Erreur serveur')
          }
          const data = await res.json()
          return { kind: 'modifier_consigne', seanceIndex, activiteIndex: activiteIndex!, before: current.consigne, after: String(data.value) }
        }

        case 'modifier_objectifs': {
          const res = await fetch('/api/generate/field', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind: 'objectifs',
              context: {
                titre_sequence: sequence.titre,
                niveau: sequence.niveau,
                theme: sequence.theme,
                seanceNumero: seance.numero,
                seanceTitre: seance.titre,
                seanceObjectifs: seance.objectifs,
              },
              currentValue: seance.objectifs,
              instruction: suggestion.instruction,
              provider,
            }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error || 'Erreur serveur')
          }
          const data = await res.json()
          const after = Array.isArray(data.value) ? data.value.map(String) : [String(data.value)]
          return { kind: 'modifier_objectifs', seanceIndex, before: seance.objectifs, after }
        }

        default:
          throw new Error('Action non applicable automatiquement.')
      }
    },
    [sequence, provider],
  )

  /** Applique la prévisualisation validée via l'éditeur (annulable Ctrl+Z). */
  const commit = useCallback(
    (preview: SuggestionPreview) => {
      if (!editor) return
      switch (preview.kind) {
        case 'remplacer_activite':
          editor.replaceActivite(preview.seanceIndex, preview.activiteIndex, preview.after)
          break
        case 'ajouter_activite':
          editor.addActivite(preview.seanceIndex, preview.after)
          break
        case 'supprimer_activite':
          editor.removeActivite(preview.seanceIndex, preview.activiteIndex)
          break
        case 'modifier_consigne':
          editor.updateField(
            { level: 'activite', seanceIndex: preview.seanceIndex, activiteIndex: preview.activiteIndex, field: 'consigne' },
            preview.after,
          )
          break
        case 'modifier_objectifs':
          editor.updateField({ level: 'seance', seanceIndex: preview.seanceIndex, field: 'objectifs' }, preview.after)
          break
      }
    },
    [editor],
  )

  return { prepare, commit, blocker: (s: ActionableSuggestion) => suggestionBlocker(sequence, s) }
}
