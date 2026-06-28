/**
 * Tests unitaires — enseignement explicite.
 *
 * Couvre l'assemblage des prompts (fonctions pures, sans LLM) :
 *   1. Le canevas en 5 phases n'est injecté QUE pour une séance en mode 'explicite'.
 *   2. Le prompt du conseiller pédagogique liste bien chaque séance par numéro.
 */

import { describe, it, expect } from 'vitest'
import { buildSeanceUserPrompt, EXPLICIT_CANVAS_BLOCK } from '../prompts/generator'
import { buildUserPrompt as buildAdvisorPrompt } from '../prompts/pedagogy-advisor'
import type { ArchitectOutput } from '@/shared/schemas'

const ARCH = {
  titre_sequence: 'La poésie lyrique',
  niveau: '4e',
  theme: 'poésie',
  objectifs: ['Identifier les figures de style', 'Écrire un poème'],
}

const SEANCE = { numero: 2, titre: 'La métaphore', duree: 55, objectifs: ['Reconnaître une métaphore'] }

describe('buildSeanceUserPrompt — injection du canevas explicite', () => {
  it("n'injecte pas le canevas en mode standard", () => {
    const prompt = buildSeanceUserPrompt(ARCH, SEANCE, '', 'standard')
    expect(prompt).not.toContain('CANEVAS EN 5 PHASES')
    expect(prompt).toContain('Séance n°2')
  })

  it('injecte le canevas en 5 phases en mode explicite', () => {
    const prompt = buildSeanceUserPrompt(ARCH, SEANCE, '', 'explicite')
    expect(prompt).toContain(EXPLICIT_CANVAS_BLOCK.trim().split('\n')[0])
    for (const phase of ['ouverture', 'modelage', 'pratique_guidee', 'pratique_autonome', 'cloture']) {
      expect(prompt).toContain(phase)
    }
  })

  it('mode standard par défaut quand non précisé', () => {
    expect(buildSeanceUserPrompt(ARCH, SEANCE, '')).not.toContain('CANEVAS EN 5 PHASES')
  })
})

describe('buildAdvisorPrompt — conseiller pédagogique', () => {
  it('liste chaque séance par numéro et titre', () => {
    const arch: ArchitectOutput = {
      titre_sequence: 'Séquence test',
      niveau: '5e',
      theme: 'roman',
      problematique: 'Pourquoi lire ?',
      objectifs: ['Lire'],
      competences: ['Comprendre'],
      seances: [
        { numero: 1, titre: 'Découverte', duree: 55, objectifs: ['Découvrir le genre'] },
        { numero: 2, titre: 'Atelier d\'écriture', duree: 55, objectifs: ['Réinvestir'] },
      ],
      evaluation_finale: null,
    }
    const prompt = buildAdvisorPrompt(arch)
    expect(prompt).toContain('Séance n°1')
    expect(prompt).toContain('Découverte')
    expect(prompt).toContain('Séance n°2')
    expect(prompt).toContain('Atelier d\'écriture')
  })
})
