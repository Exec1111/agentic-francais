import fs from 'fs'
import path from 'path'
import { describe, it, expect, afterEach } from 'vitest'
import { parseFrontmatter, syncCorpusFromFiles } from '../corpus-importer'
import { getCorpusById, deleteCorpusItem } from '../repositories/corpus-repo'
import { deleteCorpusFile, setCorpusFileVerified } from '../corpus-writer'

const CORPUS_DIR = path.join(process.cwd(), 'data', 'corpus')

function buildMd(id: string, verified: boolean): string {
  return [
    '---',
    `id: "${id}"`,
    'type: "extrait"',
    'auteur: "Auteur Test"',
    'oeuvre: "Œuvre Test"',
    'titre: "Titre Test"',
    'annee_publication: 1700',
    'edition_reference: "Référence test"',
    'niveaux: ["troisieme"]',
    'genres: ["fable"]',
    'themes: ["morale"]',
    'domaine_public: true',
    `verified: ${verified}`,
    '---',
    '',
    'Corps identique du texte — ne change pas entre les deux écritures.',
    '',
  ].join('\n')
}

describe('syncCorpusFromFiles — honore un changement de "verified" à corps identique', () => {
  const testId = `test-verified-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filepath = path.join(CORPUS_DIR, `${testId}.md`)

  afterEach(() => {
    deleteCorpusFile(testId)
    deleteCorpusItem(testId)
  })

  it('passe verified de false à true sans modification du corps (checksum identique)', () => {
    fs.writeFileSync(filepath, buildMd(testId, false), 'utf-8')
    syncCorpusFromFiles(true)
    expect(getCorpusById(testId)?.verified).toBe(false)

    // Seul le frontmatter "verified" change ; le corps (et donc le checksum) est identique.
    fs.writeFileSync(filepath, buildMd(testId, true), 'utf-8')
    syncCorpusFromFiles(true)
    expect(getCorpusById(testId)?.verified).toBe(true)
  })

  it('reste stable si rien ne change (aucune ré-écriture intempestive)', () => {
    fs.writeFileSync(filepath, buildMd(testId, true), 'utf-8')
    syncCorpusFromFiles(true)
    const first = getCorpusById(testId)?.updated_at
    syncCorpusFromFiles(true)
    expect(getCorpusById(testId)?.updated_at).toBe(first)
  })
})

describe('setCorpusFileVerified — bascule le flag sans perdre les champs annexes', () => {
  const testId = `test-setverif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filepath = path.join(CORPUS_DIR, `${testId}.md`)

  // Frontmatter avec des champs annexes que les writers ne connaissent pas.
  const md = [
    '---',
    `id: "${testId}"`,
    'type: "extrait"',
    'auteur: "Molière"',
    'oeuvre: "Tartuffe"',
    'titre: "Tartuffe — extrait"',
    'annee_publication: 1669',
    'editeur: "Éditeur historique"',
    'edition_reference: "Réf. test"',
    'source_url: "https://example.org/source"',
    'niveaux: ["troisieme"]',
    'genres: ["theatre"]',
    'themes: ["hypocrisie"]',
    'domaine_public: true',
    'verified: false',
    '---',
    '',
    'Le corps du texte reste intact.',
    '',
  ].join('\n')

  afterEach(() => {
    deleteCorpusFile(testId)
    deleteCorpusItem(testId)
  })

  it('passe verified à true, pose verified_by/at, et conserve editeur & source_url', () => {
    fs.writeFileSync(filepath, md, 'utf-8')

    expect(setCorpusFileVerified(testId, true)).toBe(true)

    const { meta, body } = parseFrontmatter(fs.readFileSync(filepath, 'utf-8'))
    expect(meta.verified).toBe(true)
    expect(meta.verified_by).toBe('professeur')
    expect(meta.verified_at).toBeTruthy()
    // Champs annexes préservés
    expect(meta.editeur).toBe('Éditeur historique')
    expect(meta.source_url).toBe('https://example.org/source')
    // Corps intact
    expect(body).toBe('Le corps du texte reste intact.')

    // Et le sync le reporte en base
    syncCorpusFromFiles(true)
    expect(getCorpusById(testId)?.verified).toBe(true)
  })

  it('retourne false si le fichier n’existe pas', () => {
    expect(setCorpusFileVerified('inexistant-xyz', true)).toBe(false)
  })
})
