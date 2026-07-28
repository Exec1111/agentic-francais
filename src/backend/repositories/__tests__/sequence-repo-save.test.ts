/**
 * Tests d'intégration — saveSequence (persistance sur base SQLite jetable)
 *
 * Régression critique (doc/fiche-preparation.md §2) : l'ancien saveSequence
 * supprimait puis réinsérait toutes les séances ; les FK ON DELETE CASCADE
 * détruisaient TOUTES les ressources générées (activités, fiche de préparation)
 * à chaque sauvegarde. La nouvelle implémentation upsert les lignes conservées
 * et ne supprime que celles réellement retirées de la séquence.
 *
 * Le module db.ts calcule DB_PATH depuis process.cwd() au chargement : on bascule
 * dans un répertoire temporaire AVANT l'import dynamique pour travailler sur une
 * base vierge (migrations appliquées automatiquement). Vitest exécute chaque
 * fichier de test dans un process isolé (pool 'forks') → pas d'interférence.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { Sequence, RessourceStructuree } from '@/shared/schemas'

let sequenceRepo: typeof import('../sequence-repo')
let resourceRepo: typeof import('../resource-repo')
let dbModule: typeof import('../../db')

let tmpDir: string
let originalCwd: string

beforeAll(async () => {
  originalCwd = process.cwd()
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-vitest-'))
  process.chdir(tmpDir)
  // Imports APRÈS chdir : db.ts fige DB_PATH sur le cwd courant
  dbModule = await import('../../db')
  sequenceRepo = await import('../sequence-repo')
  resourceRepo = await import('../resource-repo')
})

afterAll(() => {
  try { dbModule.getDb().close() } catch { /* déjà fermée */ }
  process.chdir(originalCwd)
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* fichiers WAL verrouillés sous Windows */ }
})

const makeSequence = (): Sequence => ({
  id: 'seq-1',
  titre: 'Le récit d\'aventure',
  niveau: '5e',
  theme: 'Le voyage et l\'aventure',
  objectifs: ['Comprendre le schéma narratif'],
  competences: ['Lire un récit'],
  corpus_refs: [],
  ressources: [],
  seances: [
    {
      id: 'sea-1', numero: 1, titre: 'Le départ', duree: 55,
      objectifs: ['Repérer la situation initiale'], ressources: [],
      activites: [
        { id: 'act-1', titre: 'Lecture', type: 'lecture', duree: 30, consigne: 'Lire', corpus_refs: [], ressources: [] },
        { id: 'act-2', titre: 'Exercice', type: 'exercice', duree: 25, consigne: 'Faire', corpus_refs: [], ressources: [] },
      ],
    },
    {
      id: 'sea-2', numero: 2, titre: 'Les péripéties', duree: 55,
      objectifs: [], ressources: [], activites: [],
    },
  ],
})

const makeRessource = (over: Partial<RessourceStructuree>): RessourceStructuree => ({
  id: 'r-act',
  type: 'cours',
  audience: 'professeur',
  contenu_json: { titre: 'Cours' },
  contenu_markdown: '# Cours',
  scope: 'activite',
  ...over,
})

describe('saveSequence — préservation des ressources au re-save', () => {
  it('conserve les ressources d\'activité et de séance après une re-sauvegarde', () => {
    sequenceRepo.saveSequence(makeSequence())

    resourceRepo.saveRessource(makeRessource({ id: 'r-act', activite_id: 'act-1' }))
    resourceRepo.saveRessource(makeRessource({
      id: 'r-fiche', type: 'fiche_preparation', seance_id: 'sea-1', scope: 'seance',
      contenu_json: { titre: 'Fiche', seance_checksum: 'abcd1234' },
    }))

    // Re-save (édition du titre) — l'ancien code détruisait tout ici
    const edited = makeSequence()
    edited.seances[0].titre = 'Le grand départ'
    sequenceRepo.saveSequence(edited)

    expect(resourceRepo.getRessourcesByActivite('act-1')).toHaveLength(1)
    expect(resourceRepo.getRessourcesBySeanceScope('sea-1', 'seance')).toHaveLength(1)

    // Et la modification est bien persistée
    const reloaded = sequenceRepo.getSequenceById('seq-1')!
    expect(reloaded.sequence.seances[0].titre).toBe('Le grand départ')
  })

  it('supprime les ressources d\'une activité réellement retirée (cascade légitime)', () => {
    const edited = makeSequence()
    edited.seances[0].activites = edited.seances[0].activites.filter((a) => a.id !== 'act-1')
    sequenceRepo.saveSequence(edited)

    expect(resourceRepo.getRessourcesByActivite('act-1')).toHaveLength(0)
    // La fiche de la séance (non retirée) survit
    expect(resourceRepo.getRessourcesBySeanceScope('sea-1', 'seance')).toHaveLength(1)
  })

  it('supprime la fiche de préparation quand la séance est retirée (cascade légitime)', () => {
    const edited = makeSequence()
    edited.seances = edited.seances.filter((s) => s.id !== 'sea-1')
    sequenceRepo.saveSequence(edited)

    expect(resourceRepo.getRessourcesBySeanceScope('sea-1', 'seance')).toHaveLength(0)
    const reloaded = sequenceRepo.getSequenceById('seq-1')!
    expect(reloaded.sequence.seances).toHaveLength(1)
    expect(reloaded.sequence.seances[0].id).toBe('sea-2')
  })
})

describe('saveSequence — ordre des activités (colonne position)', () => {
  it('persiste le réordonnancement des activités', () => {
    // Repart d'une séquence propre
    const seq = { ...makeSequence(), id: 'seq-2' }
    seq.seances = seq.seances.map((s, i) => ({
      ...s,
      id: `s2-sea-${i}`,
      activites: s.activites.map((a, j) => ({ ...a, id: `s2-act-${i}-${j}` })),
    }))
    sequenceRepo.saveSequence(seq)

    // Inverse l'ordre des deux activités de la première séance et re-save
    const reordered = JSON.parse(JSON.stringify(seq)) as Sequence
    reordered.seances[0].activites = [
      reordered.seances[0].activites[1],
      reordered.seances[0].activites[0],
    ]
    sequenceRepo.saveSequence(reordered)

    const reloaded = sequenceRepo.getSequenceById('seq-2')!
    expect(reloaded.sequence.seances[0].activites.map((a) => a.id)).toEqual([
      's2-act-0-1',
      's2-act-0-0',
    ])
  })
})
