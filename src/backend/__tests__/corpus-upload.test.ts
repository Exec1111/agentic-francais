import fs from 'fs'
import path from 'path'
import { describe, it, expect, afterEach } from 'vitest'
import {
  buildUserCorpusMarkdown,
  writeUserCorpusFile,
  deleteCorpusFile,
  DEPOT_EDITION_REFERENCE,
  DEPOT_VERIFIED_BY,
} from '../corpus-writer'
import { parseFrontmatter, syncCorpusFromFiles } from '../corpus-importer'
import { getCorpusById, deleteCorpusItem } from '../repositories/corpus-repo'
import {
  extractTextFromFile,
  PdfNoTextLayerError,
  PdfExtractionError,
  UnsupportedFileError,
} from '../corpus-extract'

const baseUserMeta = {
  id: 'user-la-parure-abc123',
  auteur: 'Guy de Maupassant',
  oeuvre: 'La Parure',
  titre: 'La Parure — extrait déposé',
  annee_publication: 1884,
  niveaux: ['troisieme'],
  genres: ['nouvelle'],
  themes: ['apparences'],
  domaine_public: true,
  texte: 'Vers dix heures du soir, elle se leva.\n\n« J\'ai perdu la rivière. »',
}

describe('buildUserCorpusMarkdown', () => {
  it('conserve l\'auteur et l\'œuvre réels, marque verified=false et la provenance dépôt', () => {
    const { meta, body } = parseFrontmatter(buildUserCorpusMarkdown(baseUserMeta))

    expect(meta.id).toBe(baseUserMeta.id)
    expect(meta.auteur).toBe('Guy de Maupassant')
    expect(meta.oeuvre).toBe('La Parure')
    expect(meta.annee_publication).toBe(1884)
    expect(meta.edition_reference).toBe(DEPOT_EDITION_REFERENCE)
    expect(meta.domaine_public).toBe(true)
    expect(meta.verified).toBe(false)
    expect(meta.verified_by).toBe(DEPOT_VERIFIED_BY)
    expect(body).toBe(baseUserMeta.texte)
  })

  it('respecte domaine_public=false (œuvre sous droits)', () => {
    const { meta } = parseFrontmatter(
      buildUserCorpusMarkdown({ ...baseUserMeta, domaine_public: false }),
    )
    expect(meta.domaine_public).toBe(false)
  })

  it('passe la validation des champs obligatoires de corpus-importer', () => {
    const { meta } = parseFrontmatter(buildUserCorpusMarkdown(baseUserMeta))
    for (const f of ['id', 'type', 'auteur', 'oeuvre', 'titre', 'annee_publication', 'edition_reference', 'niveaux', 'genres', 'themes']) {
      expect(meta[f]).toBeTruthy()
    }
  })
})

describe('deleteCorpusFile (suppression de la source de vérité)', () => {
  const CORPUS_DIR = path.join(process.cwd(), 'data', 'corpus')
  // id unique au test pour ne jamais toucher aux textes littéraires du dépôt.
  const testId = `test-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  afterEach(() => {
    // Filet de sécurité : ne laisser ni fichier ni ligne en base après le test.
    deleteCorpusFile(testId)
    deleteCorpusItem(testId)
  })

  it('après DELETE, le fichier disparaît et le sync ne le réimporte pas', () => {
    writeUserCorpusFile({ ...baseUserMeta, id: testId })
    expect(fs.existsSync(path.join(CORPUS_DIR, `${testId}.md`))).toBe(true)

    // Le sync ré-INSÈRE tout fichier présent → l'item existe en base.
    syncCorpusFromFiles(true)
    expect(getCorpusById(testId)).not.toBeNull()

    // Suppression telle que la route DELETE l'effectue : ligne en base + fichier.
    deleteCorpusItem(testId)
    expect(deleteCorpusFile(testId)).toBe(true)
    expect(fs.existsSync(path.join(CORPUS_DIR, `${testId}.md`))).toBe(false)

    // Sans fichier source, un nouveau sync ne fait pas réapparaître l'item.
    syncCorpusFromFiles(true)
    expect(getCorpusById(testId)).toBeNull()
  })

  it('est idempotent : sans fichier (item importé manuellement), retourne false sans erreur', () => {
    expect(fs.existsSync(path.join(CORPUS_DIR, `${testId}.md`))).toBe(false)
    expect(deleteCorpusFile(testId)).toBe(false)
  })
})

describe('extractTextFromFile', () => {
  it('lit un .txt en UTF-8 et normalise les fins de ligne', async () => {
    const buf = Buffer.from('Ligne un\r\nLigne deux\r\n\r\n\r\nLigne trois\n', 'utf-8')
    const res = await extractTextFromFile('extrait.txt', buf, 'text/plain')
    expect(res.kind).toBe('txt')
    expect(res.text).toBe('Ligne un\nLigne deux\n\nLigne trois')
  })

  it('détecte le type par le mimetype même sans extension explicite', async () => {
    const res = await extractTextFromFile('collage', Buffer.from('Bonjour', 'utf-8'), 'text/plain')
    expect(res.kind).toBe('txt')
  })

  it('rejette un format non pris en charge', async () => {
    await expect(
      extractTextFromFile('photo.png', Buffer.from([0x89, 0x50]), 'image/png'),
    ).rejects.toBeInstanceOf(UnsupportedFileError)
  })

  it('lève PdfNoTextLayerError sur un PDF sans couche texte (scanné)', async () => {
    // PDF minimal valide, page vide → aucune couche texte exploitable.
    const emptyPdf = Buffer.from(
      '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
        'trailer<</Root 1 0 R>>\n%%EOF',
      'utf-8',
    )
    await expect(
      extractTextFromFile('scan.pdf', emptyPdf, 'application/pdf'),
    ).rejects.toBeInstanceOf(PdfNoTextLayerError)
  })

  it('lève PdfExtractionError sur un fichier .pdf corrompu / non-PDF', async () => {
    await expect(
      extractTextFromFile('corrompu.pdf', Buffer.from('ceci n\'est pas un pdf', 'utf-8'), 'application/pdf'),
    ).rejects.toBeInstanceOf(PdfExtractionError)
  })
})
