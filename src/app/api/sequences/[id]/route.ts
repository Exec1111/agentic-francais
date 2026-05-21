import { NextResponse } from 'next/server'
import { getSequenceById, deleteSequence } from '@/backend/repositories/sequence-repo'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const result = getSequenceById(params.id)
    if (!result) {
      return NextResponse.json({ error: 'Séquence non trouvée' }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = deleteSequence(params.id)
    if (!deleted) {
      return NextResponse.json({ error: 'Séquence non trouvée' }, { status: 404 })
    }
    return NextResponse.json({ deleted: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
