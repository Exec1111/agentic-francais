import type { ResourceTypeDefinition } from '../registry'
import {
  FicheQuestionsContenuSchema,
  type FicheQuestionsContenu,
  type Bloc,
  stripBlocProf,
  sanitizeFicheBlocs,
} from '@/shared/resource-blocks'
import { buildMessages } from '@/backend/prompts/fiche-questions'

/**
 * Type de ressource `fiche_questions` — fiche d'exercices structurée en BLOCS.
 *
 * Le contenu est une liste de blocs hétérogènes (consigne, QCM, texte à trous,
 * question ouverte, encadré). Voir doc/fiche-questions-blocs.md.
 *
 * Le `contenu_json` (blocs) est la source de vérité pour le rendu riche côté
 * frontend ET pour l'édition. Le `contenu_markdown` produit ici sert de
 * solution de repli (impression PDF, compatibilité).
 */
export const ficheQuestionsDefinition: ResourceTypeDefinition<FicheQuestionsContenu> = {
  type: 'fiche_questions',
  label: 'Fiche questions',
  category: 'TWO_VERSIONS',
  schema: FicheQuestionsContenuSchema,

  // ── Dérivation version élève : retire les champs PROF de chaque bloc ───────
  toStudentVersion: (full) => ({
    objectif: full.objectif,
    introduction: full.introduction,
    duree_estimee: full.duree_estimee,
    blocs: full.blocs.map(stripBlocProf),
  }),

  // ── Prompt de génération (prompts séparés dans src/backend/prompts/fiche-questions.ts) ──
  buildPrompt: (ctx) => {
    let corpusBlock = ''
    if (ctx.corpusItem) {
      if (ctx.corpusItem.contenu) {
        corpusBlock = `\nTEXTE SOURCE OFFICIEL — les exercices doivent s'appuyer EXCLUSIVEMENT sur ce texte :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auteur     : ${ctx.corpusItem.auteur}
Œuvre      : ${ctx.corpusItem.oeuvre}
Référence  : ${ctx.corpusItem.edition_reference}${ctx.corpusItem.pages ? ` — ${ctx.corpusItem.pages}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ctx.corpusItem.contenu}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Toute citation dans les exercices doit être extraite MOT POUR MOT de ce texte.`
      } else {
        corpusBlock = `\nRÉFÉRENCE BIBLIOGRAPHIQUE (texte protégé — non reproduit ici) :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auteur     : ${ctx.corpusItem.auteur}
Œuvre      : ${ctx.corpusItem.oeuvre}
Référence  : ${ctx.corpusItem.edition_reference}${ctx.corpusItem.pages ? ` — pages ${ctx.corpusItem.pages}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Le texte intégral n'est pas disponible (droits d'auteur). Les élèves auront le texte en main.
   Formule les exercices EN RÉFÉRENCE à cette œuvre sans citer d'extraits mot pour mot.`
      }
    }
    return buildMessages(ctx, corpusBlock)
  },

  // ── Post-traitement : nettoie les blocs malformés par le LLM ───────────────
  postProcess: (full) => sanitizeFicheBlocs(full),

  // ── Renderers Markdown (fallback impression / compat) ──────────────────────
  toMarkdown: {
    professeur: (r) => renderFicheMarkdown(r as FicheQuestionsContenu, 'professeur'),
    eleve: (r) => renderFicheMarkdown(r as FicheQuestionsContenu, 'eleve'),
  },

  suggestedFor: ['exercice', 'evaluation'],
}

// ── Rendu Markdown ───────────────────────────────────────────────────────────────

const DIFFICULTE_EMOJI: Record<string, string> = {
  facile: '🟢',
  moyen: '🟡',
  difficile: '🔴',
}

const ENCADRE_EMOJI: Record<string, string> = {
  rappel: '💡',
  astuce: '✨',
  attention: '⚠️',
  exemple: '📝',
}

function renderFicheMarkdown(r: FicheQuestionsContenu, audience: 'professeur' | 'eleve'): string {
  const isPro = audience === 'professeur'
  const lines: string[] = []

  lines.push(`# ${r.objectif}`)
  if (isPro) lines.push(`*— Version professeur — avec corrigé —*`)
  lines.push('')

  if (r.introduction) {
    lines.push(`> ${r.introduction}`)
    lines.push('')
  }

  let qNum = 1
  for (const bloc of r.blocs) {
    lines.push(...renderBlocMarkdown(bloc, isPro, qNum))
    if (['qcm', 'texte_a_trous', 'question_ouverte'].includes(bloc.type)) qNum++
    lines.push('')
  }

  if (r.duree_estimee) {
    lines.push('---')
    lines.push(`*Durée estimée : ${r.duree_estimee} min*`)
  }

  return lines.join('\n')
}

function renderBlocMarkdown(bloc: Bloc, isPro: boolean, qNum: number): string[] {
  const lines: string[] = []
  const diff = bloc.difficulte ? `${DIFFICULTE_EMOJI[bloc.difficulte]} ` : ''

  switch (bloc.type) {
    case 'consigne':
      lines.push(`**Consigne :** ${bloc.texte ?? ''}`)
      break

    case 'encadre': {
      const emoji = ENCADRE_EMOJI[bloc.encadre_variante ?? 'rappel'] ?? '💡'
      lines.push(`> ${emoji} **${bloc.encadre_titre ?? 'Rappel'}**`)
      lines.push(`> ${bloc.texte ?? ''}`)
      break
    }

    case 'qcm': {
      lines.push(`**${qNum}.** ${diff}${bloc.question ?? ''}`)
      lines.push('')
      const props = bloc.propositions ?? []
      const good = new Set(bloc.bonnes_reponses ?? [])
      props.forEach((p, i) => {
        const letter = String.fromCharCode(65 + i)
        const mark = isPro && good.has(i) ? ' ✅' : ''
        lines.push(`- [ ] **${letter}.** ${p}${mark}`)
      })
      if (isPro && bloc.explication) {
        lines.push('')
        lines.push(`> 📌 *${bloc.explication}*`)
      }
      break
    }

    case 'texte_a_trous': {
      lines.push(`**${qNum}.** ${diff}Complète le texte :`)
      lines.push('')
      if (bloc.banque_mots && bloc.banque_mots.length > 0) {
        lines.push(`📦 **Boîte à mots :** ${bloc.banque_mots.join(' — ')}`)
        lines.push('')
      }
      let texte = bloc.texte_lacunaire ?? ''
      if (isPro && bloc.reponses_trous) {
        bloc.reponses_trous.forEach((rep, i) => {
          texte = texte.replace(`[${i + 1}]`, `**[${rep}]**`)
        })
      } else {
        texte = texte.replace(/\[\d+\]/g, '__________')
      }
      lines.push(texte)
      break
    }

    case 'question_ouverte': {
      lines.push(`**${qNum}.** ${diff}${bloc.enonce ?? ''}`)
      lines.push('')
      if (isPro && bloc.reponse_attendue) {
        lines.push(`> ✅ **Réponse attendue :** ${bloc.reponse_attendue}`)
      } else {
        const n = bloc.lignes_reponse ?? 4
        for (let i = 0; i < n; i++) lines.push('________________________________________________________')
      }
      break
    }
  }

  if (bloc.aide && !isPro) {
    lines.push('')
    lines.push(`> 🤔 *Besoin d'aide ? ${bloc.aide}*`)
  }

  return lines
}
