import { NextRequest, NextResponse } from 'next/server'
import { getCorpusById, deleteCorpusItem } from '@/backend/repositories/corpus-repo'
import { writeGeneratedCorpusFile, IA_AUTEUR } from '@/backend/corpus-writer'
import { syncCorpusFromFiles } from '@/backend/corpus-importer'

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

/**
 * Édition d'un texte généré par l'IA (titre et/ou contenu).
 * Réservé aux items créés par l'Atelier : les textes littéraires réels
 * ne sont pas modifiables (leur fidélité à la source fait foi).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const item = getCorpusById(params.id)
    if (!item) {
      return NextResponse.json({ error: `Item corpus introuvable: ${params.id}` }, { status: 404 })
    }
    if (item.auteur !== IA_AUTEUR) {
      return NextResponse.json(
        { error: 'Seuls les textes générés par l\'IA sont éditables' },
        { status: 403 },
      )
    }

    const { titre, texte } = await request.json()
    const newTitre = typeof titre === 'string' && titre.trim() ? titre.trim() : item.titre
    const newTexte = typeof texte === 'string' && texte.trim() ? texte.trim() : item.contenu

    // Réécrire le fichier source (même id), puis supprimer la ligne en base
    // avant le sync : le chemin INSERT de l'importeur respecte le frontmatter
    // (verified: true), alors que le chemin UPDATE forcerait verified = 0.
    writeGeneratedCorpusFile({
      id: item.id,
      titre: newTitre,
      annee_publication: item.annee_publication,
      niveaux: item.niveaux,
      genres: item.genres,
      themes: item.themes,
      texte: newTexte,
      verified_by: 'professeur',
    })
    deleteCorpusItem(item.id)
    syncCorpusFromFiles(true)

    const updated = getCorpusById(item.id)
    if (!updated) {
      return NextResponse.json(
        { error: "Le texte modifié n'a pas pu être réimporté dans le corpus" },
        { status: 500 },
      )
    }
    return NextResponse.json({ item: updated })
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
