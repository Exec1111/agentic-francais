import { NextRequest, NextResponse } from 'next/server'
import { extractTextFromFile, PdfNoTextLayerError, PdfExtractionError, UnsupportedFileError } from '@/backend/corpus-extract'
import { writeUserCorpusFile } from '@/backend/corpus-writer'
import { syncCorpusFromFiles } from '@/backend/corpus-importer'
import { getCorpusById, expandNiveauxForSearch } from '@/backend/repositories/corpus-repo'
import type { CorpusItem } from '@/shared/schemas'

// L'extraction PDF/.docx s'appuie sur des modules Node (pas Edge).
export const runtime = 'nodejs'

export type CorpusUploadResponse = {
  /** Item corpus persisté (fichier data/corpus/ + base) — sélectionnable comme tout autre texte */
  item: CorpusItem
  /** Origine du contenu : collage manuel ou extraction d'un fichier */
  source: 'colle' | 'txt' | 'docx' | 'pdf'
}

function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'texte'
  )
}

/** Accepte un tableau JSON, une chaîne séparée par des virgules, ou rien. */
function coerceList(value: FormDataEntryValue | null | undefined): string[] {
  if (value == null) return []
  const str = String(value).trim()
  if (!str) return []
  if (str.startsWith('[')) {
    try {
      const arr = JSON.parse(str)
      if (Array.isArray(arr)) return arr.map((v) => String(v).trim()).filter(Boolean)
    } catch {
      /* on retombe sur le découpage par virgules */
    }
  }
  return str.split(',').map((s) => s.trim()).filter(Boolean)
}

function coerceBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on' || value === '1'
}

interface ParsedInput {
  texte: string
  source: CorpusUploadResponse['source']
  auteur: string
  oeuvre: string
  titre: string
  annee_publication: number
  niveau: string
  genres: string[]
  themes: string[]
  domaine_public: boolean
  pages?: string
}

/**
 * POST /api/corpus/upload
 *
 * Deux modes :
 *  - multipart/form-data avec un champ `file` (.txt, .docx, PDF couche-texte)
 *  - application/json avec un champ `texte` (collage manuel)
 *
 * Champs de métadonnées communs : auteur, oeuvre, titre, niveau,
 * annee_publication, genres, themes, domaine_public, pages.
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') ?? ''
    let input: ParsedInput

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Aucun fichier reçu (champ « file »).' }, { status: 400 })
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      const extracted = await extractTextFromFile(file.name, buffer, file.type || undefined)
      const oeuvre = String(form.get('oeuvre') ?? '').trim()
      input = {
        texte: extracted.text,
        source: extracted.kind,
        auteur: String(form.get('auteur') ?? '').trim() || 'Auteur non précisé',
        oeuvre,
        titre: String(form.get('titre') ?? '').trim() || oeuvre || file.name.replace(/\.[^.]+$/, ''),
        annee_publication: Number(form.get('annee_publication')) || new Date().getFullYear(),
        niveau: String(form.get('niveau') ?? '').trim(),
        genres: coerceList(form.get('genres')),
        themes: coerceList(form.get('themes')),
        domaine_public: coerceBool(form.get('domaine_public')),
        pages: String(form.get('pages') ?? '').trim() || undefined,
      }
    } else {
      const body = await request.json()
      const texte = typeof body.texte === 'string' ? body.texte.trim() : ''
      if (!texte) {
        return NextResponse.json({ error: 'Le champ « texte » est vide.' }, { status: 400 })
      }
      const oeuvre = String(body.oeuvre ?? '').trim()
      input = {
        texte,
        source: 'colle',
        auteur: String(body.auteur ?? '').trim() || 'Auteur non précisé',
        oeuvre,
        titre: String(body.titre ?? '').trim() || oeuvre || 'Texte déposé',
        annee_publication: Number(body.annee_publication) || new Date().getFullYear(),
        niveau: String(body.niveau ?? '').trim(),
        genres: coerceList(body.genres),
        themes: coerceList(body.themes),
        domaine_public: coerceBool(body.domaine_public),
        pages: String(body.pages ?? '').trim() || undefined,
      }
    }

    if (!input.oeuvre) {
      return NextResponse.json(
        { error: "Le titre de l'œuvre est requis pour déposer un texte." },
        { status: 400 },
      )
    }

    const niveaux = input.niveau ? expandNiveauxForSearch(input.niveau) : []
    const id = `user-${slugify(input.oeuvre)}-${Date.now().toString(36)}`

    writeUserCorpusFile({
      id,
      auteur: input.auteur,
      oeuvre: input.oeuvre,
      titre: input.titre,
      annee_publication: input.annee_publication,
      pages: input.pages,
      niveaux: niveaux.length > 0 ? niveaux : input.niveau ? [input.niveau] : [],
      genres: input.genres,
      themes: input.themes,
      domaine_public: input.domaine_public,
      texte: input.texte,
    })

    const sync = syncCorpusFromFiles(true)
    if (sync.errors.length > 0) {
      console.warn(`[Corpus] Erreurs au sync après dépôt: ${sync.errors.join(' | ')}`)
    }

    const item = getCorpusById(id)
    if (!item) {
      return NextResponse.json(
        { error: "Le texte déposé n'a pas pu être importé dans le corpus." },
        { status: 500 },
      )
    }

    const response: CorpusUploadResponse = { item, source: input.source }
    return NextResponse.json(response)
  } catch (error) {
    if (
      error instanceof PdfNoTextLayerError ||
      error instanceof PdfExtractionError ||
      error instanceof UnsupportedFileError
    ) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    const msg = error instanceof Error ? error.message : 'Erreur interne'
    console.error('[POST /api/corpus/upload]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
