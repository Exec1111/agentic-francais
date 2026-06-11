import { describe, it, expect } from 'vitest'
import { buildGeneratedCorpusMarkdown, IA_AUTEUR, IA_EDITION_REFERENCE } from '../corpus-writer'
import { parseFrontmatter } from '../corpus-importer'

const baseMeta = {
  id: 'ia-le-vieux-phare-abc123',
  titre: 'Le Vieux Phare',
  annee_publication: 2026,
  niveaux: ['cinquieme'],
  genres: ['nouvelle'],
  themes: ['mer', 'solitude'],
  texte: 'Le gardien montait chaque soir les cent marches du phare.\n\nIl pensait à autrefois.',
}

describe('buildGeneratedCorpusMarkdown', () => {
  it('produit un frontmatter relisible par corpus-importer (round-trip)', () => {
    const md = buildGeneratedCorpusMarkdown(baseMeta)
    const { meta, body } = parseFrontmatter(md)

    expect(meta.id).toBe(baseMeta.id)
    expect(meta.type).toBe('extrait')
    expect(meta.auteur).toBe(IA_AUTEUR)
    expect(meta.oeuvre).toBe('Le Vieux Phare')
    expect(meta.titre).toBe('Le Vieux Phare')
    expect(meta.annee_publication).toBe(2026)
    expect(meta.edition_reference).toBe(IA_EDITION_REFERENCE)
    expect(meta.niveaux).toEqual(['cinquieme'])
    expect(meta.genres).toEqual(['nouvelle'])
    expect(meta.themes).toEqual(['mer', 'solitude'])
    expect(meta.domaine_public).toBe(true)
    expect(meta.verified).toBe(true)
    expect(meta.verified_by).toBe('generation-ia')
    expect(body).toBe(baseMeta.texte)
  })

  it("neutralise les guillemets doubles dans le titre (parseur YAML simple)", () => {
    const md = buildGeneratedCorpusMarkdown({
      ...baseMeta,
      titre: 'La "Grande" Traversée',
    })
    const { meta } = parseFrontmatter(md)
    expect(meta.titre).toBe("La 'Grande' Traversée")
    expect(meta.oeuvre).toBe("La 'Grande' Traversée")
  })

  it('survit aux apostrophes et virgules dans les thèmes', () => {
    const md = buildGeneratedCorpusMarkdown({
      ...baseMeta,
      themes: ["l'aventure", 'passé, présent'],
    })
    const { meta } = parseFrontmatter(md)
    // Les virgules sont remplacées par des espaces, les apostrophes conservées
    expect(meta.themes).toEqual(["l'aventure", 'passé présent'])
  })

  it('utilise verified_by "professeur" après édition (et "generation-ia" par défaut)', () => {
    const { meta: defaut } = parseFrontmatter(buildGeneratedCorpusMarkdown(baseMeta))
    expect(defaut.verified_by).toBe('generation-ia')

    const { meta: edite } = parseFrontmatter(
      buildGeneratedCorpusMarkdown({ ...baseMeta, verified_by: 'professeur' }),
    )
    expect(edite.verified_by).toBe('professeur')
    expect(edite.verified).toBe(true)
  })

  it('conserve un texte multiligne intact, y compris un séparateur ---', () => {
    const texte = 'Premier paragraphe.\n\n---\n\nSecond paragraphe.'
    const md = buildGeneratedCorpusMarkdown({ ...baseMeta, texte })
    const { body } = parseFrontmatter(md)
    expect(body).toBe(texte)
  })
})
