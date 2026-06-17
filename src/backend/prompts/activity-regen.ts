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
  activiteActuelle:
    | {
        titre: string
        type: string
        duree: number
        consigne?: string
      }
    | undefined,
  motif: string | undefined,
  corpusBlock: string,
  // 'remplacer' (défaut, rétrocompatible) : régénère une activité rejetée.
  // 'ajouter' : crée une nouvelle activité complémentaire dans la séance.
  mode: 'remplacer' | 'ajouter' = 'remplacer',
): string {
  const autresActivitesText = seanceContext.autresActivites.length > 0
    ? seanceContext.autresActivites.map((a) => `- ${a.type} "${a.titre}" (${a.duree} min)`).join('\n')
    : 'Aucune autre activité.'

  const contexteCommun = [
    `CONTEXTE :`,
    `- Séquence : "${seanceContext.titre_sequence}" (${seanceContext.niveau} — ${seanceContext.theme})`,
    `- Objectifs de la séquence : ${seanceContext.objectifs_sequence.join(', ')}`,
    `- Séance n°${seanceContext.seanceNumero} : "${seanceContext.seanceTitre}" (${seanceContext.seanceDuree} min)`,
    `- Objectifs de la séance : ${seanceContext.seanceObjectifs.join(', ')}`,
    `- Autres activités déjà présentes dans cette séance :`,
    autresActivitesText,
  ]

  const corpusLine = corpusBlock
    ? `\n⚠️ TEXTES AU PROGRAMME — obligatoires pour lecture/exercice/production_ecrite :\n${corpusBlock}`
    : ''

  if (mode === 'ajouter') {
    return [
      `Génère UNE SEULE NOUVELLE activité pédagogique à AJOUTER à cette séance.`,
      ``,
      ...contexteCommun,
      motif
        ? `\nCE QU'IL FAUT AJOUTER : "${motif}"`
        : '\n(Aucune précision fournie — propose une activité complémentaire pertinente.)',
      ``,
      `CONTRAINTES :`,
      `1. L'activité doit compléter la séance sans dupliquer les activités déjà présentes.`,
      `2. Choisis une durée cohérente avec la séance (${seanceContext.seanceDuree} min au total).`,
      `3. Adapte la difficulté et le vocabulaire au niveau ${seanceContext.niveau}.`,
      corpusLine,
    ].filter(Boolean).join('\n')
  }

  return [
    `Génère UNE SEULE activité pédagogique pour remplacer celle qui a été rejetée.`,
    ``,
    ...contexteCommun,
    ``,
    `ACTIVITÉ REJETÉE :`,
    `- Titre : "${activiteActuelle?.titre ?? ''}"`,
    `- Type : ${activiteActuelle?.type ?? ''}`,
    `- Durée : ${activiteActuelle?.duree ?? seanceContext.seanceDuree} min`,
    activiteActuelle?.consigne ? `- Consigne : "${activiteActuelle.consigne}"` : '',
    motif
      ? `\nMOTIF DU REJET : "${motif}"`
      : '\n(Aucun motif fourni — propose une alternative plus riche et variée.)',
    ``,
    `CONTRAINTES :`,
    `1. ${motif ? 'Corrige le problème mentionné dans le motif.' : 'Propose une alternative substantiellement différente.'}`,
    `2. Ne duplique pas les autres activités déjà présentes dans la séance.`,
    `3. Garde une durée similaire (±5 min par rapport à ${activiteActuelle?.duree ?? seanceContext.seanceDuree} min).`,
    `4. Adapte la difficulté et le vocabulaire au niveau ${seanceContext.niveau}.`,
    corpusLine,
  ].filter(Boolean).join('\n')
}
