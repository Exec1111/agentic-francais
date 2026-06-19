import type { ResourceTypeDefinition } from '../registry'
import {
  MethodeContenuSchema,
  type MethodeContenu,
  type MethodeBloc,
  stripMethodeBlocProf,
  sanitizeMethodeBlocs,
  isMethodeEtape,
  createBlankMethodeContenu,
} from '@/shared/resource-blocks-methode'
import { buildMessages } from '@/backend/prompts/methode'
import { buildCorpusContextBlocks } from '@/backend/workflow-engine'

/**
 * Type de ressource `fiche_methode` — fiche méthode structurée en BLOCS.
 * Famille « document par blocs » (framework partagé). Bloc clé : `etape` (numéroté).
 */
export const ficheMethodeDefinition: ResourceTypeDefinition<MethodeContenu> = {
  type: 'fiche_methode',
  label: 'Fiche méthode',
  category: 'TWO_VERSIONS',
  schema: MethodeContenuSchema,

  toStudentVersion: (full) => ({
    titre: full.titre,
    objectif: full.objectif,
    note_prof_globale: null,
    blocs: full.blocs.map(stripMethodeBlocProf),
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

  postProcess: (full) => sanitizeMethodeBlocs(full),

  toMarkdown: {
    professeur: (r) => renderMethodeMarkdown(r as MethodeContenu, 'professeur'),
    eleve: (r) => renderMethodeMarkdown(r as MethodeContenu, 'eleve'),
  },

  suggestedFor: ['production_ecrite', 'exercice'],

  template: () => createBlankMethodeContenu(),
}

// ── Rendu Markdown ───────────────────────────────────────────────────────────────

const ENCADRE_EMOJI: Record<string, string> = {
  rappel: '💡',
  astuce: '✨',
  attention: '⚠️',
  exemple: '📝',
}

function renderMethodeMarkdown(r: MethodeContenu, audience: 'professeur' | 'eleve'): string {
  const isPro = audience === 'professeur'
  const lines: string[] = []

  lines.push(`# ${r.titre}`)
  if (isPro) lines.push(`*— Version professeur — avec notes pédagogiques —*`)
  lines.push('')

  if (r.objectif) {
    lines.push(`> 🎯 **Objectif :** ${r.objectif}`)
    lines.push('')
  }

  let etapeNum = 1
  for (const bloc of r.blocs) {
    lines.push(...renderMethodeBlocMarkdown(bloc, isPro, etapeNum))
    if (isMethodeEtape(bloc.type)) etapeNum++
    lines.push('')
  }

  if (isPro && r.note_prof_globale) {
    lines.push('---')
    lines.push(`> 📝 **Note pédagogique :** ${r.note_prof_globale}`)
  }

  return lines.join('\n')
}

function renderMethodeBlocMarkdown(bloc: MethodeBloc, isPro: boolean, etapeNum: number): string[] {
  const lines: string[] = []

  switch (bloc.type) {
    case 'titre_section':
      lines.push(`## ${bloc.texte ?? ''}`)
      break

    case 'etape':
      lines.push(`**Étape ${etapeNum} — ${bloc.titre ?? ''}**`)
      lines.push('')
      lines.push(bloc.texte ?? '')
      break

    case 'paragraphe':
      lines.push(bloc.texte ?? '')
      break

    case 'exemple':
      lines.push(`> 📌 *Exemple :* ${bloc.texte ?? ''}`)
      break

    case 'encadre': {
      const emoji = ENCADRE_EMOJI[bloc.encadre_variante ?? 'astuce'] ?? '✨'
      lines.push(`> ${emoji} **${bloc.encadre_titre ?? 'Astuce'}**`)
      lines.push(`> ${bloc.texte ?? ''}`)
      break
    }

    case 'liste':
      if (bloc.texte) {
        lines.push(bloc.texte)
        lines.push('')
      }
      for (const item of bloc.items ?? []) lines.push(`- ${item}`)
      break
  }

  if (isPro && bloc.note_prof) {
    lines.push('')
    lines.push(`> 📝 *Note prof : ${bloc.note_prof}*`)
  }

  return lines
}
