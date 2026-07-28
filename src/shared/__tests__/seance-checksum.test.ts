/**
 * Tests unitaires — computeSeanceChecksum (détection de dérive de la fiche de préparation)
 *
 * Le checksum doit :
 *  - être stable pour un contenu pédagogique identique
 *  - changer quand un champ qui invalide le déroulé change (titre, durée, mode,
 *    objectifs, activités : titre/type/durée/consigne/phase, ordre)
 *  - IGNORER les champs sans impact sur le déroulé (corpus_status, ressources…)
 */

import { describe, it, expect } from 'vitest'
import { computeSeanceChecksum } from '../seance-checksum'
import type { Seance } from '../schemas'

const seance = (over: Partial<Seance> = {}): Seance => ({
  id: 'sea-1',
  numero: 1,
  titre: 'Le départ',
  duree: 55,
  objectifs: ['Repérer la situation initiale'],
  mode_pedagogique: 'explicite',
  activites: [
    {
      id: 'act-1', titre: 'Étude du schéma narratif', type: 'lecture', duree: 30,
      consigne: 'Lire et repérer les étapes', phase: 'modelage', corpus_refs: [], ressources: [],
    },
    {
      id: 'act-2', titre: 'Exercice d\'application', type: 'exercice', duree: 20,
      consigne: 'Compléter le tableau', phase: 'pratique_guidee', corpus_refs: [], ressources: [],
    },
  ],
  ressources: [],
  ...over,
})

describe('computeSeanceChecksum — stabilité', () => {
  it('produit le même checksum pour deux séances identiques', () => {
    expect(computeSeanceChecksum(seance())).toBe(computeSeanceChecksum(seance()))
  })

  it('produit un hexadécimal de 8 caractères', () => {
    expect(computeSeanceChecksum(seance())).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('computeSeanceChecksum — sensibilité aux champs du déroulé', () => {
  const base = computeSeanceChecksum(seance())

  it('change si le titre de la séance change', () => {
    expect(computeSeanceChecksum(seance({ titre: 'L\'arrivée' }))).not.toBe(base)
  })

  it('change si la durée change', () => {
    expect(computeSeanceChecksum(seance({ duree: 110 }))).not.toBe(base)
  })

  it('change si le mode pédagogique change', () => {
    expect(computeSeanceChecksum(seance({ mode_pedagogique: 'standard' }))).not.toBe(base)
  })

  it('change si les objectifs changent', () => {
    expect(computeSeanceChecksum(seance({ objectifs: ['Autre objectif'] }))).not.toBe(base)
  })

  it("change si la consigne d'une activité change", () => {
    const s = seance()
    s.activites[0] = { ...s.activites[0], consigne: 'Nouvelle consigne' }
    expect(computeSeanceChecksum(s)).not.toBe(base)
  })

  it('change si une activité est ajoutée', () => {
    const s = seance()
    s.activites.push({
      titre: 'Bilan', type: 'oral', duree: 5, consigne: '', corpus_refs: [], ressources: [],
    })
    expect(computeSeanceChecksum(s)).not.toBe(base)
  })

  it('change si les activités sont réordonnées', () => {
    const s = seance()
    s.activites = [s.activites[1], s.activites[0]]
    expect(computeSeanceChecksum(s)).not.toBe(base)
  })
})

describe('computeSeanceChecksum — insensibilité aux champs hors déroulé', () => {
  const base = computeSeanceChecksum(seance())

  it('ignore corpus_status et corpus_refs des activités', () => {
    const s = seance()
    s.activites[0] = { ...s.activites[0], corpus_status: 'trouve', corpus_refs: ['corpus-42'] }
    expect(computeSeanceChecksum(s)).toBe(base)
  })

  it('ignore les ressources et la recommandation pédagogique', () => {
    const s = seance({
      pedagogie_reco: { recommande: true, justification: 'Notion nouvelle' },
      ressources: [{ id: 'r1', titre: 'X', type: 'cours', status: 'ready', contenu: '' }],
    })
    expect(computeSeanceChecksum(s)).toBe(base)
  })

  it("ignore l'id et le numéro de la séance (stables par ailleurs)", () => {
    expect(computeSeanceChecksum(seance({ id: 'autre-id', numero: 7 }))).toBe(base)
  })
})
