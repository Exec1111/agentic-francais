import { NextRequest, NextResponse } from 'next/server'
import { getCorpusById, deleteCorpusItem } from '@/backend/repositories/corpus-repo'
import { writeGeneratedCorpusFile, writeUserCorpusFile, deleteCorpusFile, IA_AUTEUR, DEPOT_VERIFIED_BY } from '@/backend/corpus-writer'
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
 * Édition d'un texte (titre et/ou contenu).
 * Autorisé pour les textes créés par l'Atelier (auteur = IA) et pour les textes
 * déposés par l'enseignant (provenance « dépôt »), qu'il peut rogner/nettoyer.
 * Les textes littéraires vérifiés à une source restent non modifiables (leur
 * fidélité fait foi).
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
    const isIa = item.auteur === IA_AUTEUR
    const isDepot = item.verified_by === DEPOT_VERIFIED_BY
    if (!isIa && !isDepot) {
      return NextResponse.json(
        { error: 'Seuls les textes générés par l\'IA ou déposés par l\'enseignant sont éditables' },
        { status: 403 },
      )
    }

    const { titre, texte } = await request.json()
    const newTitre = typeof titre === 'string' && titre.trim() ? titre.trim() : item.titre
    const newTexte = typeof texte === 'string' && texte.trim() ? texte.trim() : item.contenu

    // Réécrire le fichier source (même id), puis supprimer la ligne en base
    // avant le sync : le chemin INSERT de l'importeur respecte le frontmatter
    // (verified, provenance), alors que le chemin UPDATE forcerait verified = 0.
    if (isIa) {
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
    } else {
      // Texte déposé : on conserve l'auteur/l'œuvre/la référence réels.
      writeUserCorpusFile({
        id: item.id,
        type: item.type,
        auteur: item.auteur,
        oeuvre: item.oeuvre,
        titre: newTitre,
        annee_publication: item.annee_publication,
        edition_reference: item.edition_reference,
        pages: item.pages,
        niveaux: item.niveaux,
        genres: item.genres,
        themes: item.themes,
        domaine_public: item.domaine_public,
        texte: newTexte,
      })
    }
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
    // Supprimer aussi le fichier source : sans ça, le texte réapparaîtrait au
    // prochain syncCorpusFromFiles (les .md sont la source de vérité du corpus).
    // Idempotent — sans effet pour les items importés manuellement sans fichier.
    deleteCorpusFile(params.id)
    if (!deleted) {
      return NextResponse.json({ error: `Item corpus introuvable: ${params.id}` }, { status: 404 })
    }
    return NextResponse.json({ deleted: true, id: params.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
