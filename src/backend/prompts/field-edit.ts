/**
 * Prompts d'édition ciblée d'un champ texte d'une séquence.
 * Utilisé par la route /api/generate/field.
 * Rôle : réécrire UNIQUEMENT un champ (consigne d'une activité, objectifs d'une
 * séance) en tenant compte d'une instruction issue d'une suggestion du reviewer.
 * On ne régénère pas l'élément entier : on respecte le reste du contexte.
 */

export interface FieldEditContext {
  titre_sequence: string
  niveau: string
  theme: string
  seanceNumero: number
  seanceTitre: string
  seanceObjectifs: string[]
  /** Présent uniquement pour l'édition d'une consigne d'activité */
  activiteTitre?: string
  activiteType?: string
}

export const CONSIGNE_SYSTEM_PROMPT =
  `Tu es l'Agent Générateur d'Activités pour des cours de français. ` +
  `On te demande de réécrire UNIQUEMENT la consigne d'une activité existante, ` +
  `sans changer son titre ni son type. Réponds en JSON.`

export const OBJECTIFS_SYSTEM_PROMPT =
  `Tu es l'Agent Architecte Pédagogique pour des cours de français. ` +
  `On te demande de réécrire UNIQUEMENT les objectifs d'une séance existante, ` +
  `sans toucher au reste de la séquence. Réponds en JSON.`

export function buildConsigneUserPrompt(
  ctx: FieldEditContext,
  consigneActuelle: string,
  instruction: string,
): string {
  return [
    `Réécris la CONSIGNE de l'activité ci-dessous en appliquant l'instruction.`,
    ``,
    `CONTEXTE :`,
    `- Séquence : "${ctx.titre_sequence}" (${ctx.niveau} — ${ctx.theme})`,
    `- Séance n°${ctx.seanceNumero} : "${ctx.seanceTitre}"`,
    `- Objectifs de la séance : ${ctx.seanceObjectifs.join(', ') || '—'}`,
    `- Activité : "${ctx.activiteTitre ?? ''}"${ctx.activiteType ? ` (type : ${ctx.activiteType})` : ''}`,
    ``,
    `CONSIGNE ACTUELLE :`,
    `"${consigneActuelle}"`,
    ``,
    `INSTRUCTION À APPLIQUER :`,
    `"${instruction}"`,
    ``,
    `CONTRAINTES :`,
    `1. Ne produis QUE la nouvelle consigne, pas le reste de l'activité.`,
    `2. Reste adapté au niveau ${ctx.niveau}.`,
    `3. Conserve l'esprit de l'activité ; n'applique que l'amélioration demandée.`,
    ``,
    `FORMAT : {"consigne": "..."}`,
  ].join('\n')
}

export function buildObjectifsUserPrompt(
  ctx: FieldEditContext,
  objectifsActuels: string[],
  instruction: string,
): string {
  return [
    `Réécris les OBJECTIFS de la séance ci-dessous en appliquant l'instruction.`,
    ``,
    `CONTEXTE :`,
    `- Séquence : "${ctx.titre_sequence}" (${ctx.niveau} — ${ctx.theme})`,
    `- Séance n°${ctx.seanceNumero} : "${ctx.seanceTitre}"`,
    ``,
    `OBJECTIFS ACTUELS :`,
    objectifsActuels.length ? objectifsActuels.map((o) => `- ${o}`).join('\n') : '(aucun)',
    ``,
    `INSTRUCTION À APPLIQUER :`,
    `"${instruction}"`,
    ``,
    `CONTRAINTES :`,
    `1. Ne produis QUE la nouvelle liste d'objectifs (1 à 4 objectifs).`,
    `2. Formule chaque objectif de façon claire et évaluable, adapté au niveau ${ctx.niveau}.`,
    `3. Conserve les objectifs encore pertinents ; n'applique que l'amélioration demandée.`,
    ``,
    `FORMAT : {"objectifs": ["...", "..."]}`,
  ].join('\n')
}
