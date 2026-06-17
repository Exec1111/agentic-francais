import { getDb, newId, now, toJson, fromJson } from '@/backend/db'
import type { Sequence, Review, Seance, Activite, Ressource, ActionableSuggestion, SuggestionAction } from '@/shared/schemas'

/**
 * Normalise les suggestions stockées en base vers le format actionnable.
 * Rétrocompatibilité : les reviews enregistrées avant la refonte stockaient
 * des suggestions en texte libre (string[]). On les convertit en suggestions
 * non rattachées à une mutation (action "aucune").
 */
function normalizeSuggestions(raw: unknown): ActionableSuggestion[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s): ActionableSuggestion => {
    if (typeof s === 'string') {
      return { instruction: s, action: 'aucune', seance_numero: null, activite_titre: null }
    }
    const obj = (s ?? {}) as Record<string, unknown>
    return {
      instruction: String(obj.instruction ?? ''),
      action: (obj.action as SuggestionAction) ?? 'aucune',
      seance_numero: typeof obj.seance_numero === 'number' ? obj.seance_numero : null,
      activite_titre: typeof obj.activite_titre === 'string' ? obj.activite_titre : null,
    }
  })
}

// === Types de retour simplifiés ===

export interface SequenceSummary {
  id: string
  titre: string
  niveau: string
  theme: string
  createdAt: string
  seanceCount: number
}

export interface SequenceWithReview {
  sequence: Sequence
  review: Review | null
}

// === CRUD Séquences ===

/**
 * Sauvegarde ou met à jour une séquence complète (avec séances, activités, review).
 * Stratégie : upsert séquence, puis delete cascadé des anciennes séances/activités,
 * puis réinsertion.
 */
export function saveSequence(sequence: Sequence, review?: Review | null): string {
  const db = getDb()
  const seqId = sequence.id || newId()
  const timestamp = now()

  const insertSeq = db.prepare(`
    INSERT INTO sequences (id, titre, niveau, theme, problematique, evaluation_finale, objectifs, competences, corpus_refs, ressources, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      titre = excluded.titre,
      niveau = excluded.niveau,
      theme = excluded.theme,
      problematique = excluded.problematique,
      evaluation_finale = excluded.evaluation_finale,
      objectifs = excluded.objectifs,
      competences = excluded.competences,
      corpus_refs = excluded.corpus_refs,
      ressources = excluded.ressources,
      updated_at = excluded.updated_at
  `)

  // Transaction
  const tx = db.transaction(() => {
    // 1. Upsert séquence
    insertSeq.run(
      seqId,
      sequence.titre,
      sequence.niveau,
      sequence.theme,
      sequence.problematique ?? null,
      sequence.evaluation_finale ?? null,
      toJson(sequence.objectifs),
      toJson(sequence.competences),
      toJson(sequence.corpus_refs || []),
      toJson(sequence.ressources || []),
      sequence.createdAt ?? timestamp,
      timestamp
    )

    // 2. Supprimer anciennes séances (cascade vers activités)
    db.prepare('DELETE FROM seances WHERE sequence_id = ?').run(seqId)

    // 3. Insérer nouvelles séances et activités
    for (const seance of sequence.seances) {
      const seanceId = seance.id || newId()
      db.prepare(`
        INSERT INTO seances (id, sequence_id, numero, titre, duree, objectifs, evaluation, ressources)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        seanceId,
        seqId,
        seance.numero,
        seance.titre,
        seance.duree,
        toJson(seance.objectifs),
        seance.evaluation ?? null,
        toJson(seance.ressources || [])
      )

      for (const activite of seance.activites) {
        db.prepare(`
          INSERT INTO activites (id, seance_id, titre, type, duree, consigne, supports, differenciation, ressources, corpus_ref, corpus_refs, corpus_status, corpus_suggestion)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          activite.id || newId(),
          seanceId,
          activite.titre,
          activite.type,
          activite.duree,
          activite.consigne,
          toJson(activite.supports || []),
          activite.differenciation ?? null,
          toJson(activite.ressources || []),
          activite.corpus_refs?.[0] ?? activite.corpus_ref ?? null,
          toJson(activite.corpus_refs ?? (activite.corpus_ref ? [activite.corpus_ref] : [])),
          activite.corpus_status ?? null,
          activite.corpus_suggestion ? toJson(activite.corpus_suggestion) : null
        )
      }
    }

    // 4. Sauvegarder la review si présente
    if (review) {
      saveReviewTx(db, seqId, review)
    }
  })

  tx()
  return seqId
}

