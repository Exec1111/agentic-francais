import type { ResourceTypeDefinition } from '../registry'
import {
  ExtraitOeuvreContenuSchema,
  type ExtraitOeuvreContenu,
} from '@/shared/resource-schemas'
import { buildContextePedagogique } from '../prompt-context'
import { numberTextLines, buildTexteProtegePlaceholder } from '../text-utils'

export const extraitOeuvreDefinition: ResourceTypeDefinition<ExtraitOeuvreContenu> = {
  type: 'extrait_oeuvre',
  label: "Extrait d'œuvre",
  category: 'TWO_VERSIONS',
  schema: ExtraitOeuvreContenuSchema,

  // ── Dérivation version élève ───────────────────────────────────────────────
  // Retire : reponse_attendue, elements_analyse (par question) + note_prof (global)

  toStudentVersion: (full) => ({
    auteur: full.auteur,
    oeuvre: full.oeuvre,
    edition_reference: full.edition_reference,
    pages: full.pages,
    introduction: full.introduction,
    texte: full.texte,
    notes_bas_de_page: full.notes_bas_de_page,
    questions: full.questions.map((q) => ({
      enonce: q.enonce,
      reponse_attendue: null,  // PROF ONLY — retiré
      elements_analyse: null, // PROF ONLY — retiré
    })),
    note_prof: null, // PROF ONLY — retiré
  }),

  // ── Prompt de génération ───────────────────────────────────────────────────
  // Le LLM produit UNIQUEMENT l'appareil pédagogique (introduction, lexique,
  // questions). Le texte officiel et les métadonnées bibliographiques sont
  // injectés par code dans postProcess() — fidélité garantie.

  buildPrompt: (ctx) => {
    if (!ctx.corpusItem) {
      throw new Error(
        "extrait_oeuvre nécessite un texte corpus. Associez un texte au programme avant de générer cette ressource."
      )
    }

    const hasContent = ctx.corpusItem.contenu !== ''
    const contexte = buildContextePedagogique(ctx)

    if (hasContent) {
      // ── Mode normal : texte disponible → le LLM analyse, le code insère ─────
      return [
        {
          role: 'system',
          content: `Tu es un professeur de français agrégé spécialiste de la littérature.
Tu produis l'appareil pédagogique (introduction, lexique, questions) autour d'un texte littéraire officiel, en JSON structuré.

TEXTE SOURCE OFFICIEL (fourni pour ton analyse — il sera inséré automatiquement par le système dans le document final) :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auteur     : ${ctx.corpusItem.auteur}
Œuvre      : ${ctx.corpusItem.oeuvre}
Référence  : ${ctx.corpusItem.edition_reference}${ctx.corpusItem.pages ? ` — ${ctx.corpusItem.pages}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ctx.corpusItem.contenu}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RÈGLES ABSOLUES :
1. Le champ "texte" doit contenir une chaîne vide "" — NE recopie PAS le texte : le système l'insère automatiquement, à l'identique, avec la numérotation des lignes.
2. Les champs "auteur", "oeuvre", "edition_reference", "pages" : recopie exactement les métadonnées ci-dessus (elles seront de toute façon vérifiées par le système).
3. Toute citation dans les questions, réponses ou analyses doit être extraite MOT POUR MOT du texte ci-dessus, entre guillemets.
4. Les questions (champ "enonce") ne contiennent PAS les réponses.
   → Les réponses vont dans "reponse_attendue" (pour le professeur), justifiées par des citations exactes.
   → "elements_analyse" : figures de style, procédés narratifs, champs lexicaux précis relevés dans le texte.
5. "introduction" : 2-3 phrases de mise en contexte (auteur, œuvre, contexte historique/littéraire, enjeux de cet extrait).
6. "notes_bas_de_page" : 4-8 termes difficiles présents dans le texte, avec définition courte adaptée au niveau.
7. La difficulté des questions doit progresser : compréhension → analyse → interprétation.

${contexte}`,
        },
        {
          role: 'user',
          content: `Génère l'appareil pédagogique "${ctx.ressourceTitre}" pour le texte de ${ctx.corpusItem.auteur} en respectant exactement le schéma JSON (champ "texte" = chaîne vide).`,
        },
      ]
    }

    // ── Mode protégé : contenu non disponible → fiche sans texte ──────────────
    return [
      {
        role: 'system',
        content: `Tu es un professeur de français agrégé spécialiste de la littérature.
Tu prépares une fiche de lecture pédagogique pour une œuvre protégée par droits d'auteur.
Le texte intégral ne peut pas être reproduit ici — l'enseignant le distribuera séparément.

RÉFÉRENCE BIBLIOGRAPHIQUE :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auteur     : ${ctx.corpusItem.auteur}
Œuvre      : ${ctx.corpusItem.oeuvre}
Référence  : ${ctx.corpusItem.edition_reference}${ctx.corpusItem.pages ? ` — pages ${ctx.corpusItem.pages}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RÈGLES ABSOLUES :
1. Le champ "texte" doit contenir une chaîne vide "" — ne pas inventer de texte : le système insérera automatiquement un encart « Texte à insérer par l'enseignant ».
2. "introduction" : 2-3 phrases de contextualisation (auteur, œuvre, enjeux du passage).
3. Les questions ("enonce") doivent être formulées sans citer le texte mot pour mot.
   Pose des questions d'analyse, de compréhension, de style adaptées au thème et au niveau.
4. "reponse_attendue" et "elements_analyse" : réponses complètes pour le professeur.
5. "note_prof" : rappelle que l'enseignant doit fournir le texte séparément.
6. "notes_bas_de_page" peut rester vide (tableau vide []).

${contexte}`,
      },
      {
        role: 'user',
        content: `Génère la fiche de lecture "${ctx.ressourceTitre}" pour l'œuvre protégée de ${ctx.corpusItem.auteur} en respectant exactement le schéma JSON (champ "texte" = chaîne vide, le système insérera le placeholder).`,
      },
    ]
  },

  // ── Post-traitement : injection par code du texte et des métadonnées ────────
  // Garantie de fidélité absolue : ni le texte ni la référence bibliographique
  // ne dépendent de ce que le LLM a recopié.

  postProcess: (full, ctx) => {
    if (!ctx.corpusItem) return full

    const texte = ctx.corpusItem.contenu
      ? numberTextLines(ctx.corpusItem.contenu)
      : buildTexteProtegePlaceholder(ctx.corpusItem)

    return {
      ...full,
      auteur: ctx.corpusItem.auteur,
      oeuvre: ctx.corpusItem.oeuvre,
      edition_reference: ctx.corpusItem.edition_reference,
      pages: ctx.corpusItem.pages ?? null,
      texte,
    }
  },

  // ── Renderers Markdown ─────────────────────────────────────────────────────

  toMarkdown: {
    professeur: (r) => renderExtraitMarkdown(r as ExtraitOeuvreContenu, 'professeur'),
    eleve: (r) => renderExtraitMarkdown(r as ExtraitOeuvreContenu, 'eleve'),
  },

  suggestedFor: ['lecture', 'debat'],
}

