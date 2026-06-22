import fs from 'fs'
import path from 'path'
import { IA_AUTEUR } from '@/shared/schemas'

const CORPUS_DIR = path.join(process.cwd(), 'data', 'corpus')

/** Auteur conventionnel des textes générés — permet de les repérer dans le corpus */
export { IA_AUTEUR }
export const IA_EDITION_REFERENCE = "Texte inédit généré par l'Atelier — à relire avant usage en classe"

/**
 * Marqueur de provenance des textes déposés par l'enseignant (collage, .txt,
 * .docx, PDF couche-texte). Sert à deux choses :
 *  - les rendre éditables via PATCH (au même titre que les textes IA),
 *  - signaler que leur fidélité n'a pas été vérifiée à une source.
 */
export const DEPOT_VERIFIED_BY = 'depot-enseignant'
export const DEPOT_EDITION_REFERENCE = "Déposé par l'enseignant — fidélité non vérifiée"

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

export interface UserCorpusMeta {
  id: string
  type?: 'extrait' | 'oeuvre_complete'
  auteur: string
  oeuvre: string
  titre: string
  annee_publication: number
  edition_reference?: string
  pages?: string
  /** Pour un passage : id de l'œuvre source (provenance + regroupement UI). */
  parent_id?: string
  /** Angle d'étude du passage (« incipit », « ironie », « satire de la guerre »…). */
  angle?: string
  niveaux: string[]
  genres: string[]
  themes: string[]
  domaine_public: boolean
  texte: string
  /** Provenance — DEPOT_VERIFIED_BY par défaut (rend le texte éditable). */
  verified_by?: string
}

/**
 * Construit le Markdown d'un texte RÉEL déposé par l'enseignant (œuvre attribuée
 * à son auteur). Contrairement aux textes IA : `verified: false` (la fidélité à la
 * source n'est pas garantie) et l'auteur/l'œuvre sont conservés tels quels.
 */
export function buildUserCorpusMarkdown(meta: UserCorpusMeta): string {
  const lines = [
    '---',
    `id: "${meta.id}"`,
    `type: "${meta.type ?? 'extrait'}"`,
    `auteur: "${sanitizeScalar(meta.auteur)}"`,
    `oeuvre: "${sanitizeScalar(meta.oeuvre)}"`,
    `titre: "${sanitizeScalar(meta.titre)}"`,
    `annee_publication: ${meta.annee_publication}`,
    `edition_reference: "${sanitizeScalar(meta.edition_reference ?? DEPOT_EDITION_REFERENCE)}"`,
  ]
  if (meta.pages) lines.push(`pages: "${sanitizeScalar(meta.pages)}"`)
  if (meta.parent_id) lines.push(`parent_id: "${sanitizeScalar(meta.parent_id)}"`)
  if (meta.angle) lines.push(`angle: "${sanitizeScalar(meta.angle)}"`)
  lines.push(
    `niveaux: ${toFrontmatterArray(meta.niveaux)}`,
    `genres: ${toFrontmatterArray(meta.genres)}`,
    `themes: ${toFrontmatterArray(meta.themes)}`,
    `domaine_public: ${meta.domaine_public ? 'true' : 'false'}`,
    'verified: false',
    `verified_by: "${sanitizeScalar(meta.verified_by ?? DEPOT_VERIFIED_BY)}"`,
    `verified_at: "${new Date().toISOString()}"`,
    '---',
    '',
    meta.texte.trim(),
    '',
  )
  return lines.join('\n')
}

/** Écrit le fichier d'un texte déposé dans data/corpus/ et retourne son chemin absolu. */
export function writeUserCorpusFile(meta: UserCorpusMeta): string {
  if (!fs.existsSync(CORPUS_DIR)) fs.mkdirSync(CORPUS_DIR, { recursive: true })
  const filepath = path.join(CORPUS_DIR, `${meta.id}.md`)
  fs.writeFileSync(filepath, buildUserCorpusMarkdown(meta), 'utf-8')
  return filepath
}

export const PASSAGE_EDITION_REFERENCE = "Passage extrait d'une œuvre du corpus"

