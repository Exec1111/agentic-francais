import { NextRequest, NextResponse } from 'next/server'
import { listCorpus, insertCorpusItem } from '@/backend/repositories/corpus-repo'
import { CorpusItemSchema } from '@/shared/schemas'
import crypto from 'crypto'

export async function GET() {
  try {
    const items = listCorpus()
    return NextResponse.json({ items, total: items.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json(
        { error: 'Le champ id est obligatoire' },
        { status: 400 }
      )
    }

    // contenu peut être vide pour les œuvres protégées par droits d'auteur
    const contenu = body.contenu ?? ''
    const checksum = crypto.createHash('sha256').update(contenu, 'utf8').digest('hex')

    const parsed = CorpusItemSchema.safeParse({
      ...body,
      contenu,
      checksum,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.format() },
        { status: 400 }
      )
    }

    insertCorpusItem(parsed.data)
    return NextResponse.json({ id: parsed.data.id, inserted: true }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
