import { NextRequest, NextResponse } from 'next/server'
import { verifyCorpusItem } from '@/backend/repositories/corpus-repo'

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
