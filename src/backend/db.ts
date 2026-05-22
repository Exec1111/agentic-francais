import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

// === Configuration ===

const DB_PATH = path.join(process.cwd(), 'data', 'atelier.db')

// Singleton
let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
  }
  return db
}

// === Système de migrations ===

interface Migration {
  version: number
  name: string
  sql: string
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      -- Séquences pédagogiques
      CREATE TABLE IF NOT EXISTS sequences (
        id            TEXT PRIMARY KEY,
        titre         TEXT NOT NULL,
        niveau        TEXT NOT NULL,
        theme         TEXT NOT NULL,
        problematique TEXT,
        evaluation_finale TEXT,
        objectifs     TEXT NOT NULL DEFAULT '[]',
        competences   TEXT NOT NULL DEFAULT '[]',
        ressources    TEXT NOT NULL DEFAULT '[]',
        created_at    TEXT DEFAULT (datetime('now')),
        updated_at    TEXT DEFAULT (datetime('now'))
      );

      -- Séances
      CREATE TABLE IF NOT EXISTS seances (
        id            TEXT PRIMARY KEY,
        sequence_id   TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
        numero        INTEGER NOT NULL,
        titre         TEXT NOT NULL,
        duree         INTEGER DEFAULT 55,
        objectifs     TEXT NOT NULL DEFAULT '[]',
        evaluation    TEXT,
        ressources    TEXT NOT NULL DEFAULT '[]',
        created_at    TEXT DEFAULT (datetime('now'))
      );

      -- Activités
      CREATE TABLE IF NOT EXISTS activites (
        id            TEXT PRIMARY KEY,
        seance_id     TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
        titre         TEXT NOT NULL,
        type          TEXT NOT NULL,
        duree         INTEGER NOT NULL,
        consigne      TEXT NOT NULL,
        supports      TEXT DEFAULT '[]',
        differenciation TEXT,
        ressources    TEXT NOT NULL DEFAULT '[]',
        created_at    TEXT DEFAULT (datetime('now'))
      );

      -- Reviews qualité
      CREATE TABLE IF NOT EXISTS reviews (
        id            TEXT PRIMARY KEY,
        sequence_id   TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
        score_qualite INTEGER NOT NULL,
        resume        TEXT NOT NULL,
        suggestions   TEXT NOT NULL DEFAULT '[]',
        created_at    TEXT DEFAULT (datetime('now'))
      );

      -- Problèmes identifiés par le reviewer
      CREATE TABLE IF NOT EXISTS review_problemes (
        id            TEXT PRIMARY KEY,
        review_id     TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        type          TEXT NOT NULL,
        description   TEXT NOT NULL,
        seance_concernee INTEGER
      );

      -- Index
      CREATE INDEX IF NOT EXISTS idx_seances_sequence ON seances(sequence_id);
      CREATE INDEX IF NOT EXISTS idx_activites_seance ON activites(seance_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_sequence ON reviews(sequence_id);
      CREATE INDEX IF NOT EXISTS idx_sequences_created ON sequences(created_at);
    `,
  },
  // --- Ajouter les futures migrations ici ---
  // {
  //   version: 2,
  //   name: 'add_column_example',
  //   sql: `ALTER TABLE sequences ADD COLUMN description TEXT;`,
  // },
]

function runMigrations(db: Database.Database) {
  // Table de suivi des migrations
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TEXT DEFAULT (datetime('now'))
    );
  `)

  const currentVersion = (
    db.prepare('SELECT MAX(version) as v FROM _migrations').get() as any
  )?.v ?? 0

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion)

  if (pending.length === 0) return

  console.log(`[DB] ${pending.length} migration(s) à appliquer (v${currentVersion} → v${pending[pending.length - 1].version})`)

  const applyAll = db.transaction(() => {
    for (const migration of pending) {
      console.log(`[DB] Migration v${migration.version}: ${migration.name}`)
      db.exec(migration.sql)
      db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name
      )
    }
  })

  applyAll()
  console.log(`[DB] Migrations terminées ✓`)
}

// === Helpers ===

export function now(): string {
  return new Date().toISOString()
}

export function newId(): string {
  return uuidv4()
}

export function toJson<T>(value: T): string {
  return JSON.stringify(value)
}

export function fromJson<T>(json: string): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return [] as unknown as T
  }
}
