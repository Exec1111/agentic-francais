/**
 * Prompts de la route /api/corpus/suggest
 * Deux étapes :
 *  1. Extraction du niveau et du thème depuis la demande libre
 *  2. Suggestion IA de textes complémentaires quand le corpus est insuffisant
 */

import type { LLMMessage } from '../llm-provider'
import type { CorpusItem } from '@/shared/schemas'

// ── Étape 1 : extraction des paramètres pédagogiques ─────────────────────────

export const EXTRACT_PARAMS_SYSTEM_PROMPT =
  `Extrais le niveau scolaire et le thème principal d'une demande pédagogique.
Réponds UNIQUEMENT avec un objet JSON valide contenant : niveau, theme, nombre_seances (défaut 5), contraintes (tableau vide si aucune), evaluation_finale (true par défaut), problematique_suggeree (chaîne vide si non précisée).`

export function buildExtractParamsMessages(demande: string): LLMMessage[] {
  return [
    { role: 'system', content: EXTRACT_PARAMS_SYSTEM_PROMPT },
    { role: 'user', content: demande },
  ]
}

// ── Étape 2 : suggestions IA quand < 2 textes trouvés dans le corpus ──────────

export function buildCorpusSuggestionMessages(
  niveau: string,
  theme: string,
  found: Pick<CorpusItem, 'auteur' | 'oeuvre'>[],
): LLMMessage[] {
  const alreadyFound = found.length > 0
    ? `Textes déjà disponibles : ${found.map((f) => `${f.auteur} — ${f.oeuvre}`).join(', ')}. Propose des textes COMPLÉMENTAIRES.`
    : 'Propose 2 textes essentiels pour cette séquence.'

  return [
    {
      role: 'system',
      content: `Tu es un expert en littérature française scolaire. Suggère des textes littéraires pertinents pour une séquence pédagogique. Réponds UNIQUEMENT avec un tableau JSON.`,
    },
    {
      role: 'user',
      content: `Séquence pour des élèves de ${niveau}, sur le thème "${theme}".
${alreadyFound}

Réponds UNIQUEMENT avec ce tableau JSON (2 éléments max) :
[
  {
    "auteur": "Prénom Nom",
    "oeuvre": "Titre exact",
    "extrait_recommande": "Description précise de l'extrait recommandé",
    "pourquoi": "Justification pédagogique en 1 phrase",
    "niveau_difficulte": "accessible",
    "mots_approximatifs": 300
  }
]`,
    },
  ]
}
