import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getDb, now, toJson } from './db'

const CORPUS_DIR = path.join(process.cwd(), 'data', 'corpus')

export interface SyncResult {
  inserted: number
  updated: number
  unchanged: number
  deleted: number
  errors: string[]
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

export function parseFrontmatter(fileContent: string): { meta: Record<string, unknown>; body: string } {
  const fmMatch = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!fmMatch) return { meta: {}, body: fileContent.trim() }

  const yamlLines = fmMatch[1].split('\n')
  const body = fmMatch[2].trim()
  const meta: Record<string, unknown> = {}

  for (const line of yamlLines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx < 0) continue
    const key = line.slice(0, colonIdx).trim()
    const valStr = line.slice(colonIdx + 1).trim()
    if (!key || key.startsWith('#')) continue

    if (valStr.startsWith('[')) {
      try {
        meta[key] = JSON.parse(valStr.replace(/'/g, '"'))
      } catch {
        meta[key] = valStr
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean)
      }
    } else if (
      (valStr.startsWith('"') && valStr.endsWith('"')) ||
      (valStr.startsWith("'") && valStr.endsWith("'"))
    ) {
      meta[key] = valStr.slice(1, -1)
    } else if (valStr === 'true') {
      meta[key] = true
    } else if (valStr === 'false') {
      meta[key] = false
    } else if (valStr !== '' && !isNaN(Number(valStr))) {
      meta[key] = Number(valStr)
    } else {
      meta[key] = valStr
    }
  }

  return { meta, body }
}

function validateMeta(meta: Record<string, unknown>, filename: string): string[] {
  const required = [
    'id', 'type', 'auteur', 'oeuvre', 'titre',
    'annee_publication', 'edition_reference', 'niveaux', 'genres', 'themes',
  ]
  return required
    .filter((f) => !meta[f])
    .map((f) => `Champ obligatoire manquant "${f}" dans ${filename}`)
}

// Timestamp du dernier sync réussi (ms depuis epoch, 0 = jamais)
let lastSyncAt = 0

/**
 * Détecte si le dossier corpus a été modifié depuis le dernier sync.
 *
 * Chemin rapide : ajouter/supprimer un fichier met à jour le mtime du dossier.
 * Repli : éditer le CONTENU d'un fichier existant (ex. passer verified à true
 * dans le frontmatter) ne bouge PAS le mtime du dossier sur la plupart des OS.
 * On compare donc aussi le mtime de chaque .md pour détecter ces éditions.
 */
function corpusDirChanged(): boolean {
  try {
    if (fs.statSync(CORPUS_DIR).mtimeMs > lastSyncAt) return true
    for (const f of fs.readdirSync(CORPUS_DIR)) {
      if (!f.endsWith('.md')) continue
      if (fs.statSync(path.join(CORPUS_DIR, f)).mtimeMs > lastSyncAt) return true
    }
    return false
  } catch {
    return true // dossier inexistant → on laisse syncCorpusFromFiles le créer
  }
}

