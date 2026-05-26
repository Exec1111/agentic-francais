/**
 * Prompts de régénération ciblée d'une activité
 * Utilisé par la route /api/generate/activity
 * Rôle : remplacer une activité rejetée par l'enseignant en tenant compte du motif.
 */

export const SYSTEM_PROMPT =
  `Tu es l'Agent Générateur d'Activités pour des cours de français. Génère UNE SEULE activité pédagogique détaillée en JSON. Respecte scrupuleusement toutes les contraintes fournies.`

export function buildUserPrompt(
  seanceContext: {
    titre_sequence: string
    niveau: string
    theme: string
    objectifs_sequence: string[]
    seanceNumero: number
    seanceTitre: string
    seanceObjectifs: string[]
    seanceDuree: number
    autresActivites: { titre: string; type: string; duree: number }[]
  },
  activiteActuelle: {
    titre: string
    type: string
    duree: number
    consigne?: string
  },
  motif: string | undefined,
  corpusBlock: string,
): string {
  const autresActivitesText = seanceContext.autresActivites.length > 0
    ? seanceContext.autresActivites.map((a) => `- ${a.type} "${a.titre}" (${a.duree} min)`).join('\n')
    : 'Aucune autre activité.'

  return [
    `Génère UNE SEULE activité pédagogique pour remplacer celle qui a été rejetée.`,
    ``,
    `CONTEXTE :`,
    `- Séquence : "${seanceContext.titre_sequence}" (${seanceContext.niveau} — ${seanceContext.theme})`,
    `- Objectifs de la séquence : ${seanceContext.objectifs_sequence.join(', ')}`,
    `- Séance n°${seanceContext.seanceNumero} : "${seanceContext.seanceTitre}" (${seanceContext.seanceDuree} min)`,
    `- Objectifs de la séance : ${seanceContext.seanceObjectifs.join(', ')}`,
    `- Autres activités déjà présentes dans cette séance :`,
    autresActivitesText,
    ``,
    `ACTIVITÉ REJETÉE :`,
    `- Titre : "${activiteActuelle.titre}"`,
    `- Type : ${activiteActuelle.type}`,
    `- Durée : ${activiteActuelle.duree} min`,
    activiteActuelle.consigne ? `- Consigne : "${activiteActuelle.consigne}"` : '',
    motif
      ? `\nMOTIF DU REJET : "${motif}"`
      : '\n(Aucun motif fourni — propose une alternative plus riche et variée.)',
    ``,
    `CONTRAINTES :`,
    `1. ${motif ? 'Corrige le problème mentionné dans le motif.' : 'Propose une alternative substantiellement différente.'}`,
    `2. Ne duplique pas les autres activités déjà présentes dans la séance.`,
    `3. Garde une durée similaire (±5 min par rapport à ${activiteActuelle.duree} min).`,
    `4. Adapte la difficulté et le vocabulaire au niveau ${seanceContext.niveau}.`,
    corpusBlock
      ? `\n⚠️ TEXTES AU PROGRAMME — obligatoires pour lecture/exercice/production_ecrite :\n${corpusBlock}`
      : '',
  ].filter(Boolean).join('\n')
}