// ── Rendu Markdown ─────────────────────────────────────────────────────────────

function renderExtraitMarkdown(r: ExtraitOeuvreContenu, audience: 'professeur' | 'eleve'): string {
  const isPro = audience === 'professeur'
  const lines: string[] = []

  // En-tête
  lines.push(`# ${r.oeuvre}`)
  lines.push(`*${r.auteur}*`)
  if (isPro) lines.push(`*— Version professeur — avec corrigé —*`)
  lines.push('')

  // Introduction contextuelle (italique)
  lines.push(`*${r.introduction}*`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // Texte (dans un bloc de citation pour le distinguer visuellement)
  const textLines = r.texte.split('\n')
  for (const line of textLines) {
    lines.push(line.trim() ? `> ${line}` : '>')
  }
  lines.push('')

  // Référence bibliographique
  const ref = [
    r.auteur,
    `*${r.oeuvre}*`,
    r.pages ?? null,
    r.edition_reference,
  ].filter(Boolean).join(', ')
  lines.push(`*${ref}*`)
  lines.push('')

  // Lexique (si présent)
  if (r.notes_bas_de_page && r.notes_bas_de_page.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## Lexique')
    lines.push('')
    for (const note of r.notes_bas_de_page) {
      lines.push(`- **${note.mot}** : ${note.definition}`)
    }
    lines.push('')
  }

  // Questions
  lines.push('---')
  lines.push('')
  lines.push('## Questions de lecture')
  lines.push('')

  r.questions.forEach((q, i) => {
    lines.push(`**${i + 1}.** ${q.enonce}`)
    lines.push('')

    if (isPro) {
      if (q.reponse_attendue) {
        lines.push(`> ✅ **Réponse attendue :** ${q.reponse_attendue}`)
      }
      if (q.elements_analyse) {
        lines.push(`> 📚 **Analyse :** ${q.elements_analyse}`)
      }
      lines.push('')
    } else {
      // Version élève : lignes vides pour écrire la réponse
      lines.push('_'.repeat(70))
      lines.push('')
      lines.push('_'.repeat(70))
      lines.push('')
    }
  })

  // Note pédagogique prof
  if (isPro && r.note_prof) {
    lines.push('---')
    lines.push('')
    lines.push(`> 📝 **Note pédagogique :** ${r.note_prof}`)
  }

  return lines.join('\n')
}