export function syncCorpusFromFiles(force = false): SyncResult {
  if (!force && !corpusDirChanged()) {
    return { inserted: 0, updated: 0, unchanged: 0, deleted: 0, errors: [] }
  }

  const result: SyncResult = { inserted: 0, updated: 0, unchanged: 0, deleted: 0, errors: [] }

  if (!fs.existsSync(CORPUS_DIR)) {
    fs.mkdirSync(CORPUS_DIR, { recursive: true })
    lastSyncAt = Date.now()
    return result
  }

  const db = getDb()
  const files = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.md'))
  const processedIds = new Set<string>()

  for (const filename of files) {
    try {
      const filepath = path.join(CORPUS_DIR, filename)
      const fileContent = fs.readFileSync(filepath, 'utf-8')
      const { meta, body } = parseFrontmatter(fileContent)

      const errors = validateMeta(meta, filename)
      if (errors.length > 0) {
        result.errors.push(...errors)
        console.warn(`[Corpus] Fichier ignoré — ${errors.join(', ')}`)
        continue
      }

      const id = meta.id as string
      const checksum = sha256(body)
      processedIds.add(id)

      const existing = db
        .prepare('SELECT id, checksum, verified, verified_by, verified_at FROM corpus WHERE id = ?')
        .get(id) as
        | { id: string; checksum: string; verified: number; verified_by: string | null; verified_at: string | null }
        | undefined

      if (!existing) {
        db.prepare(`
          INSERT INTO corpus (
            id, type, auteur, oeuvre, titre, annee_publication, edition_reference, pages,
            contenu, checksum, niveaux, genres, themes, domaine_public, verified,
            verified_by, verified_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          meta.type,
          meta.auteur,
          meta.oeuvre,
          meta.titre,
          meta.annee_publication,
          meta.edition_reference,
          (meta.pages as string) ?? null,
          body,
          checksum,
          toJson(meta.niveaux || []),
          toJson(meta.genres || []),
          toJson(meta.themes || []),
          meta.domaine_public ? 1 : 0,
          meta.verified ? 1 : 0,
          (meta.verified_by as string) ?? null,
          (meta.verified_at as string) ?? null,
          now(),
          now()
        )
        result.inserted++
        console.log(`[Corpus] Importé: ${id}`)
      } else if (existing.checksum !== checksum) {
        db.prepare(`
          UPDATE corpus SET
            type = ?, auteur = ?, oeuvre = ?, titre = ?, annee_publication = ?,
            edition_reference = ?, pages = ?, contenu = ?, checksum = ?,
            niveaux = ?, genres = ?, themes = ?,
            domaine_public = ?, verified = 0, verified_by = NULL, verified_at = NULL,
            updated_at = ?
          WHERE id = ?
        `).run(
          meta.type,
          meta.auteur,
          meta.oeuvre,
          meta.titre,
          meta.annee_publication,
          meta.edition_reference,
          (meta.pages as string) ?? null,
          body,
          checksum,
          toJson(meta.niveaux || []),
          toJson(meta.genres || []),
          toJson(meta.themes || []),
          meta.domaine_public ? 1 : 0,
          now(),
          id
        )
        result.updated++
        console.log(`[Corpus] Mis à jour: ${id} (contenu modifié → re-vérification requise)`)
      } else {
        // Corps identique (checksum inchangé) : on honore tout de même un
        // changement du statut "verified" dans le frontmatter. Sans ça, valider
        // un texte après import serait impossible — le checksum ne porte que sur
        // le corps, donc passer verified à true ne déclencherait aucune écriture.
        const metaVerified = meta.verified ? 1 : 0
        const metaVerifiedBy = (meta.verified_by as string) ?? null
        const metaVerifiedAt = (meta.verified_at as string) ?? null
        if (
          existing.verified !== metaVerified ||
          (existing.verified_by ?? null) !== metaVerifiedBy ||
          (existing.verified_at ?? null) !== metaVerifiedAt
        ) {
          db.prepare(
            'UPDATE corpus SET verified = ?, verified_by = ?, verified_at = ?, updated_at = ? WHERE id = ?'
          ).run(metaVerified, metaVerifiedBy, metaVerifiedAt, now(), id)
          result.updated++
          console.log(`[Corpus] Statut "verified" mis à jour: ${id} → ${metaVerified ? 'vérifié' : 'non vérifié'}`)
        } else {
          result.unchanged++
        }
      }
    } catch (err) {
      const msg = `Erreur fichier ${filename}: ${err instanceof Error ? err.message : err}`
      result.errors.push(msg)
      console.error(`[Corpus] ${msg}`)
    }
  }

  // Supprimer les entrées dont le fichier source a disparu
  const allIds = db.prepare('SELECT id FROM corpus').all() as Array<{ id: string }>
  for (const { id } of allIds) {
    if (!processedIds.has(id)) {
      db.prepare('DELETE FROM corpus WHERE id = ?').run(id)
      result.deleted++
      console.log(`[Corpus] Supprimé (orphelin): ${id}`)
    }
  }

  const changed = result.inserted + result.updated + result.deleted
  if (changed > 0 || result.errors.length > 0) {
    console.log(
      `[Corpus] Sync: +${result.inserted} insérés, ~${result.updated} mis à jour, ` +
        `=${result.unchanged} inchangés, -${result.deleted} supprimés` +
        (result.errors.length ? `, ${result.errors.length} erreur(s)` : '')
    )
  }

  lastSyncAt = Date.now()
  return result
}

export function resetSyncFlag() {
  lastSyncAt = 0
}
