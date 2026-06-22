import { getDb, now, toJson, fromJson } from '../db'
import { syncCorpusFromFiles } from '../corpus-importer'
import type { CorpusItem, CorpusQuery } from '@/shared/schemas'

// === Mapping DB row → CorpusItem ===

function rowToCorpusItem(row: Record<string, unknown>): CorpusItem {
  return {
    id: row.id as string,
    type: row.type as 'extrait' | 'oeuvre_complete',
    auteur: row.auteur as string,
    oeuvre: row.oeuvre as string,
    titre: row.titre as string,
    annee_publication: row.annee_publication as number,
    edition_reference: row.edition_reference as string,
    pages: (row.pages as string) ?? undefined,
    parent_id: (row.parent_id as string) ?? undefined,
    angle: (row.angle as string) ?? undefined,
    contenu: row.contenu as string,
    checksum: row.checksum as string,
    niveaux: fromJson<string[]>(row.niveaux as string),
    genres: fromJson<string[]>(row.genres as string),
    themes: fromJson<string[]>(row.themes as string),
    domaine_public: Boolean(row.domaine_public),
    verified: Boolean(row.verified),
    verified_by: (row.verified_by as string) ?? undefined,
    verified_at: (row.verified_at as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export type CorpusItemMeta = Omit<CorpusItem, 'contenu'> & {
  /** true si le texte intégral est disponible dans le corpus, false pour une référence protégée */
  has_content: boolean
}

function rowToCorpusMeta(row: Record<string, unknown>): CorpusItemMeta {
  const item = rowToCorpusItem(row)
  const { contenu: _, ...meta } = item
  return { ...meta, has_content: item.contenu !== '' }
}

// === Normalisation du niveau ===

const NIVEAU_MAP: Record<string, string> = {
  '6e': 'sixieme', '6ème': 'sixieme', '6eme': 'sixieme', 'sixieme': 'sixieme',
  '5e': 'cinquieme', '5ème': 'cinquieme', '5eme': 'cinquieme', 'cinquieme': 'cinquieme',
  '4e': 'quatrieme', '4ème': 'quatrieme', '4eme': 'quatrieme', 'quatrieme': 'quatrieme',
  '3e': 'troisieme', '3ème': 'troisieme', '3eme': 'troisieme', 'troisieme': 'troisieme',
  '2nde': 'seconde', '2de': 'seconde', 'seconde': 'seconde',
  '1ere': 'premiere', '1ère': 'premiere', '1re': 'premiere', 'premiere': 'premiere', 'première': 'premiere',
  'terminale': 'terminale', 'tale': 'terminale', 'tle': 'terminale',
}

// Termes génériques couvrant plusieurs niveaux
const LYCEE_LEVELS  = ['seconde', 'premiere', 'terminale'] as const
const COLLEGE_LEVELS = ['sixieme', 'cinquieme', 'quatrieme', 'troisieme'] as const
const GENERIC_LYCEE  = new Set(['lycee', 'lycée', 'secondaire', 'lyceen', 'lycéen'])
const GENERIC_COLLEGE = new Set(['college', 'collège'])

export function normalizeNiveau(niveau: string): string | null {
  const key = niveau.toLowerCase().trim()
  return NIVEAU_MAP[key] ?? null
}

/**
 * Retourne la liste de niveaux à utiliser dans un filtre SQL de recherche.
 *
 * Pour un niveau précis ("3e" → ["troisieme"]).
 * Pour un terme générique ("secondaire" → ["seconde","premiere","terminale"]).
 * Retourne [] si le niveau est inconnu (pas de filtre SQL, le LLM jugera).
 */
export function expandNiveauxForSearch(niveau: string): string[] {
  const key = niveau.toLowerCase().trim()
  if (GENERIC_LYCEE.has(key))   return [...LYCEE_LEVELS]
  if (GENERIC_COLLEGE.has(key)) return [...COLLEGE_LEVELS]
  const normalized = NIVEAU_MAP[key]
  return normalized ? [normalized] : []
}

// === Seuil de score ===

/**
 * Filtre une liste scorée selon le contexte de la requête.
 *
 * - requirePositive=true (requête thématique) : exclut tout item à score 0,
 *   même si tous les items sont à 0. Un texte hors-sujet thématiquement ne
 *   doit pas apparaître, même s'il est le seul dans le corpus.
 * - requirePositive=false (requête sans critère thématique, ex. par auteur) :
 *   comportement souple — si au moins un item score positivement, on écarte
 *   les zéros ; sinon on retourne tout.
 *
 * Exposé pour les tests unitaires (logique pure, sans I/O).
 */
export function applyScoreThreshold<T>(
  scored: { item: T; score: number }[],
  requirePositive = false
): { item: T; score: number }[] {
  if (requirePositive) return scored.filter((s) => s.score > 0)
  const maxScore = scored[0]?.score ?? 0
  return maxScore > 0 ? scored.filter((s) => s.score > 0) : scored
}

// === Recherche avec scoring ===

export function searchCorpus(query: CorpusQuery): CorpusItem[] {
  syncCorpusFromFiles()

  const db = getDb()
  const conditions: string[] = ['verified = 1']
  const params: unknown[] = []

  if (query.type) {
    conditions.push('type = ?')
    params.push(query.type)
  }

  if (query.auteur) {
    conditions.push('LOWER(auteur) LIKE ?')
    params.push(`%${query.auteur.toLowerCase()}%`)
  }

  if (query.oeuvre) {
    conditions.push('LOWER(oeuvre) LIKE ?')
    params.push(`%${query.oeuvre.toLowerCase()}%`)
  }

  // Filtre sur au moins un niveau correspondant
  if (query.niveaux?.length) {
    const niveauConds = query.niveaux.map(() => `niveaux LIKE ?`).join(' OR ')
    conditions.push(`(${niveauConds})`)
    params.push(...query.niveaux.map((n) => `%"${n}"%`))
  }

  const sql = `SELECT * FROM corpus WHERE ${conditions.join(' AND ')}`
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]

  if (rows.length === 0) return []

  // Scoring en mémoire : thème (2/match) + genre (1/match)
  // Note : le niveau est déjà un FILTRE SQL → il n'entre PAS dans le score.
  // Un texte du bon niveau mais hors-sujet thématique obtient score 0 → exclu.
  const scored = rows.map((row) => {
    const item = rowToCorpusItem(row)
    let score = 0

    if (query.themes?.length) {
      const matchedThemes = query.themes.filter((t) =>
        item.themes.some((it) => it.toLowerCase().includes(t.toLowerCase()))
      )
      score += matchedThemes.length * 2
    }
    if (query.genres?.length) {
      const matchedGenres = query.genres.filter((g) =>
        item.genres.some((ig) => ig.toLowerCase().includes(g.toLowerCase()))
      )
      score += matchedGenres.length
    }

    return { item, score }
  })

  const sorted = scored.sort((a, b) => b.score - a.score)

  // Si la requête contient des critères thématiques, on exige score > 0 (strict).
  // Sinon (ex. recherche par auteur seul) on est souple : si tous à 0, on retourne tout.
  const hasThematicQuery = !!(query.themes?.length || query.genres?.length)
  const filtered = applyScoreThreshold(sorted, hasThematicQuery)

  return filtered
    .slice(0, query.limit ?? 5)
    .map((s) => s.item)
}

// === CRUD ===

export function listCorpus(): CorpusItemMeta[] {
  syncCorpusFromFiles()
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM corpus ORDER BY auteur, oeuvre, titre')
    .all() as Record<string, unknown>[]
  return rows.map(rowToCorpusMeta)
}

export function getCorpusById(id: string): CorpusItem | null {
  syncCorpusFromFiles()
  const db = getDb()
  const row = db.prepare('SELECT * FROM corpus WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToCorpusItem(row) : null
}

export function insertCorpusItem(item: Omit<CorpusItem, 'created_at' | 'updated_at'>): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO corpus (
      id, type, auteur, oeuvre, titre, annee_publication, edition_reference, pages,
      parent_id, angle, contenu, checksum, niveaux, genres, themes, domaine_public, verified,
      verified_by, verified_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.id,
    item.type,
    item.auteur,
    item.oeuvre,
    item.titre,
    item.annee_publication,
    item.edition_reference,
    item.pages ?? null,
    item.parent_id ?? null,
    item.angle ?? null,
    item.contenu,
    item.checksum,
    toJson(item.niveaux),
    toJson(item.genres),
    toJson(item.themes),
    item.domaine_public ? 1 : 0,
    item.verified ? 1 : 0,
    item.verified_by ?? null,
    item.verified_at ?? null,
    now(),
    now()
  )
}

export function deleteCorpusItem(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM corpus WHERE id = ?').run(id)
  return result.changes > 0
}

export function verifyCorpusItem(id: string): { ok: boolean; expected: string; actual: string } {
  const item = getCorpusById(id)
  if (!item) throw new Error(`Item corpus introuvable: ${id}`)

  const crypto = require('crypto') as typeof import('crypto')
  const actual = crypto.createHash('sha256').update(item.contenu, 'utf8').digest('hex')
  return { ok: actual === item.checksum, expected: item.checksum, actual }
}
