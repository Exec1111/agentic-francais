/**
 * Tests unitaires — buildContextePedagogique + getProgrammeReperes
 *
 * Vérifie que le bloc de contexte injecté dans les prompts :
 *  - se dégrade proprement avec le contexte minimal
 *  - intègre tous les champs enrichis quand ils sont fournis
 *  - inclut les repères du programme officiel pour les niveaux reconnus
 */

import { describe, it, expect } from 'vitest'
import { buildContextePedagogique } from '../prompt-context'
import { getProgrammeReperes, normalizeNiveau } from '@/backend/pedagogie/programmes'
import type { ResourceGenerationContext } from '../registry'

const minimalCtx = (overrides: Partial<ResourceGenerationContext> = {}): ResourceGenerationContext => ({
  sequenceTitle: 'Le voyage en poésie',
  niveau: '5e',
  theme: 'Le voyage et l\'aventure',
  seanceNumero: 2,
  seanceTitle: 'Lecture de Heredia',
  activiteTitre: 'Analyse du sonnet',
  activiteType: 'lecture',
  activiteConsigne: 'Identifier les images du voyage',
  ressourceTitre: 'Fiche de lecture',
  corpusItem: null,
  ...overrides,
})

describe('buildContextePedagogique — contexte minimal', () => {
  it('contient séquence, niveau, thème, séance et activité', () => {
    const block = buildContextePedagogique(minimalCtx())
    expect(block).toContain('Le voyage en poésie')
    expect(block).toContain('5e')
    expect(block).toContain('Séance n°2')
    expect(block).toContain('Analyse du sonnet')
    expect(block).toContain('Identifier les images du voyage')
  })

  it("n'affiche pas les rubriques enrichies absentes", () => {
    const block = buildContextePedagogique(minimalCtx())
    expect(block).not.toContain('Problématique')
    expect(block).not.toContain('Progression de la séquence')
    expect(block).not.toContain('Autres activités')
  })
})

describe('buildContextePedagogique — contexte enrichi', () => {
  const enriched = minimalCtx({
    sequenceProblematique: 'Pourquoi partir vers l\'inconnu ?',
    sequenceObjectifs: ['Découvrir la poésie du voyage', 'Enrichir le lexique de la mer'],
    sequenceCompetences: ['Lire un poème à voix haute', 'Analyser une image poétique'],
    seanceObjectifs: ['Repérer les figures de style'],
    activiteDuree: 25,
    progression: [
      { numero: 1, titre: 'Embarquement' },
      { numero: 2, titre: 'Lecture de Heredia' },
      { numero: 3, titre: 'Écriture d\'un poème' },
    ],
    autresActivites: [{ titre: 'Dictée préparée', type: 'exercice', duree: 15 }],
  })

  it('intègre problématique, objectifs et compétences de la séquence', () => {
    const block = buildContextePedagogique(enriched)
    expect(block).toContain('Pourquoi partir vers l\'inconnu ?')
    expect(block).toContain('Découvrir la poésie du voyage ; Enrichir le lexique de la mer')
    expect(block).toContain('Lire un poème à voix haute')
  })

  it('affiche la progression avec la séance actuelle marquée', () => {
    const block = buildContextePedagogique(enriched)
    expect(block).toContain('Séance 1 : "Embarquement"')
    expect(block).toContain('[Séance 2 : "Lecture de Heredia" ← SÉANCE ACTUELLE]')
    expect(block).toContain('Séance 3 : "Écriture d\'un poème"')
  })

  it("mentionne la durée de l'activité et les autres activités de la séance", () => {
    const block = buildContextePedagogique(enriched)
    expect(block).toContain('durée prévue : 25 min')
    expect(block).toContain('"Dictée préparée" (exercice, 15 min)')
  })
})

describe('buildContextePedagogique — instructions complémentaires du professeur', () => {
  it("injecte le bloc d'instructions quand consignes est renseigné", () => {
    const block = buildContextePedagogique(minimalCtx({ consignes: 'Privilégie les QCM courts' }))
    expect(block).toContain('INSTRUCTIONS COMPLÉMENTAIRES DU PROFESSEUR')
    expect(block).toContain('Privilégie les QCM courts')
  })

  it('omet le bloc quand consignes est absent', () => {
    const block = buildContextePedagogique(minimalCtx())
    expect(block).not.toContain('INSTRUCTIONS COMPLÉMENTAIRES')
  })

  it("ignore des consignes composées uniquement d'espaces", () => {
    const block = buildContextePedagogique(minimalCtx({ consignes: '   \n  ' }))
    expect(block).not.toContain('INSTRUCTIONS COMPLÉMENTAIRES')
  })
})

describe('buildContextePedagogique — repères du programme officiel', () => {
  it('inclut les repères pour un niveau reconnu (5e)', () => {
    const block = buildContextePedagogique(minimalCtx({ niveau: '5e' }))
    expect(block).toContain('REPÈRES DU PROGRAMME OFFICIEL')
    expect(block).toContain('Le voyage et l\'aventure')
    expect(block).toContain('Calibrage')
  })

  it('reconnaît les variantes de saisie du niveau ("Première", "3ème")', () => {
    expect(buildContextePedagogique(minimalCtx({ niveau: 'Première' }))).toContain('EAF')
    expect(buildContextePedagogique(minimalCtx({ niveau: '3ème' }))).toContain('DNB')
  })

  it('omet la rubrique pour un niveau inconnu sans planter', () => {
    const block = buildContextePedagogique(minimalCtx({ niveau: 'CP' }))
    expect(block).not.toContain('REPÈRES DU PROGRAMME OFFICIEL')
    expect(block).toContain('CONTEXTE PÉDAGOGIQUE')
  })
})

describe('normalizeNiveau / getProgrammeReperes', () => {
  it('normalise les écritures courantes', () => {
    expect(normalizeNiveau('6ème')).toBe('6e')
    expect(normalizeNiveau('Cinquième')).toBe('5e')
    expect(normalizeNiveau('seconde')).toBe('2nde')
    expect(normalizeNiveau('1re')).toBe('1ere')
    expect(normalizeNiveau('Tle')).toBe('terminale')
  })

  it('retourne null pour un niveau inconnu', () => {
    expect(normalizeNiveau('CM2')).toBeNull()
    expect(getProgrammeReperes('CM2')).toBeNull()
  })

  it('chaque niveau du référentiel produit un bloc complet', () => {
    for (const niveau of ['6e', '5e', '4e', '3e', '2nde', '1ere', 'terminale']) {
      const reperes = getProgrammeReperes(niveau)
      expect(reperes, `repères manquants pour ${niveau}`).toBeTruthy()
      expect(reperes).toContain('Entrées du programme')
      expect(reperes).toContain('Calibrage de la difficulté')
    }
  })
})
