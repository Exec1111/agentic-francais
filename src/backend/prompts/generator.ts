/**
 * Prompts de l'Agent Générateur d'Activités
 * Rôle : créer les activités pédagogiques détaillées pour chaque séance.
 */

import type { CorpusItem, ModePedagogique } from '@/shared/schemas'

export const SYSTEM_PROMPT = `Tu es l'Agent Générateur d'Activités d'une plateforme de conception de cours de français.

TON RÔLE : Créer les activités pédagogiques détaillées pour UNE séance donnée.

Pour chaque séance, tu dois produire 2 activités variées et adaptées au niveau.
Renseigne le champ "phase" à null, SAUF instruction contraire (mode enseignement explicite).

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

/**
 * Bloc de consignes ajouté quand la séance est en mode ENSEIGNEMENT EXPLICITE.
 * Structure la séance selon le canevas en 5 phases (Archer & Hughes / CSEN 2022)
 * et impose les garde-fous associés. Chaque activité doit porter sa "phase".
 */
export const EXPLICIT_CANVAS_BLOCK = `
━━━ MODE ENSEIGNEMENT EXPLICITE — CANEVAS EN 5 PHASES ━━━
Cette séance vise l'acquisition d'une notion NOUVELLE. Structure-la du simple au
complexe en produisant UNE activité par phase (4 à 5 activités), chacune avec son
champ "phase" renseigné, dans cet ordre :

1. "ouverture" — Annoncer l'objectif en mots d'élève et réactiver les acquis utiles
   par un questionnement actif (pas un simple « vous vous souvenez ? »). Court.
2. "modelage" — « JE FAIS » : l'enseignant démontre la notion à voix haute, avec un
   exemple résolu (worked example) et un contre-exemple. La consigne décrit ce que
   l'enseignant montre.
3. "pratique_guidee" — « NOUS FAISONS ENSEMBLE » : les élèves s'exercent collectivement
   avec étayage fort ; prévois une vérification active de la compréhension (faire
   reformuler, justifier) et des feed-back. Du simple au complexe.
4. "pratique_autonome" — « VOUS FAITES SEULS » : entraînement individuel pour
   automatiser, lancé une fois la notion comprise. Dose suffisante d'exercices.
5. "cloture" — Synthèse de ce qu'il faut retenir (avec les élèves) + réinvestissement
   bref ; si devoirs, ils réinvestissent ce qui a été maîtrisé en classe.

RÈGLES :
- Renseigne OBLIGATOIREMENT "phase" pour chaque activité (une des 5 valeurs ci-dessus).
- Respecte l'ordre des phases. La somme des durées ≤ durée de la séance.
- Garde un rythme soutenu : modelage concis, maximum de temps pour la pratique.`

export function buildSeanceUserPrompt(
  architecture: { titre_sequence: string; niveau: string; theme: string; objectifs: string[] },
  seance: { numero: number; titre: string; duree: number; objectifs: string[] },
  corpusBlock: string,
  mode: ModePedagogique = 'standard',
): string {
  const explicitBlock = mode === 'explicite' ? `\n${EXPLICIT_CANVAS_BLOCK}` : ''
  return `Génère les activités pour cette séance :
- Séquence : "${architecture.titre_sequence}"
- Niveau : ${architecture.niveau}
- Thème : ${architecture.theme}
- Séance n°${seance.numero} : "${seance.titre}"
- Durée : ${seance.duree} minutes
- Objectifs de la séance : ${seance.objectifs.join(', ')}
- Objectifs globaux de la séquence : ${architecture.objectifs.join(', ')}${corpusBlock}${explicitBlock}`
}
