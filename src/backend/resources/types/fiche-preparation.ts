import type { ResourceTypeDefinition } from '../registry'
import {
  FichePreparationContenuSchema,
  type FichePreparationContenu,
  type MomentDidactique,
} from '@/shared/resource-schemas'

/**
 * Type de ressource `fiche_preparation` — fiche de préparation de séance
 * (déroulé enseignant). Famille « schéma dédié », catégorie TEACHER_ONLY :
 * c'est le script du professeur, il n'a pas de version élève.
 *
 * Généré à partir du digest de la séance complète (ctx.seanceDigest) : activités
 * dans l'ordre avec leurs ids, contenu des ressources produites (le cours nourrit
 * la trace écrite), corpus, mode pédagogique. Le checksum de la séance est injecté
 * par postProcess (jamais par le LLM) pour la détection de dérive côté UI.
 * Déclenché par le bouton « Générer la fiche de préparation » d'une séance
 * (jamais suggéré au niveau activité → suggestedFor vide).
 * Voir doc/fiche-preparation.md.
 */
export const fichePreparationDefinition: ResourceTypeDefinition<FichePreparationContenu> = {
  type: 'fiche_preparation',
  label: 'Fiche de préparation',
  category: 'TEACHER_ONLY',
  schema: FichePreparationContenuSchema,

  buildPrompt: (ctx) => {
    const digest = ctx.seanceDigest ?? ''
    const consignes = ctx.consignes?.trim()
    const explicite = ctx.modePedagogique === 'explicite'

    const canevas = explicite
      ? `- La séance est en ENSEIGNEMENT EXPLICITE : chaque moment porte la "phase" de l'activité qu'il recouvre (ouverture → modelage → pratique_guidee → pratique_autonome → cloture). Le "role_enseignant" du modelage est un SCRIPT à voix haute (« je fais devant vous, voici comment je raisonne… »), avec un worked example. La pratique guidée insiste sur la vérification de la compréhension de tous.`
      : `- La séance est en mode standard : "phase" reste null pour tous les moments.`

    return [
      {
        role: 'system',
        content: `Tu es un professeur de français expérimenté et formateur en INSPE. Tu rédiges une FICHE DE PRÉPARATION DE SÉANCE, en JSON : le déroulé minuté côté enseignant, prêt à être utilisé en classe.

RÈGLES IMPÉRATIVES :
- Le déroulé COUVRE toute la séance : la somme des "duree_min" doit être égale à la durée annoncée de la séance (tolérance ±5 min).
- CHAQUE activité de la séance apparaît dans (au moins) un moment : recopie EXACTEMENT son id dans "activite_id" (les ids sont fournis dans le contexte). N'invente jamais d'id.
- Intercale les temps enseignant nécessaires (accueil et mise au travail, passation de consignes, correction collective, transitions, bilan de séance) avec "activite_id": null.
${canevas}
- "role_enseignant" : concret et actionnable — ce que le professeur DIT (formulations, questions à poser) et FAIT. Les généralités du type « l'enseignant accompagne les élèves » sont interdites.
- "trace_ecrite" : ce qu'on écrit réellement au tableau ou dans le cahier pendant ce moment. Appuie-toi sur le contenu des ressources produites (fournies dans le contexte) : la trace écrite reprend les notions du cours produit pour cette séance.
- "difficultes_anticipees" : difficultés PLAUSIBLES et spécifiques à la notion travaillée (pas génériques), chacune avec sa remédiation concrète.
- "transition" : comment on enchaîne concrètement vers le moment suivant (null pour le dernier moment).
- "place_dans_sequence" : situe la séance (ce que les élèves ont déjà vu, ce que cette séance prépare).
- "seance_checksum" : toujours null (injecté par le système).
- Rédige en français, calibré sur le niveau de la classe (cf. repères du programme dans le contexte).

${digest}`,
      },
      {
        role: 'user',
        content: `Génère la fiche de préparation "${ctx.ressourceTitre}" en respectant exactement le schéma JSON.${
          consignes
            ? `\n\nINSTRUCTIONS COMPLÉMENTAIRES DU PROFESSEUR (priment sur les règles générales) :\n"${consignes}"`
            : ''
        }`,
      },
    ]
  },

  // Le checksum de la séance est une donnée de référence : injecté par code,
  // jamais recopié par le LLM (même principe que le texte corpus d'extrait_oeuvre).
  postProcess: (full, ctx) => ({
    ...full,
    seance_checksum: ctx.seanceChecksum ?? null,
  }),

  toMarkdown: {
    professeur: (r) => renderFichePreparationMarkdown(r as FichePreparationContenu),
  },

  suggestedFor: [], // déclenché par le bouton séance, jamais suggéré au niveau activité
}