export interface PassageCorpusMeta {
  id: string
  /** Œuvre source dont ce passage est extrait. */
  parent_id: string
  auteur: string
  oeuvre: string
  /** Titre du passage (l'angle d'étude sert souvent de titre). */
  titre: string
  angle: string
  annee_publication: number
  niveaux: string[]
  genres: string[]
  themes: string[]
  domaine_public: boolean
  /** Sous-chaîne EXACTE de l'œuvre source (résolue par resolvePassageSpans). */
  texte: string
}

/**
 * Écrit un passage comme item de corpus à part entière (`type: extrait`).
 *
 * Le passage hérite de l'auteur/œuvre/genres de l'œuvre source et porte son
 * propre `angle`. Son `contenu` est une copie fidèle d'une portion de l'œuvre
 * (cf. principe d'ancrage) ; il réutilise donc tout le pipeline corpus existant.
 */
export function writePassageCorpusFile(meta: PassageCorpusMeta): string {
  return writeUserCorpusFile({
    id: meta.id,
    type: 'extrait',
    parent_id: meta.parent_id,
    angle: meta.angle,
    auteur: meta.auteur,
    oeuvre: meta.oeuvre,
    titre: meta.titre,
    annee_publication: meta.annee_publication,
    edition_reference: PASSAGE_EDITION_REFERENCE,
    niveaux: meta.niveaux,
    genres: meta.genres,
    themes: meta.themes,
    domaine_public: meta.domaine_public,
    texte: meta.texte,
  })
}

/**
 * Supprime le fichier source `data/corpus/<id>.md` d'un item du corpus.
 *
 * Indispensable au DELETE : les fichiers `.md` sont la source de vérité du
 * corpus (corpus-importer.syncCorpusFromFiles ré-INSÈRE tout fichier présent).
 * Effacer la seule ligne en base laisserait le fichier réapparaître au prochain
 * sync (textes IA générés comme textes déposés par l'enseignant).
 *
 * Idempotent : ne fait rien si le fichier est absent (cas des items importés
 * manuellement, qui n'ont pas été écrits ici). Vise exclusivement l'`id`
 * demandé, jamais un autre fichier du dossier. Retourne true si un fichier a
 * effectivement été supprimé.
 */
export function deleteCorpusFile(id: string): boolean {
  const filepath = path.join(CORPUS_DIR, `${id}.md`)
  if (!fs.existsSync(filepath)) return false
  fs.unlinkSync(filepath)
  return true
}

/**
 * Bascule le statut `verified` (et `verified_by`/`verified_at`) dans le
 * frontmatter du fichier `data/corpus/<id>.md`, EN PRÉSERVANT tout le reste.
 *
 * On édite les lignes à la main plutôt que de réécrire via un writer : les
 * writers reconstruisent un frontmatter minimal et perdraient les champs annexes
 * des textes littéraires (editeur, source_url, source_verified, pages…).
 *
 * Le fichier étant la source de vérité, écrire le flag ici le rend durable : un
 * sync ultérieur ne le rebascule pas. Retourne true si le fichier existait.
 */
export function setCorpusFileVerified(
  id: string,
  verified: boolean,
  verifiedBy = 'professeur',
): boolean {
  const filepath = path.join(CORPUS_DIR, `${id}.md`)
  if (!fs.existsSync(filepath)) return false

  const raw = fs.readFileSync(filepath, 'utf-8')
  const fm = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/)
  if (!fm) return false

  let front = fm[2]
  const setLine = (key: string, value: string) => {
    const re = new RegExp(`^${key}:.*$`, 'm')
    front = re.test(front) ? front.replace(re, `${key}: ${value}`) : `${front}\n${key}: ${value}`
  }
  setLine('verified', verified ? 'true' : 'false')
  setLine('verified_by', `"${sanitizeScalar(verifiedBy)}"`)
  setLine('verified_at', `"${new Date().toISOString()}"`)

  const rebuilt = `${fm[1]}${front}${fm[3]}`
  fs.writeFileSync(filepath, raw.replace(fm[0], () => rebuilt), 'utf-8')
  return true
}
