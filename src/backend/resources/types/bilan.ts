import type { ResourceTypeDefinition } from '../registry'
import {
  BilanContenuSchema,
  type BilanContenu,
  type BilanBloc,
  stripBilanBlocProf,
  sanitizeBilanBlocs,
  createBlankBilanContenu,
} from '@/shared/resource-blocks-bilan'
import { buildMessages } from '@/backend/prompts/bilan'
import { buildCorpusContextBlocks } from '@/backend/workflow-engine'

/**
 * Type de ressource `bilan` — bilan de séance/séquence structuré en BLOCS.
 * Famille « document par blocs » (framework partagé). Bloc clé : `checklist`
 * (auto-évaluation, avec remédiation réservée au professeur).
 */
export const bilanDefinition: ResourceTypeDefinition<BilanContenu> = {
  type: 'bilan',
  label: 'Bilan',
  category: 'TWO_VERSIONS',
  schema: BilanContenuSchema,

  toStudentVersion: (full) => ({
    titre: full.titre,
    introduction: full.introduction,
    note_prof_globale: null,
    blocs: full.blocs.map(stripBilanBlocProf),
  }),

  buildPrompt: (ctx) => {
    const items = ctx.corpusItems?.length
      ? ctx.corpusItems
      : (ctx.corpusItem ? [ctx.corpusItem] : [])

    let corpusBlock = ''
    if (items.length > 0) {
      corpusBlock = '\n' + buildCorpusContextBlocks(items.filter((item) => item.contenu))
      const protectedRefs = items.filter((item) => !item.contenu)
      if (protectedRefs.length > 0) {
        corpusBlock += protectedRefs.map((item) =>
          `\nRÉFÉRENCE BIBLIOGRAPHIQUE (texte protégé — non reproduit) :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auteur     : ${item.auteur}
Œuvre      : ${item.oeuvre}
Référence  : ${item.edition_reference}${item.pages ? ` — pages ${item.pages}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        ).join('\n')
      }
    }
    return buildMessages(ctx, corpusBlock)
  },

  postProcess: (full) => sanitizeBilanBlocs(full),

  toMarkdown: {
    professeur: (r) => renderBilanMarkdown(r as BilanContenu, 'professeur'),
    eleve: (r) => renderBilanMarkdown(r as BilanContenu, 'eleve'),
  },

  suggestedFor: ['evaluation', 'exercice'],

  template: () => createBlankBilanContenu(),
}

// ── Rendu Markdown ───────────────────────────────────────────────────────────────

const ENCADRE_EMOJI: Record<string, string> = {
  rappel: '💡',
  astuce: '✨',
  attention: '⚠️',
  exemple: '📝',
}

function renderBilanMarkdown(r: BilanContenu, audience: 'professeur' | 'eleve'): string {
  const isPro = audience === 'professeur'
  const lines: string[] = []

  lines.push(`# ${r.titre}`)
  if (isPro) lines.push(`*— Version professeur — avec remédiation —*`)
  lines.push('')

  if (r.introduction) {
    lines.push(`*${r.introduction}*`)
    lines.push('')
  }

  for (const bloc of r.blocs) {
    lines.push(...renderBilanBlocMarkdown(bloc, isPro))
    lines.push('')
  }

  if (isPro && r.note_prof_globale) {
    lines.push('---')
    lines.push(`> 📝 **Note pédagogique :** ${r.note_prof_globale}`)
  }

  return lines.join('\n')
}

function renderBilanBlocMarkdown(bloc: BilanBloc, isPro: boolean): string[] {
  const lines: string[] = []

  switch (bloc.type) {
    case 'titre_section':
      lines.push(`## ${bloc.texte ?? ''}`)
      break

    case 'paragraphe':
      lines.push(bloc.texte ?? '')
      break

    case 'liste':
      if (bloc.texte) {
        lines.push(bloc.texte)
        lines.push('')
      }
      for (const item of bloc.items ?? []) lines.push(`- ${item}`)
      break

    case 'encadre': {
      const emoji = ENCADRE_EMOJI[bloc.encadre_variante ?? 'rappel'] ?? '💡'
      lines.push(`> ${emoji} **${bloc.encadre_titre ?? 'À retenir'}**`)
      lines.push(`> ${bloc.texte ?? ''}`)
      break
    }

    case 'checklist': {
      if (bloc.texte) {
        lines.push(bloc.texte)
        lines.push('')
      }
      const statements = bloc.checklist_items ?? []
      const remediation = bloc.checklist_remediation ?? []
      statements.forEach((s, i) => {
        const rem = isPro && remediation[i] ? ` — 🔧 *${remediation[i]}*` : ''
        lines.push(`- [ ] ${s}${rem}`)
      })
      break
    }
  }

  if (isPro && bloc.note_prof) {
    lines.push('')
    lines.push(`> 📝 *Note prof : ${bloc.note_prof}*`)
  }

  return lines
}
