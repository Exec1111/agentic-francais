import { NextRequest, NextResponse } from 'next/server'
import { searchCorpus, normalizeNiveau } from '@/backend/repositories/corpus-repo'
import { CorpusQuerySchema } from '@/shared/schemas'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl

    const rawNiveaux = searchParams.getAll('niveaux')
    const rawThemes = searchParams.getAll('themes')
    const rawGenres = searchParams.getAll('genres')

    // Normaliser les niveaux (ex: "3ème" → "troisieme")
    const niveaux = rawNiveaux
      .map(normalizeNiveau)
      .filter((n): n is string => n !== null)

    const query = CorpusQuerySchema.parse({
      niveaux: niveaux.length ? niveaux : undefined,
      themes: rawThemes.length ? rawThemes : undefined,
      genres: rawGenres.length ? rawGenres : undefined,
      auteur: searchParams.get('auteur') ?? undefined,
      oeuvre: searchParams.get('oeuvre') ?? undefined,
      type: searchParams.get('type') ?? undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 5,
    })

    const results = searchCorpus(query)
    // Ne pas retourner le contenu dans les résultats de recherche
    const safeResults = results.map(({ contenu: _, ...meta }) => meta)

    return NextResponse.json({ query, results: safeResults, total: safeResults.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
