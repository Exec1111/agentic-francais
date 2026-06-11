import { NextRequest, NextResponse } from 'next/server'
import { createLLMProvider } from '@/backend/llm-provider'
import { validateLLMOutput } from '@/backend/validation'
import { syncCorpusFromFiles } from '@/backend/corpus-importer'
import { writeGeneratedCorpusFile } from '@/backend/corpus-writer'
import { getCorpusById, expandNiveauxForSearch } from '@/backend/repositories/corpus-repo'
import { GeneratedTextSchema, CorpusItem } from '@/shared/schemas'
import { buildGeneratedTextMessages } from '@/backend/prompts/corpus-generate'

export type CorpusGenerateResponse = {
  /** Item corpus persisté (fichier data/corpus/ + base) — sélectionnable comme tout autre texte */
  item: CorpusItem
  notice_pedagogique: string
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export async function POST(request: NextRequest) {
  try {
    const { demande, niveau, theme, provider, consignes } = await request.json()

    if (!niveau?.trim() || !theme?.trim()) {
      return NextResponse.json({ error: 'Le niveau et le thème sont requis' }, { status: 400 })
    }

    const llm = createLLMProvider(provider)

    // === Étape 1 : écriture du texte original par le LLM ===
    const messages = buildGeneratedTextMessages(
      niveau,
      theme,
      demande ?? '',
      typeof consignes === 'string' ? consignes : '',
    )
    const options = { temperature: 0.9, schema: GeneratedTextSchema, schemaName: 'generated_text' }
    const resp = await llm.chat(messages, options)
    const generated = await validateLLMOutput({
      schema: GeneratedTextSchema,
      raw: resp.content,
      context: 'corpus-generate',
      llm,
      messages,
      options,
      maxRetries: 1,
    })

    // === Étape 2 : persistance comme item du corpus (fichier source de vérité) ===
    const id = `ia-${slugify(generated.titre) || 'texte'}-${Date.now().toString(36)}`
    const niveaux = expandNiveauxForSearch(niveau)

    writeGeneratedCorpusFile({
      id,
      titre: generated.titre,
      annee_publication: new Date().getFullYear(),
      niveaux: niveaux.length > 0 ? niveaux : [niveau],
      genres: [generated.genre],
      themes: generated.themes,
      texte: generated.texte,
    })

    const sync = syncCorpusFromFiles(true)
    if (sync.errors.length > 0) {
      console.warn(`[Corpus] Erreurs au sync après génération: ${sync.errors.join(' | ')}`)
    }

    const item = getCorpusById(id)
    if (!item) {
      return NextResponse.json(
        { error: "Le texte généré n'a pas pu être importé dans le corpus" },
        { status: 500 },
      )
    }

    const response: CorpusGenerateResponse = {
      item,
      notice_pedagogique: generated.notice_pedagogique,
    }
    return NextResponse.json(response)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
