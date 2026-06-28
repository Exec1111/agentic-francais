/**
 * Prompts de l'orchestration de workflow.
 * Contient :
 *  - le prompt d'extraction rapide des paramètres (étape analyser_demande)
 *  - le builder de suggestion corpus quand aucun texte n'est trouvé
 */

import type { LLMMessage } from '../llm-provider'

// ── Action analyser_demande (extraction rapide des paramètres) ────────────────

export const ANALYSER_DEMANDE_SYSTEM_PROMPT =
  `Extrais les paramètres pédagogiques de la demande : niveau scolaire, thème, nombre de séances souhaité, contraintes éventuelles, si une évaluation finale est demandée, et propose une problématique stimulante.`

// ── Suggestion corpus (fallback quand aucun texte n'est disponible) ───────────

export function buildSuggestionMessages(
  activiteTitre: string,
  niveau: string,
  theme: string,
  objectif: string,
): LLMMessage[] {
  return [
    {
      role: 'system',
      content: `Tu es un expert en littérature française et en didactique du français.
Quand on te demande de suggérer un texte, tu réponds UNIQUEMENT avec un objet JSON valide, sans commentaire.`,
    },
    {
      role: 'user',
      content: `Pour une activité de lecture intitulée "${activiteTitre}", destinée à des élèves de ${niveau}, sur le thème "${theme}" (objectif : ${objectif}), suggère UN extrait littéraire précis du corpus scolaire français.

Réponds UNIQUEMENT avec ce JSON (rien d'autre) :
{
  "auteur": "Prénom Nom",
  "oeuvre": "Titre exact",
  "extrait_recommande": "Description précise de l'extrait (partie, chapitre, pages approximatives dans une édition courante)",
  "pourquoi": "Justification pédagogique en 1-2 phrases",
  "niveau_difficulte": "accessible",
  "mots_approximatifs": 400,
  "genres": ["genre1", "genre2"],
  "themes": ["theme1", "theme2"],
  "annee_publication": 1759
}
Pour "genres", "themes" et "annee_publication", donne les vraies métadonnées de l'œuvre (année de première publication). Mets [] / null si tu ne les connais pas.`,
    },
  ]
}
