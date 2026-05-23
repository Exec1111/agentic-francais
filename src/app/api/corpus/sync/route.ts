import { NextResponse } from 'next/server'
import { syncCorpusFromFiles, resetSyncFlag } from '@/backend/corpus-importer'

export async function GET() {
  try {
    resetSyncFlag()
    const result = syncCorpusFromFiles(true)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
