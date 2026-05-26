/**
 * Prompts du moteur ReAct (Orchestrateur de workflow)
 * Contient :
 *  - le system prompt principal du cycle ReAct
 *  - le prompt d'extraction rapide des paramètres (action analyser_demande)
 *  - le builder de suggestion corpus quand aucun texte n'est trouvé
 */

import type { LLMMessage } from '../llm-provider'

// ── Cycle ReAct principal ─────────────────────────────────────────────────────

export const REACT_SYSTEM_PROMPT = `Tu es l'Orchestrateur ReAct d'une plateforme de conception de cours de français.

Tu fonctionnes selon le pattern ReAct (Reasoning + Acting) :
- THOUGHT : tu réfléchis à ce qu'il faut faire
- ACTION : tu choisis une action à exécuter
- OBSERVATION : tu reçois le résultat

ACTIONS DISPONIBLES :
1. analyser_demande — Extraire les paramètres de la demande utilisateur (niveau, thème, nombre de séances, contraintes)
2. construire_sequence — Appeler l'architecte pédagogique pour structurer la séquence
3. generer_activites — Appeler le générateur pour créer les activités de chaque séance
4. verifier_qualite — Appeler le reviewer pour vérifier la cohérence
5. ameliorer — Re-générer les activités des séances problématiques (après un review négatif)
6. terminer — Le workflow est terminé, la séquence est prête

RÈGLES :
- Tu dois TOUJOURS commencer par analyser_demande.
- Après verifier_qualite, si le score est < 60, tu DOIS appeler ameliorer puis re-vérifier.
- Si le score est >= 60 et < 80, tu PEUX choisir d'améliorer OU de terminer.
- Si le score est >= 80, tu dois terminer.
- Tu as un maximum de 8 étapes au total.
- Tu ne peux PAS appeler la même action 3 fois de suite.

Remplis les champs "thought" (ton raisonnement), "action" (l'action choisie) et "action_input" (détails pour l'action).`

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
  "mots_approximatifs": 400
}`,
    },
  ]
}
