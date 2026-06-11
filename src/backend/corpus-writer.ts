import fs from 'fs'
import path from 'path'
import { IA_AUTEUR } from '@/shared/schemas'

const CORPUS_DIR = path.join(process.cwd(), 'data', 'corpus')

/** Auteur conventionnel des textes générés — permet de les repérer dans le corpus */
export { IA_AUTEUR }
export const IA_EDITION_REFERENCE = "Texte inédit généré par l'Atelier — à relire avant usage en classe"

export interface GeneratedCorpusMeta {
  id: string
  titre: string
  annee_publication: number
  niveaux: string[]
  genres: string[]
  themes: string[]
  texte: string
  /** "generation-ia" à la création, "professeur" après relecture/édition */
  verified_by?: string
}

// Le parseur de frontmatter de corpus-importer est volontairement simple :
// les guillemets doubles délimitent les chaînes, les virgules séparent les
// éléments de tableau. On neutralise ces caractères dans les valeurs.
function sanitizeScalar(value: string): string {
  return value.replace(/"/g, "'").replace(/\r?\n/g, ' ').trim()
}

function sanitizeArrayEntry(value: string): string {
  return sanitizeScalar(value).replace(/,/g, ' ').replace(/\s+/g, ' ')
}

function toFrontmatterArray(values: string[]): string {
  return JSON.stringify(values.map(sanitizeArrayEntry).filter(Boolean))
}

/**
 * Construit le contenu du fichier Markdown d'un texte généré par l'IA,
 * au format frontmatter attendu par corpus-importer.
 *
 * Le texte est marqué domaine_public (création originale, pas de droits
 * d'auteur tiers) et verified (le checksum est calculé par l'importeur
 * sur ce contenu exact).
 */
export function buildGeneratedCorpusMarkdown(meta: GeneratedCorpusMeta): string {
  const titre = sanitizeScalar(meta.titre)
  return [
    '---',
    `id: "${meta.id}"`,
    'type: "extrait"',
    `auteur: "${IA_AUTEUR}"`,
    `oeuvre: "${titre}"`,
    `titre: "${titre}"`,
    `annee_publication: ${meta.annee_publication}`,
    `edition_reference: "${IA_EDITION_REFERENCE}"`,
    `niveaux: ${toFrontmatterArray(meta.niveaux)}`,
    `genres: ${toFrontmatterArray(meta.genres)}`,
    `themes: ${toFrontmatterArray(meta.themes)}`,
    'domaine_public: true',
    'verified: true',
    `verified_by: "${sanitizeScalar(meta.verified_by ?? 'generation-ia')}"`,
    `verified_at: "${new Date().toISOString()}"`,
    '---',
    '',
    meta.texte.trim(),
    '',
  ].join('\n')
}

/** Écrit le fichier dans data/corpus/ et retourne son chemin absolu. */
export function writeGeneratedCorpusFile(meta: GeneratedCorpusMeta): string {
  if (!fs.existsSync(CORPUS_DIR)) fs.mkdirSync(CORPUS_DIR, { recursive: true })
  const filepath = path.join(CORPUS_DIR, `${meta.id}.md`)
  fs.writeFileSync(filepath, buildGeneratedCorpusMarkdown(meta), 'utf-8')
  return filepath
}