// ── Rendu Markdown ───────────────────────────────────────────────────────────────
// Sections par moment (pas de grand tableau) → robuste à l'impression / export PDF.
// Les bornes de temps cumulées (min 0–10, 10–25…) rendent tout écart de minutage
// immédiatement visible.

const PHASE_LABELS: Record<string, string> = {
  ouverture: 'Ouverture',
  modelage: 'Modelage — « Je fais »',
  pratique_guidee: 'Pratique guidée — « Nous faisons »',
  pratique_autonome: 'Pratique autonome — « Vous faites seuls »',
  cloture: 'Clôture',
}

const MODALITE_LABELS: Record<MomentDidactique['modalite'], string> = {
  collectif: 'Collectif',
  individuel: 'Individuel',
  binomes: 'En binômes',
  groupes: 'En groupes',
}

function renderMoment(m: MomentDidactique, debut: number): string {
  const lines: string[] = []
  const fin = debut + m.duree_min
  const phase = m.phase ? ` · _${PHASE_LABELS[m.phase] ?? m.phase}_` : ''

  lines.push(`## ⏱ min ${debut}–${fin} — ${m.intitule}`)
  lines.push('')
  lines.push(`*${MODALITE_LABELS[m.modalite]} · ${m.duree_min} min*${phase}`)
  lines.push('')
  lines.push(`**Rôle de l'enseignant :** ${m.role_enseignant}`)
  lines.push('')
  lines.push(`**Les élèves :** ${m.role_eleves}`)
  if (m.trace_ecrite) {
    lines.push('')
    lines.push(`> ✏️ **Trace écrite (tableau / cahier) :** ${m.trace_ecrite}`)
  }
  if (m.difficultes_anticipees?.length) {
    lines.push('')
    lines.push('**Difficultés anticipées :**')
    for (const d of m.difficultes_anticipees) {
      lines.push(`- ⚠️ ${d.difficulte}`)
      lines.push(`  → ${d.remediation}`)
    }
  }
  if (m.materiel?.length) {
    lines.push('')
    lines.push(`**Matériel :** ${m.materiel.join(', ')}`)
  }
  if (m.transition) {
    lines.push('')
    lines.push(`↪ *Transition : ${m.transition}*`)
  }
  return lines.join('\n')
}

export function renderFichePreparationMarkdown(r: FichePreparationContenu): string {
  const lines: string[] = []

  lines.push(`# ${r.titre}`)
  lines.push(`*— Fiche de préparation (document professeur) —*`)
  lines.push('')
  lines.push(`**Place dans la séquence :** ${r.place_dans_sequence}`)
  lines.push('')
  lines.push('**Objectifs de la séance :**')
  for (const o of r.objectifs) lines.push(`- ${o}`)
  if (r.prerequis?.length) {
    lines.push('')
    lines.push('**Prérequis à réactiver :**')
    for (const p of r.prerequis) lines.push(`- ${p}`)
  }
  if (r.materiel_global?.length) {
    lines.push('')
    lines.push(`**Matériel à préparer :** ${r.materiel_global.join(', ')}`)
  }
  lines.push('')
  lines.push('---')
  lines.push('')

  // Déroulé : bornes cumulées calculées à partir des durées
  let cursor = 0
  const moments = [...r.deroule].sort((a, b) => a.ordre - b.ordre)
  for (const m of moments) {
    lines.push(renderMoment(m, cursor))
    lines.push('')
    cursor += m.duree_min
  }
  lines.push(`*Durée totale du déroulé : ${cursor} min*`)

  if (r.differenciation) {
    lines.push('')
    lines.push('---')
    lines.push(`**Différenciation :** ${r.differenciation}`)
  }
  if (r.points_vigilance?.length) {
    lines.push('')
    lines.push('**Points de vigilance :**')
    for (const v of r.points_vigilance) lines.push(`- ${v}`)
  }
  if (r.prolongements) {
    lines.push('')
    lines.push(`**Prolongements / devoirs :** ${r.prolongements}`)
  }

  return lines.join('\n')
}
