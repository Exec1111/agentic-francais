import { getDb, now, toJson, fromJson } from '@/backend/db'
import type { RessourcePaire, RessourceStructuree, RessourceType, RessourceAudience } from '@/shared/schemas'

// ── Sauvegarde ─────────────────────────────────────────────────────────────────

/**
 * Sauvegarde une paire de ressources (professeur + élève optionnel).
 * Upsert : si l'ID existe déjà, met à jour le contenu.
 *
 * Ordre d'insertion intentionnel pour éviter les violations de FK :
 *   1. Élève  (sans paired_with — le prof n'existe pas encore)
 *   2. Professeur (avec paired_with = élève_id, maintenant existant)
 *   3. UPDATE élève.paired_with = prof_id
 *
 * Note : activite_id peut être NULL si la séquence n'est pas encore
 * sauvegardée en DB — la contrainte FK est alors ignorée proprement.
 */
export function saveRessourcePaire(paire: RessourcePaire): RessourcePaire {
  const db = getDb()

  const upsertStmt = db.prepare(`
    INSERT INTO ressources (id, activite_id, sequence_id, scope, type, audience, profil, derived_from, paired_with, contenu_json, contenu_markdown, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      contenu_json     = excluded.contenu_json,
      contenu_markdown = excluded.contenu_markdown,
      updated_at       = excluded.updated_at
  `)

  const updatePairedWith = db.prepare(
    'UPDATE ressources SET paired_with = ? WHERE id = ?'
  )

  const tx = db.transaction(() => {
    const ts = now()

    // ── Étape 1 : insérer l'élève SANS paired_with ─────────────────────────
    // (le prof n'existe pas encore → on évite la violation FK circulaire)
    if (paire.eleve) {
      upsertStmt.run(
        paire.eleve.id,
        paire.eleve.activite_id ?? null,
        paire.eleve.sequence_id ?? null,
        paire.eleve.scope ?? 'activite',
        paire.eleve.type,
        'eleve',
        paire.eleve.profil ?? 'standard',
        paire.eleve.derived_from ?? null,
        null,   // paired_with temporairement null
        toJson(paire.eleve.contenu_json),
        paire.eleve.contenu_markdown,
        paire.eleve.created_at ?? ts,
        ts
      )
    }

    // ── Étape 2 : insérer le professeur (paired_with → élève existant) ──────
    upsertStmt.run(
      paire.professeur.id,
      paire.professeur.activite_id ?? null,
      paire.professeur.sequence_id ?? null,
      paire.professeur.scope ?? 'activite',
      paire.professeur.type,
      'professeur',
      paire.professeur.profil ?? 'standard',
      paire.professeur.derived_from ?? null,
      paire.professeur.paired_with ?? null,
      toJson(paire.professeur.contenu_json),
      paire.professeur.contenu_markdown,
      paire.professeur.created_at ?? ts,
      ts
    )

    // ── Étape 3 : mettre à jour paired_with de l'élève maintenant que le prof existe
    if (paire.eleve) {
      updatePairedWith.run(paire.professeur.id, paire.eleve.id)
    }
  })

  tx()
  return paire
}

/**
 * Sauvegarde une ressource unique (sans paire). Utilisé quand on ne conserve
 * qu'une seule version d'une génération — ex. la grille d'autoévaluation du bundle
 * évaluation finale, dont seule la version élève est persistée.
 */
export function saveRessource(r: RessourceStructuree): RessourceStructuree {
  const db = getDb()
  const ts = now()
  db.prepare(`
    INSERT INTO ressources (id, activite_id, sequence_id, scope, type, audience, profil, derived_from, paired_with, contenu_json, contenu_markdown, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      contenu_json     = excluded.contenu_json,
      contenu_markdown = excluded.contenu_markdown,
      updated_at       = excluded.updated_at
  `).run(
    r.id,
    r.activite_id ?? null,
    r.sequence_id ?? null,
    r.scope ?? 'activite',
    r.type,
    r.audience,
    r.profil ?? 'standard',
    r.derived_from ?? null,
    r.paired_with ?? null,
    toJson(r.contenu_json),
    r.contenu_markdown,
    r.created_at ?? ts,
    ts
  )
  return r
}

/** Récupère les variantes différenciées (audience élève) dérivées d'une ressource prof. */
export function getVariantesByBase(baseId: string): RessourceStructuree[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM ressources WHERE derived_from = ? ORDER BY created_at ASC')
    .all(baseId) as any[]
  return rows.map(rowToRessource)
}

// ── Lecture ────────────────────────────────────────────────────────────────────

/** Récupère les ressources rattachées à une séquence pour un scope donné. */
export function getRessourcesBySequenceScope(
  sequenceId: string,
  scope: 'evaluation_finale'
): RessourceStructuree[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM ressources WHERE sequence_id = ? AND scope = ? ORDER BY created_at ASC')
    .all(sequenceId, scope) as any[]
  return rows.map(rowToRessource)
}

/** Récupère toutes les ressources liées à une activité. */
export function getRessourcesByActivite(activiteId: string): RessourceStructuree[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM ressources WHERE activite_id = ? ORDER BY created_at ASC')
    .all(activiteId) as any[]
  return rows.map(rowToRessource)
}

/** Récupère une ressource par son ID. */
export function getRessourceById(id: string): RessourceStructuree | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM ressources WHERE id = ?').get(id) as any
  return row ? rowToRessource(row) : null
}

