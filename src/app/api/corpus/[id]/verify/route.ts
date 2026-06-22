import { NextRequest, NextResponse } from 'next/server'
import { getCorpusById, verifyCorpusItem } from '@/backend/repositories/corpus-repo'
import { setCorpusFileVerified } from '@/backend/corpus-writer'
import { syncCorpusFromFiles } from '@/backend/corpus-importer'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = verifyCorpusItem(params.id)
    return NextResponse.json({
      id: params.id,
      integrity: result.ok ? 'ok' : 'compromised',
      ...result,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    const status = msg.includes('introuvable') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

/**
 * POST /api/corpus/[id]/verify
 *
 * Marque un texte comme VALIDÉ par l'enseignant (verified=1) — ou le dévalide
 * avec `{ verified: false }`. Un texte validé devient éligible aux suggestions
 * et à l'appariement automatique (searchCorpus filtre sur verified=1).
 *
 * Le flag est écrit dans le fichier source `.md` (source de vérité) pour être
 * durable, puis la base est resynchronisée.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const item = getCorpusById(params.id)
    if (!item) {
      return NextResponse.json({ error: `Item corpus introuvable: ${params.id}` }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const verified = body?.verified !== false // défaut : valider

    const written = setCorpusFileVerified(params.id, verified)
    if (!written) {
      return NextResponse.json(
        { error: "Ce texte n'a pas de fichier source modifiable (import manuel ?)." },
        { status: 422 },
      )
    }

    syncCorpusFromFiles(true)
    const updated = getCorpusById(params.id)
    return NextResponse.json({ item: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
