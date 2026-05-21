import { NextRequest, NextResponse } from 'next/server'
import { listSequences, saveSequence } from '@/backend/repositories/sequence-repo'
import { SequenceSchema } from '@/shared/schemas'

export async function GET() {
  try {
    const sequences = listSequences()
    return NextResponse.json({ sequences })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sequence, review } = body

    if (!sequence) {
      return NextResponse.json({ error: 'Le champ sequence est requis' }, { status: 400 })
    }

    // Validation minimale
    const parsed = SequenceSchema.safeParse(sequence)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Format de séquence invalide', details: parsed.error.format() }, { status: 400 })
    }

    const id = saveSequence(parsed.data, review ?? null)
    return NextResponse.json({ id, saved: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
