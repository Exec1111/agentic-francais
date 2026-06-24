import type { ResourceTypeDefinition } from '../registry'
import {
  EvaluationSommativeContenuSchema,
  type EvaluationSommativeContenu,
} from '@/shared/resource-schemas'

/**
 * Type de ressource `evaluation_sommative` — sujet d'évaluation finale.
 * Famille « schéma dédié ». Catégorie TWO_VERSIONS :
 *   - version élève : énoncés + lignes de réponse, sans barème ni corrigé ;
 *   - version prof  : mêmes énoncés + barème par question + corrigé intégré.
 *
 * Généré à partir du digest de la séquence complète (ctx.sequenceDigest) : le sujet
 * ne doit évaluer que ce qui a été enseigné, et couvrir les compétences annoncées.
 * Déclenché par le bouton « Générer l'évaluation finale » (jamais suggéré au niveau
 * activité → suggestedFor vide).
 */
export const evaluationSommativeDefinition: ResourceTypeDefinition<EvaluationSommativeContenu> = {
  type: 'evaluation_sommative',
  label: "Sujet d'évaluation",
  category: 'TWO_VERSIONS',
  schema: EvaluationSommativeContenuSchema,

  toStudentVersion: (full) => ({
    titre: full.titre,
    consignes_generales: full.consignes_generales,
    support_texte: full.support_texte,
    questions: full.questions.map((q) => ({
      numero: q.numero,
      enonce: q.enonce,
      competence_evaluee: q.competence_evaluee, // visible : l'élève sait ce qui est évalué
      bareme_points: null, // PROF ONLY
      corrige: null,       // PROF ONLY
    })),
    total_points: null, // PROF ONLY
    bareme: null,       // PROF ONLY
    note_prof: null,    // PROF ONLY
  }),

  buildPrompt: (ctx) => {
    const digest = ctx.sequenceDigest ?? ''
    const consignes = ctx.consignes?.trim()
    return [
      {
        role: 'system',
        content: `Tu es un professeur de français agrégé. Tu conçois un SUJET D'ÉVALUATION SOMMATIVE de fin de séquence, en JSON.

RÈGLES IMPÉRATIVES :
- Le sujet n'évalue QUE ce qui a été enseigné dans la séquence ci-dessous. Ne porte sur aucune notion non travaillée.
- APPUIE-TOI SUR LES RESSOURCES PRODUITES EN CLASSE (fournies sous chaque activité) : puise les notions évaluées dans les COURS produits, et reprends le FORMAT, le type de consigne et le niveau de difficulté des EXERCICES (fiches de questions) réellement travaillés. Les élèves doivent reconnaître des exercices proches de ceux faits en classe.
- COUVERTURE : chaque compétence annoncée de la séquence doit être évaluée par au moins une question (champ "competence_evaluee"). Si une compétence ne peut pas être évaluée à l'écrit (ex. oral), explique-le dans "note_prof" au lieu d'inventer une question artificielle.
- "support_texte" : si un texte du corpus de la séquence se prête à l'analyse, fonde le sujet dessus et recopie le passage utile dans ce champ ; sinon, propose un texte court inédit adapté au niveau, ou laisse null si le sujet n'a pas besoin de support.
- Champs PROF ONLY (masqués pour l'élève) : "bareme_points" par question, "corrige" par question, "total_points", "bareme" (conversion → /20), "note_prof". Renseigne-les TOUS.
- "corrige" : réponse attendue ou éléments précis de correction, pour chaque question.
- Difficulté calibrée sur le niveau (cf. repères du programme dans le contexte).

${digest}`,
      },
      {
        role: 'user',
        content: `Génère le sujet d'évaluation "${ctx.ressourceTitre}" en respectant exactement le schéma JSON.${
          consignes
            ? `\n\nINSTRUCTIONS COMPLÉMENTAIRES DU PROFESSEUR (priment sur les règles générales) :\n"${consignes}"`
            : ''
        }`,
      },
    ]
  },

  toMarkdown: {
    professeur: (r) => renderEvalMarkdown(r as EvaluationSommativeContenu, 'professeur'),
    eleve: (r) => renderEvalMarkdown(r as EvaluationSommativeContenu, 'eleve'),
  },

  suggestedFor: [], // déclenché par le bouton séquence, jamais suggéré au niveau activité
}

// ── Rendu Markdown ───────────────────────────────────────────────────────────────
// Rendu en sections (pas un grand tableau) → robuste à l'export PDF.

function renderEvalMarkdown(
  r: EvaluationSommativeContenu,
  audience: 'professeur' | 'eleve'
): string {
  const isPro = audience === 'professeur'
  const lines: string[] = []

  lines.push(`# ${r.titre}`)
  if (isPro) lines.push(`*— Version professeur — barème et corrigé intégrés —*`)
  lines.push('')
  lines.push(`**Consignes :** ${r.consignes_generales}`)
  lines.push('')

  if (r.support_texte) {
    lines.push('## Texte support')
    lines.push('')
    lines.push(r.support_texte)
    lines.push('')
  }

  lines.push('## Questions')
  lines.push('')
  for (const q of r.questions) {
    const points = isPro && q.bareme_points != null ? ` *( ${q.bareme_points} pts )*` : ''
    lines.push(`**${q.numero}.** ${q.enonce}${points}`)
    if (q.competence_evaluee) {
      lines.push(`   _Compétence évaluée : ${q.competence_evaluee}_`)
    }
    if (isPro && q.corrige) {
      lines.push('')
      lines.push(`   > 🟢 **Corrigé :** ${q.corrige}`)
    } else if (!isPro) {
      // Lignes de réponse pour l'élève
      lines.push('')
      lines.push('   ......................................................................')
      lines.push('   ......................................................................')
    }
    lines.push('')
  }

  if (isPro) {
    lines.push('---')
    if (r.total_points != null) lines.push(`**Total : ${r.total_points} points**`)
    if (r.bareme) lines.push(`> 📊 **Barème :** ${r.bareme}`)
    if (r.note_prof) lines.push(`> 📝 **Note de passation :** ${r.note_prof}`)
  }

  return lines.join('\n')
}
