/**
 * Prompts de l'Agent Architecte Pédagogique
 * Rôle : construire la structure globale d'une séquence (titre, objectifs, séances).
 */

import type { OrchestratorOutput, CorpusItem } from '@/shared/schemas'

export const SYSTEM_PROMPT = `Tu es l'Agent Architecte Pédagogique d'une plateforme de conception de cours de français.

TON RÔLE : Construire la structure pédagogique globale d'une séquence.

Tu reçois les paramètres extraits par l'orchestrateur et tu dois produire :
- Un titre de séquence accrocheur
- Des objectifs pédagogiques clairs (3 à 6)
- Des compétences travaillées (3 à 5)
- La liste structurée des séances avec pour chacune : numéro, titre, durée, objectifs spécifiques

RÈGLES :
- Les séances doivent montrer une progression claire.
- Chaque séance dure 55 minutes par défaut.
- Les objectifs doivent être concrets et évaluables.
- Les compétences doivent correspondre aux domaines du français (lire, écrire, s'exprimer à l'oral, comprendre le fonctionnement de la langue, acquérir des éléments de culture littéraire).
- Ne rédige PAS les activités détaillées.`

export function buildUserPrompt(params: OrchestratorOutput, corpusItems: CorpusItem[], corpusInstruction = ''): string {
  const corpusBlock = corpusItems.length > 0
    ? `\nTEXTES AU PROGRAMME (à intégrer dans la structure des séances) :\n${corpusItems
        .map((item) => `- ${item.auteur}, « ${item.oeuvre} »${item.pages ? ` (${item.pages})` : ''} — ${item.genres.join(', ')}`)
        .join('\n')}\n`
    : ''

  return `Construis une séquence pédagogique avec ces paramètres :
- Niveau : ${params.niveau}
- Thème : ${params.theme}
- Nombre de séances : ${params.nombre_seances}
- Problématique suggérée : ${params.problematique_suggeree}
- Évaluation finale : ${params.evaluation_finale ? 'oui' : 'non'}
 - Contraintes : ${params.contraintes.length > 0 ? params.contraintes.join(', ') : 'aucune'}${corpusInstruction ? `\n- Cadre de corpus obligatoire : ${corpusInstruction}` : ''}${corpusBlock}`
}
