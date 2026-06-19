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
  }),

  buildPrompt: (ctx) => {
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

  return lines.join('\n')
}
