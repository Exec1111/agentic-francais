import { NextRequest, NextResponse } from 'next/server'
import { getCorpusById, deleteCorpusItem } from '@/backend/repositories/corpus-repo'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const item = getCorpusById(params.id)
    if (!item) {
      return NextResponse.json({ error: `Item corpus introuvable: ${params.id}` }, { status: 404 })
    }
    return NextResponse.json({ item })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = deleteCorpusItem(params.id)
    if (!deleted) {
      return NextResponse.json({ error: `Item corpus introuvable: ${params.id}` }, { status: 404 })
    }
    return NextResponse.json({ deleted: true, id: params.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
