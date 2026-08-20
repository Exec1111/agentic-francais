import { NextRequest, NextResponse } from 'next/server'
import { createLLMProvider } from '@/backend/llm-provider'
import { getCorpusById } from '@/backend/repositories/corpus-repo'
import { runDecoupe, type PassageResolu } from '@/backend/agents/corpus-decoupe'

export type CorpusDecoupeResponse = {
  oeuvre_id: string
  passages: PassageResolu[]
}

/**
 * POST /api/corpus/[id]/decoupe
 *
 * Propose un découpage de l'œuvre en passages (sans rien persister). Les ancres
 * renvoyées par le LLM sont résolues en sous-chaînes EXACTES de l'œuvre ; les
 * passages dont les ancres sont introuvables sont marqués `found: false` pour
 * que le prof les ajuste avant de les enregistrer (voir POST .../passages).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const oeuvre = getCorpusById(params.id)
    if (!oeuvre) {
      return NextResponse.json({ error: `Item corpus introuvable: ${params.id}` }, { status: 404 })
    }
    if (!oeuvre.contenu?.trim()) {
      return NextResponse.json(
        { error: 'Cette œuvre ne contient pas de texte à découper (référence protégée ?).' },
        { status: 422 },
      )
    }

    const { provider, sequenceContext } = await request.json().catch(() => ({}))
    const llm = createLLMProvider(provider)

    const passages = (await runDecoupe(llm, oeuvre, () => {}, typeof sequenceContext === 'string' ? sequenceContext : undefined)).slice(0, 3)

    const response: CorpusDecoupeResponse = { oeuvre_id: oeuvre.id, passages }
    return NextResponse.json(response)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur interne'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
