import type { ResourceTypeDefinition } from '../registry'
import { CarteMentaleContenuSchema, type CarteMentaleContenu } from '@/shared/resource-schemas'
import { buildContextePedagogique } from '../prompt-context'

/**
 * Type de ressource `carte_mentale` — carte mentale (thème central + branches +
 * sous-branches). Famille « schéma dédié ». La version élève masque les nœuds
 * marqués `a_completer` (à remplir par l'élève).
 *
 * Rendu : liste hiérarchique en Markdown (un vrai graphe n'est pas exportable en
 * PDF de façon fiable ; la liste indentée reste lisible et imprimable).
 */
export const carteMentaleDefinition: ResourceTypeDefinition<CarteMentaleContenu> = {
  type: 'carte_mentale',
  label: 'Carte mentale',
  category: 'TWO_VERSIONS',
  schema: CarteMentaleContenuSchema,

  toStudentVersion: (full) => ({
    theme_central: full.theme_central,
    objectif: full.objectif,
    branches: full.branches.map((b) => ({
      label: b.label,
      sous_branches: b.sous_branches.map((n) =>
        n.a_completer
          ? { label: '', detail: null, a_completer: true } // masqué : à compléter
          : { label: n.label, detail: n.detail, a_completer: false }
      ),
    })),
    note_prof: null, // PROF ONLY
  }),

  buildPrompt: (ctx) => {
    const contexte = buildContextePedagogique(ctx)
    return [
      {
        role: 'system',
        content: `Tu es un professeur de français agrégé. Tu conçois une CARTE MENTALE de synthèse, en JSON.

RÈGLES :
- "theme_central" : la notion au cœur de la carte.
- "objectif" : ce que la carte aide à mémoriser/synthétiser.
- "branches" : 3 à 8 grandes idées rattachées au thème central.
- Chaque branche a des "sous_branches" (détails, exemples, mots-clés).
- "a_completer" : mets true sur certains nœuds (≈ un tiers) pour qu'ils apparaissent VIDES dans la version élève (exercice de complétion). Mets false sur les nœuds qui servent d'amorce/indice.
- "detail" : précision optionnelle (ou null).
- "note_prof" : comment exploiter la carte en classe (PROF ONLY).

${contexte}`,
      },
      {
        role: 'user',
        content: `Génère la carte mentale "${ctx.ressourceTitre}" en respectant exactement le schéma JSON.`,
      },
    ]
  },

  toMarkdown: {
    professeur: (r) => renderCarteMarkdown(r as CarteMentaleContenu, 'professeur'),
    eleve: (r) => renderCarteMarkdown(r as CarteMentaleContenu, 'eleve'),
  },

  suggestedFor: ['recherche', 'collaboration'],
}

// ── Rendu Markdown ───────────────────────────────────────────────────────────────

function renderCarteMarkdown(r: CarteMentaleContenu, audience: 'professeur' | 'eleve'): string {
  const isPro = audience === 'professeur'
  const lines: string[] = []

  lines.push(`# 🧠 ${r.theme_central}`)
  lines.push(`*Objectif : ${r.objectif}*`)
  if (isPro) lines.push(`*— Version professeur — carte complète —*`)
  lines.push('')

  for (const branche of r.branches) {
    lines.push(`## ${branche.label}`)
    lines.push('')
    for (const n of branche.sous_branches) {
      const blanked = !n.label || !n.label.trim()
      if (blanked) {
        lines.push(`- ________________________`)
      } else {
        const detail = n.detail ? ` — ${n.detail}` : ''
        const mark = isPro && n.a_completer ? ' ✏️' : ''
        lines.push(`- ${n.label}${detail}${mark}`)
      }
    }
    lines.push('')
  }

  if (isPro && r.note_prof) {
    lines.push('---')
    lines.push(`> 📝 **Note pédagogique :** ${r.note_prof}`)
  }

  return lines.join('\n')
}