/**
 * Récupère les deux versions d'une paire à partir de l'ID de l'une d'elles.
 * Retourne null si la ressource n'existe pas.
 */
export function getRessourcePaireById(id: string): RessourcePaire | null {
  const db = getDb()

  const row = db.prepare('SELECT * FROM ressources WHERE id = ?').get(id) as any
  if (!row) return null

  const resource = rowToRessource(row)

  // Trouver l'autre version via paired_with
  const pairedId = resource.paired_with
  const paired = pairedId
    ? (db.prepare('SELECT * FROM ressources WHERE id = ?').get(pairedId) as any)
    : null
  const pairedResource = paired ? rowToRessource(paired) : undefined

  // Identifier prof vs élève
  if (resource.audience === 'professeur') {
    return { professeur: resource, eleve: pairedResource }
  } else {
    // L'appelant a l'ID de la version élève — on retourne la paire dans le bon ordre
    return pairedResource
      ? { professeur: pairedResource, eleve: resource }
      : { professeur: resource } // fallback (ne devrait pas arriver)
  }
}

// ── Mise à jour partielle ──────────────────────────────────────────────────────

/**
 * Met à jour uniquement le contenu Markdown (et updated_at) d'une ressource.
 * Retourne la ressource mise à jour, ou null si l'ID est introuvable.
 */
export function updateRessourceMarkdown(id: string, markdown: string): RessourceStructuree | null {
  const db = getDb()
  const ts = now()

  const result = db
    .prepare('UPDATE ressources SET contenu_markdown = ?, updated_at = ? WHERE id = ?')
    .run(markdown, ts, id)

  if (result.changes === 0) return null

  const row = db.prepare('SELECT * FROM ressources WHERE id = ?').get(id) as any
  return row ? rowToRessource(row) : null
}

/**
 * Met à jour le contenu structuré (JSON) ET le Markdown dérivé d'une ressource.
 * Utilisé par l'éditeur de blocs (fiche_questions) : la source de vérité est le
 * JSON, le Markdown est régénéré pour rester cohérent (impression, fallback).
 * Retourne la ressource mise à jour, ou null si l'ID est introuvable.
 */
export function updateRessourceContenu(
  id: string,
  contenuJson: Record<string, unknown>,
  markdown: string
): RessourceStructuree | null {
  const db = getDb()
  const ts = now()

  const result = db
    .prepare('UPDATE ressources SET contenu_json = ?, contenu_markdown = ?, updated_at = ? WHERE id = ?')
    .run(toJson(contenuJson), markdown, ts, id)

  if (result.changes === 0) return null

  const row = db.prepare('SELECT * FROM ressources WHERE id = ?').get(id) as any
  return row ? rowToRessource(row) : null
}

// ── Suppression ────────────────────────────────────────────────────────────────

/**
 * Supprime une ressource, sa paire liée, et toutes les variantes différenciées
 * dérivées (de l'une ou l'autre version).
 * Retourne le nombre de ressources supprimées.
 */
export function deleteRessourcePaire(id: string): number {
  const db = getDb()

  const row = db.prepare('SELECT paired_with FROM ressources WHERE id = ?').get(id) as any
  if (!row) return 0

  const baseIds = [id, row.paired_with].filter(Boolean) as string[]
  // Variantes dérivées de l'une des deux versions (suppression explicite : ne pas
  // dépendre du PRAGMA foreign_keys, qui peut être désactivé selon la connexion).
  const variantIds = baseIds.flatMap((bid) =>
    (db.prepare('SELECT id FROM ressources WHERE derived_from = ?').all(bid) as any[]).map((r) => r.id)
  )
  const idsToDelete = Array.from(new Set([...baseIds, ...variantIds]))

  const tx = db.transaction(() => {
    let count = 0
    for (const rid of idsToDelete) {
      const result = db.prepare('DELETE FROM ressources WHERE id = ?').run(rid)
      count += result.changes
    }
    return count
  })

  return tx()
}

/** Supprime toutes les ressources d'une activité. */
export function deleteRessourcesByActivite(activiteId: string): number {
  const db = getDb()
  const result = db.prepare('DELETE FROM ressources WHERE activite_id = ?').run(activiteId)
  return result.changes
}

/**
 * Supprime toutes les ressources d'un scope séquence (pour régénération propre du
 * bundle évaluation finale). Retourne le nombre de ressources supprimées.
 */
export function deleteRessourcesBySequenceScope(
  sequenceId: string,
  scope: 'evaluation_finale'
): number {
  const db = getDb()
  const result = db
    .prepare('DELETE FROM ressources WHERE sequence_id = ? AND scope = ?')
    .run(sequenceId, scope)
  return result.changes
}

// ── Helper interne ─────────────────────────────────────────────────────────────

function rowToRessource(row: any): RessourceStructuree {
  return {
    id: row.id,
    activite_id: row.activite_id ?? undefined,
    sequence_id: row.sequence_id ?? undefined,
    scope: (row.scope as RessourceStructuree['scope']) ?? undefined,
    type: row.type as RessourceType,
    audience: row.audience as RessourceAudience,
    profil: (row.profil as RessourceStructuree['profil']) ?? undefined,
    derived_from: row.derived_from ?? undefined,
    paired_with: row.paired_with ?? undefined,
    contenu_json: fromJson<Record<string, unknown>>(row.contenu_json),
    contenu_markdown: row.contenu_markdown,
    created_at: row.created_at,
  }
}