function saveReviewTx(db: ReturnType<typeof getDb>, sequenceId: string, review: Review) {
  const reviewId = newId()

  // Supprimer ancienne review
  db.prepare('DELETE FROM reviews WHERE sequence_id = ?').run(sequenceId)

  db.prepare(`
    INSERT INTO reviews (id, sequence_id, score_qualite, resume, suggestions)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    reviewId,
    sequenceId,
    review.score_qualite,
    review.resume,
    toJson(review.suggestions)
  )

  for (const probleme of review.problemes) {
    db.prepare(`
      INSERT INTO review_problemes (id, review_id, type, description, seance_concernee, suggestions)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      newId(),
      reviewId,
      probleme.type,
      probleme.description,
      probleme.seance_concernee ?? null,
      toJson(probleme.suggestions ?? [])
    )
  }
}

/**
 * Récupère une séquence complète avec ses séances, activités et review.
 */
export function getSequenceById(id: string): SequenceWithReview | null {
  const db = getDb()

  // Séquence
  const row = db.prepare('SELECT * FROM sequences WHERE id = ?').get(id) as any
  if (!row) return null

  const sequence: Sequence = {
    id: row.id,
    titre: row.titre,
    niveau: row.niveau,
    theme: row.theme,
    problematique: row.problematique ?? undefined,
    evaluation_finale: row.evaluation_finale ?? undefined,
    objectifs: fromJson<string[]>(row.objectifs),
    competences: fromJson<string[]>(row.competences),
    corpus_refs: fromJson<string[]>(row.corpus_refs ?? '[]'),
    seances: [],
    ressources: fromJson<Ressource[]>(row.ressources),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  // Séances
  const seanceRows = db.prepare('SELECT * FROM seances WHERE sequence_id = ? ORDER BY numero').all(id) as any[]
  for (const sr of seanceRows) {
    const seance: Seance = {
      id: sr.id,
      sequenceId: sr.sequence_id,
      numero: sr.numero,
      titre: sr.titre,
      duree: sr.duree,
      objectifs: fromJson<string[]>(sr.objectifs),
      evaluation: sr.evaluation ?? undefined,
      activites: [],
      ressources: fromJson<Ressource[]>(sr.ressources),
    }

    // Activités
    const actRows = db.prepare('SELECT * FROM activites WHERE seance_id = ? ORDER BY rowid').all(sr.id) as any[]
    for (const ar of actRows) {
      seance.activites.push({
        id: ar.id,
        seanceId: ar.seance_id,
        titre: ar.titre,
        type: ar.type as Activite['type'],
        duree: ar.duree,
        consigne: ar.consigne,
        supports: fromJson<string[]>(ar.supports),
        differenciation: ar.differenciation ?? undefined,
        ressources: fromJson<Ressource[]>(ar.ressources),
        corpus_refs: fromJson<string[]>(ar.corpus_refs ?? '[]').length
          ? fromJson<string[]>(ar.corpus_refs ?? '[]')
          : (ar.corpus_ref ? [ar.corpus_ref as string] : []),
        corpus_ref: ar.corpus_ref ?? undefined,
        corpus_status: ar.corpus_status ?? undefined,
        corpus_suggestion: ar.corpus_suggestion ? fromJson(ar.corpus_suggestion) : undefined,
      })
    }

    sequence.seances.push(seance)
  }

  // Review
  const review = loadReview(db, id)

  return { sequence, review }
}

function loadReview(db: ReturnType<typeof getDb>, sequenceId: string): Review | null {
  const rRow = db.prepare('SELECT * FROM reviews WHERE sequence_id = ?').get(sequenceId) as any
  if (!rRow) return null

  const problemeRows = db.prepare('SELECT * FROM review_problemes WHERE review_id = ?').all(rRow.id) as any[]

  return {
    score_qualite: rRow.score_qualite,
    resume: rRow.resume,
    suggestions: normalizeSuggestions(fromJson<unknown[]>(rRow.suggestions)),
    problemes: problemeRows.map((p) => ({
      type: p.type as Review['problemes'][number]['type'],
      description: p.description,
      seance_concernee: p.seance_concernee ?? null,
      suggestions: normalizeSuggestions(fromJson<unknown[]>(p.suggestions ?? '[]')),
    })),
  }
}

/**
 * Liste toutes les séquences (version allégée, sans contenu).
 */
export function listSequences(): SequenceSummary[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT s.id, s.titre, s.niveau, s.theme, s.created_at,
           COUNT(DISTINCT se.id) as seance_count
    FROM sequences s
    LEFT JOIN seances se ON se.sequence_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).all() as any[]

  return rows.map((r) => ({
    id: r.id,
    titre: r.titre,
    niveau: r.niveau,
    theme: r.theme,
    createdAt: r.created_at,
    seanceCount: r.seance_count,
  }))
}

/**
 * Supprime une séquence et tout son contenu (cascade SQL).
 */
export function deleteSequence(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM sequences WHERE id = ?').run(id)
  return result.changes > 0
}
