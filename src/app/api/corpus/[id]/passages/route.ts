import { NextRequest, NextResponse } from 'next/server'
import { getCorpusById } from '@/backend/repositories/corpus-repo'
import { writePassageCorpusFile, setCorpusFileVerified } from '@/backend/corpus-writer'
import { syncCorpusFromFiles } from '@/backend/corpus-importer'
import type { CorpusItem } from '@/shared/schemas'

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
}

interface PassageInput {
  titre: string
  angle: string
  contenu: string
  themes?: string[]
  niveaux?: string[]
}

export type CorpusPassagesResponse = {
  oeuvre_id: string
  items: CorpusItem[]
}

/**
 * POST /api/corpus/[id]/passages
 *
 * Persiste les passages validés par le prof à partir de l'œuvre source. Chaque
 * passage devient un item de corpus à part entière (`type: extrait`, `parent_id`
 * = id de l'œuvre), héritant auteur/œuvre/genres/année/domaine_public de la
 * source. Les passages sont écrits puis marqués `verified` : ils ont été curés
 * par le prof et deviennent immédiatement utilisables (searchCorpus, appariement).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const oeuvre = getCorpusById(params.id)
    if (!oeuvre) {
      return NextResponse.json({ error: `Œuvre introuvable: ${params.id}` }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const passages: PassageInput[] = Array.isArray(body?.passages) ? body.passages : []
    const valides = passages.filter((p) => p?.contenu?.trim() && p?.titre?.trim())
    if (valides.length === 0) {
      return NextResponse.json({ error: 'Aucun passage valide à enregistrer.' }, { status: 400 })
    }

    const createdIds: string[] = []
    valides.forEach((p, i) => {
      const base = slugify(p.angle || p.titre) || 'passage'
      const id = `${oeuvre.id}-p-${base}-${Date.now().toString(36)}${i}`
      writePassageCorpusFile({
        id,
        parent_id: oeuvre.id,
        auteur: oeuvre.auteur,
        oeuvre: oeuvre.oeuvre,
        titre: p.titre.trim(),
        angle: (p.angle ?? '').trim(),
        annee_publication: oeuvre.annee_publication,
        niveaux: p.niveaux?.length ? p.niveaux : oeuvre.niveaux,
        genres: oeuvre.genres,
        themes: p.themes?.length ? p.themes : oeuvre.themes,
        domaine_public: oeuvre.domaine_public,
        texte: p.contenu.trim(),
      })
      createdIds.push(id)
    })

    syncCorpusFromFiles(true)
    // Curés par le prof → directement validés (le dépôt brut, lui, reste à valider).
    for (const id of createdIds) setCorpusFileVerified(id, true, 'professeur')
    syncCorpusFromFiles(true)

    const items = createdIds.map((id) => getCorpusById(id)).filter((x): x is CorpusItem => x !== null)
    const response: CorpusPassagesResponse = { oeuvre_id: oeuvre.id, items }
    return NextResponse.json(response, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur interne'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
