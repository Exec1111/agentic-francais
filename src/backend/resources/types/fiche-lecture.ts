import type { ResourceTypeDefinition } from '../registry'
import { FicheLectureContenuSchema, type FicheLectureContenu } from '@/shared/resource-schemas'
import { buildContextePedagogique } from '../prompt-context'

/**
 * Type de ressource `fiche_lecture` — fiche de lecture d'une œuvre (résumé,
 * personnages, thèmes, questions). Famille « schéma dédié ».
 */
export const ficheLectureDefinition: ResourceTypeDefinition<FicheLectureContenu> = {
  type: 'fiche_lecture',
  label: 'Fiche de lecture',
  category: 'TWO_VERSIONS',
  schema: FicheLectureContenuSchema,

  toStudentVersion: (full) => ({
    oeuvre: full.oeuvre,
    auteur: full.auteur,
    sections: full.sections.map((s) => ({
      titre: s.titre,
      questions: s.questions.map((q) => ({
        enonce: q.enonce,
        espace_reponse: q.espace_reponse,
        reponse_attendue: null, // PROF ONLY
      })),
    })),
    note_prof: null, // PROF ONLY
  }),

  buildPrompt: (ctx) => {
    const contexte = buildContextePedagogique(ctx)
    const oeuvre = ctx.corpusItem ? `"${ctx.corpusItem.oeuvre}" de ${ctx.corpusItem.auteur}` : ctx.ressourceTitre
    return [
      {
        role: 'system',
        content: `Tu es un professeur de français agrégé. Tu conçois une FICHE DE LECTURE structurée, en JSON.

RÈGLES :
- "oeuvre" et "auteur" : l'œuvre étudiée.
- "sections" : 3 à 6 rubriques pertinentes (ex : "Résumé", "Les personnages", "Les thèmes", "La structure", "Le style", "Mise en réseau").
- Chaque section contient des "questions" guidant la lecture.
- "enonce" : la question, sans la réponse.
- "espace_reponse" : nombre de lignes à laisser à l'élève pour répondre (3 à 8), ou null.
- "reponse_attendue" : éléments de réponse pour le professeur (PROF ONLY).
- "note_prof" : axes d'interprétation, pistes de discussion (PROF ONLY).
- La difficulté progresse : compréhension → analyse → interprétation.

${contexte}`,
      },
      {
        role: 'user',
        content: `Génère la fiche de lecture "${ctx.ressourceTitre}" portant sur ${oeuvre} en respectant exactement le schéma JSON.`,
      },
    ]
  },

  toMarkdown: {
    professeur: (r) => renderFicheLectureMarkdown(r as FicheLectureContenu, 'professeur'),
    eleve: (r) => renderFicheLectureMarkdown(r as FicheLectureContenu, 'eleve'),
  },

  suggestedFor: ['lecture', 'recherche'],
}

// ── Rendu Markdown ───────────────────────────────────────────────────────────────

function renderFicheLectureMarkdown(r: FicheLectureContenu, audience: 'professeur' | 'eleve'): string {
  const isPro = audience === 'professeur'
  const lines: string[] = []

  lines.push(`# Fiche de lecture — ${r.oeuvre}`)
  lines.push(`*${r.auteur}*`)
  if (isPro) lines.push(`*— Version professeur — avec corrigé —*`)
  lines.push('')

  let qNum = 1
  for (const section of r.sections) {
    lines.push(`## ${section.titre}`)
    lines.push('')
    for (const q of section.questions) {
      lines.push(`**${qNum}.** ${q.enonce}`)
      lines.push('')
      if (isPro && q.reponse_attendue) {
        lines.push(`> ✅ **Réponse attendue :** ${q.reponse_attendue}`)
        lines.push('')
      } else {
        const n = q.espace_reponse ?? 3
        for (let i = 0; i < n; i++) lines.push('_'.repeat(70))
        lines.push('')
      }
      qNum++
    }
  }

  if (isPro && r.note_prof) {
    lines.push('---')
    lines.push('')
    lines.push(`> 📝 **Note pédagogique :** ${r.note_prof}`)
  }

  return lines.join('\n')
}
