import type { ResourceTypeDefinition } from '../registry'
import { GrilleEvaluationContenuSchema, type GrilleEvaluationContenu } from '@/shared/resource-schemas'
import { buildContextePedagogique } from '../prompt-context'

/**
 * Type de ressource `grille_evaluation` — grille critériée (compétences × niveaux).
 * Famille « schéma dédié ». Les points/barème sont réservés au professeur.
 */
export const grilleEvaluationDefinition: ResourceTypeDefinition<GrilleEvaluationContenu> = {
  type: 'grille_evaluation',
  label: "Grille d'évaluation",
  category: 'TWO_VERSIONS',
  schema: GrilleEvaluationContenuSchema,

  toStudentVersion: (full) => ({
    objectif: full.objectif,
    competences: full.competences.map((c) => ({
      intitule: c.intitule,
      description: c.description,
      niveaux: c.niveaux.map((n) => ({
        label: n.label,
        description: n.description,
        points: null, // PROF ONLY
      })),
    })),
    total_points: null, // PROF ONLY
    bareme: null,       // PROF ONLY
    note_prof: null,    // PROF ONLY
    // Champs autoévaluation : destinés à l'élève (réponses incluses) → conservés.
    questions_autocontrole: full.questions_autocontrole ?? null,
    conseils_revision: full.conseils_revision ?? null,
  }),

  buildPrompt: (ctx) => {
    // Deux modes : usage activité classique (contexte activité) vs bundle évaluation
    // finale (digest séquence + alignement sur le sujet déjà généré + autoévaluation).
    if (ctx.evaluationFinale) {
      const digest = ctx.sequenceDigest ?? buildContextePedagogique(ctx)
      const sujet = ctx.sujetGenere ? JSON.stringify(ctx.sujetGenere, null, 2) : ''
      const consignes = ctx.consignes?.trim()
      return [
        {
          role: 'system',
          content: `Tu es un professeur de français agrégé. Tu conçois, pour l'ÉLÈVE, une GRILLE D'AUTOÉVALUATION de l'évaluation finale, en JSON.

RÈGLES :
- "objectif" : ce qui est évalué dans l'évaluation finale.
- "competences" : 3 à 8 critères, chacun avec une "description" et 2 à 4 "niveaux" (ex : "Maîtrisé", "En cours", "Non atteint") décrits précisément. Pour cette grille élève, mets "points" à null à chaque niveau.
- "total_points", "bareme", "note_prof" : null (le barème vit dans le sujet professeur).
- "questions_autocontrole" : 3 à 6 questions d'autocontrôle AVEC leur réponse. Elles doivent PORTER SUR LES QUESTIONS RÉELLEMENT POSÉES dans le sujet d'évaluation fourni ci-dessous, pour que l'élève vérifie qu'il maîtrise ce qui sera évalué.
- "conseils_revision" : conseils concrets de révision adressés à l'élève.

${digest}
${sujet ? `\nSUJET D'ÉVALUATION DÉJÀ GÉNÉRÉ (aligne l'autocontrôle dessus) :\n${sujet}` : ''}`,
        },
        {
          role: 'user',
          content: `Génère la grille d'autoévaluation "${ctx.ressourceTitre}" en respectant exactement le schéma JSON.${
            consignes ? `\n\nINSTRUCTIONS DU PROFESSEUR (prioritaires) :\n"${consignes}"` : ''
          }`,
        },
      ]
    }

    const contexte = buildContextePedagogique(ctx)
    return [
      {
        role: 'system',
        content: `Tu es un professeur de français agrégé. Tu conçois une GRILLE D'ÉVALUATION critériée, en JSON.

RÈGLES :
- "objectif" : ce qui est évalué (ex : "Rédiger un texte argumentatif").
- "competences" : 3 à 8 critères évalués (ex : "Respect de la consigne", "Cohérence", "Langue").
- Chaque compétence a une "description" et 2 à 4 "niveaux" (ex : "Maîtrisé", "En cours", "Non atteint") avec une "description" précise de ce qui correspond à chaque niveau.
- "points" : points attribués à chaque niveau (PROF ONLY — masqué pour l'élève).
- "total_points", "bareme" (conversion points → /20), "note_prof" : PROF ONLY.
- "questions_autocontrole" et "conseils_revision" : laisse-les à null (réservés à l'évaluation finale).
- Critères concrets, observables, adaptés au niveau et à la tâche.

${contexte}`,
      },
      {
        role: 'user',
        content: `Génère la grille d'évaluation "${ctx.ressourceTitre}" en respectant exactement le schéma JSON.`,
      },
    ]
  },

  toMarkdown: {
    professeur: (r) => renderGrilleMarkdown(r as GrilleEvaluationContenu, 'professeur'),
    eleve: (r) => renderGrilleMarkdown(r as GrilleEvaluationContenu, 'eleve'),
  },

  suggestedFor: ['production_ecrite', 'evaluation', 'oral'],
}

// ── Rendu Markdown ───────────────────────────────────────────────────────────────
// Rendu en SECTIONS (une par compétence) plutôt qu'un grand tableau unique :
// plus robuste à l'export PDF (cf. doc/resource-types.md, piège #5).

function renderGrilleMarkdown(r: GrilleEvaluationContenu, audience: 'professeur' | 'eleve'): string {
  const isPro = audience === 'professeur'
  const lines: string[] = []

  lines.push(`# Grille d'évaluation`)
  lines.push(`**Objectif :** ${r.objectif}`)
  if (isPro) lines.push(`*— Version professeur — avec barème —*`)
  lines.push('')

  r.competences.forEach((c, i) => {
    lines.push(`## ${i + 1}. ${c.intitule}`)
    lines.push('')
    if (c.description) {
      lines.push(`*${c.description}*`)
      lines.push('')
    }
    // Tableau des niveaux (petit : 2 à 4 lignes)
    if (isPro) {
      lines.push('| Niveau | Description | Points |')
      lines.push('|--------|-------------|--------|')
      for (const n of c.niveaux) {
        lines.push(`| ${n.label} | ${n.description} | ${n.points ?? ''} |`)
      }
    } else {
      lines.push('| Niveau | Description | Acquis ? |')
      lines.push('|--------|-------------|----------|')
      for (const n of c.niveaux) {
        lines.push(`| ${n.label} | ${n.description} |   |`)
      }
    }
    lines.push('')
  })

  if (isPro) {
    if (r.total_points != null) {
      lines.push('---')
      lines.push(`**Total : ${r.total_points} points**`)
      lines.push('')
    }
    if (r.bareme) {
      lines.push(`> 📊 **Barème :** ${r.bareme}`)
      lines.push('')
    }
    if (r.note_prof) {
      lines.push(`> 📝 **Note pédagogique :** ${r.note_prof}`)
    }
  }

  // Section autoévaluation (contexte évaluation finale) — affichée si présente.
  if (r.questions_autocontrole && r.questions_autocontrole.length > 0) {
    lines.push('')
    lines.push('---')
    lines.push('## ✅ Auto-évaluation — vérifie que tu maîtrises')
    lines.push('')
    r.questions_autocontrole.forEach((q, i) => {
      lines.push(`**${i + 1}. ${q.question}**`)
      lines.push('')
      lines.push(`> 💡 ${q.reponse}`)
      lines.push('')
    })
  }
  if (r.conseils_revision) {
    lines.push('---')
    lines.push(`> 📚 **Conseils de révision :** ${r.conseils_revision}`)
  }

  return lines.join('\n')
}
