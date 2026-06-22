/**
 * Prompts de l'Agent Générateur d'Activités
 * Rôle : créer les activités pédagogiques détaillées pour chaque séance.
 */

import type { CorpusItem } from '@/shared/schemas'

export const SYSTEM_PROMPT = `Tu es l'Agent Générateur d'Activités d'une plateforme de conception de cours de français.

TON RÔLE : Créer les activités pédagogiques détaillées pour UNE séance donnée.

Pour chaque séance, tu dois produire 2 activités variées et adaptées au niveau.

Types d'activités possibles :
- exercice : travail individuel sur une notion
- production_ecrite : rédaction
- debat : échange oral structuré
- lecture : analyse de texte
- oral : expression orale
- evaluation : évaluation formative ou sommative
- collaboration : travail en groupe
- recherche : recherche documentaire

RÈGLES GÉNÉRALES :
- La somme des durées ne doit PAS dépasser la durée totale de la séance.
- Les consignes doivent être claires, précises et adressées aux élèves.
- Varie les types d'activités au sein d'une même séance.
- Respecte la progressivité (du simple au complexe).
- Adapte le vocabulaire et la difficulté au niveau scolaire.

RÈGLE ABSOLUE SUR LES TEXTES :
- Si des "TEXTES AU PROGRAMME" sont fournis dans la demande, toute activité de type "lecture", "exercice" ou "production_ecrite" DOIT se baser EXCLUSIVEMENT sur ces textes.
- Tu NE PEUX PAS inventer un texte fictif, un titre imaginaire ou un "document non fourni".
- Cite l'auteur et le titre exact du texte fourni dans la consigne.
- Si tu veux citer un passage, utilise UNIQUEMENT des extraits présents dans le texte fourni.`

/**
 * Budget de caractères par texte envoyé au générateur.
 *
 * Un PASSAGE (unité de travail attendue) tient toujours sous ce seuil : il est
 * donc transmis intégralement. Le budget n'est qu'un garde-fou pour le cas où
 * une œuvre complète serait encore référencée en direct — il évite d'exploser le
 * contexte sans pour autant tronquer à l'incipit. Il s'étend de lui-même : plus
 * besoin de le retoucher quand on travaille sur des passages.
 */
export const CORPUS_BUDGET_CHARS = 14000

function clampToBudget(contenu: string): string {
  if (contenu.length <= CORPUS_BUDGET_CHARS) return contenu
  return (
    contenu.slice(0, CORPUS_BUDGET_CHARS) +
    "\n[...] (œuvre tronquée — découpe-la en passages pour cibler une portion précise)"
  )
}

export function buildCorpusBlock(corpusItems: CorpusItem[]): string {
  if (corpusItems.length === 0) return ''
  return `

⚠️ TEXTES AU PROGRAMME — OBLIGATION ABSOLUE :
Tu DOIS baser les activités de lecture/exercice/production sur ces textes RÉELS.
N'invente AUCUN autre texte. N'écris JAMAIS "texte non fourni" ou "texte imaginé".

${corpusItems.map((item) =>
    [
      `━━━ TEXTE OFFICIEL : ${item.auteur}, « ${item.oeuvre} » ━━━`,
      `(${item.edition_reference}${item.pages ? `, ${item.pages}` : ''}${item.angle ? ` — angle : ${item.angle}` : ''})`,
      clampToBudget(item.contenu),
      `━━━ FIN DU TEXTE ━━━`,
    ].join('\n')
  ).join('\n\n')}
`
}

export function buildSeanceUserPrompt(
  architecture: { titre_sequence: string; niveau: string; theme: string; objectifs: string[] },
  seance: { numero: number; titre: string; duree: number; objectifs: string[] },
  corpusBlock: string,
): string {
  return `Génère les activités pour cette séance :
- Séquence : "${architecture.titre_sequence}"
- Niveau : ${architecture.niveau}
- Thème : ${architecture.theme}
- Séance n°${seance.numero} : "${seance.titre}"
- Durée : ${seance.duree} minutes
- Objectifs de la séance : ${seance.objectifs.join(', ')}
- Objectifs globaux de la séquence : ${architecture.objectifs.join(', ')}${corpusBlock}`
}
