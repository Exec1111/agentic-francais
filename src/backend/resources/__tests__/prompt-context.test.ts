/**
 * Tests unitaires — buildContextePedagogique + getProgrammeReperes
 *
 * Vérifie que le bloc de contexte injecté dans les prompts :
 *  - se dégrade proprement avec le contexte minimal
 *  - intègre tous les champs enrichis quand ils sont fournis
 *  - inclut les repères du programme officiel pour les niveaux reconnus
 */

import { describe, it, expect } from 'vitest'
import { buildContextePedagogique, buildSequenceDigest, buildSeanceDigest } from '../prompt-context'
import { getProgrammeReperes, normalizeNiveau } from '@/backend/pedagogie/programmes'
import type { ResourceGenerationContext } from '../registry'
import type { Sequence, RessourceStructuree } from '@/shared/schemas'

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

// ── buildSequenceDigest (évaluation finale) ───────────────────────────────────

describe('buildSequenceDigest', () => {
  const sequence = (): Sequence => ({
    id: 'seq-1',
    titre: 'Le récit d\'aventure',
    niveau: '5e',
    theme: 'Le voyage et l\'aventure',
    problematique: 'Pourquoi partir vers l\'inconnu ?',
    objectifs: ['Comprendre le schéma narratif'],
    competences: ['Lire un récit', 'Rédiger un récit'],
    corpus_refs: [],
    ressources: [],
    seances: [
      {
        numero: 1, titre: 'Le départ', duree: 55, objectifs: ['Repérer la situation initiale'], ressources: [],
        activites: [{ id: 'act-1', titre: 'Étude du schéma narratif', type: 'lecture', duree: 30, consigne: '', corpus_refs: [], ressources: [] }],
      },
    ],
    evaluation_finale: 'Contrôle de lecture et rédaction',
  })

  const res = (over: Partial<RessourceStructuree>): RessourceStructuree => ({
    id: 'r1', type: 'cours', audience: 'professeur',
    contenu_json: {}, contenu_markdown: 'Le schéma narratif comporte cinq étapes.', ...over,
  })

  it('liste le déroulé, les objectifs et les compétences', () => {
    const d = buildSequenceDigest(sequence())
    expect(d).toContain('Le récit d\'aventure')
    expect(d).toContain('Compétences travaillées (à évaluer) : Lire un récit ; Rédiger un récit')
    expect(d).toContain('Activité "Étude du schéma narratif" (lecture)')
  })

  it('injecte le contenu des ressources produites et invite à s\'appuyer dessus', () => {
    const d = buildSequenceDigest(sequence(), [], {
      'act-1': [res({ contenu_markdown: 'NOTION_CLE : le schéma narratif en cinq étapes.' })],
    })
    expect(d).toContain('Ressource « cours »')
    expect(d).toContain('NOTION_CLE')
    expect(d).toContain('imite le FORMAT')
  })

  it('plafonne le contenu d\'une ressource trop longue', () => {
    const long = 'A'.repeat(5000)
    const d = buildSequenceDigest(sequence(), [], { 'act-1': [res({ contenu_markdown: long })] })
    expect(d).toContain('[contenu tronqué]')
    expect(d).not.toContain('A'.repeat(2000))
  })

  it('sans ressources, n\'affiche pas l\'invite d\'appui', () => {
    const d = buildSequenceDigest(sequence())
    expect(d).not.toContain('imite le FORMAT')
  })
})

// ── buildSeanceDigest (fiche de préparation) ──────────────────────────────────

describe('buildSeanceDigest', () => {
  const sequence = (): Sequence => ({
    id: 'seq-1',
    titre: 'Le récit d\'aventure',
    niveau: '5e',
    theme: 'Le voyage et l\'aventure',
    problematique: 'Pourquoi partir vers l\'inconnu ?',
    objectifs: ['Comprendre le schéma narratif'],
    competences: ['Lire un récit'],
    corpus_refs: [],
    ressources: [],
    seances: [
      { id: 'sea-1', numero: 1, titre: 'Le départ', duree: 55, objectifs: [], activites: [], ressources: [] },
      {
        id: 'sea-2', numero: 2, titre: 'Le schéma narratif', duree: 55,
        objectifs: ['Identifier les cinq étapes'], mode_pedagogique: 'explicite', ressources: [],
        activites: [
          {
            id: 'act-1', titre: 'Étude guidée', type: 'lecture', duree: 30,
            consigne: 'Repérer les étapes du récit', phase: 'pratique_guidee',
            differenciation: 'Texte raccourci pour le groupe allégé',
            corpus_refs: [], ressources: [],
          },
        ],
      },
      { id: 'sea-3', numero: 3, titre: 'Écriture', duree: 55, objectifs: [], activites: [], ressources: [] },
    ],
  })

  const seanceOf = (seq: Sequence, numero: number) => seq.seances.find((s) => s.numero === numero)!

  it('situe la séance dans la progression (précédente / suivante)', () => {
    const seq = sequence()
    const d = buildSeanceDigest(seq, seanceOf(seq, 2))
    expect(d).toContain('séance 2/3')
    expect(d).toContain('précédente : "Le départ"')
    expect(d).toContain('suivante : "Écriture"')
  })

  it('signale la première et la dernière séance', () => {
    const seq = sequence()
    expect(buildSeanceDigest(seq, seanceOf(seq, 1))).toContain('première séance de la séquence')
    expect(buildSeanceDigest(seq, seanceOf(seq, 3))).toContain('dernière séance de la séquence')
  })

  it('liste les activités avec leur id, leur phase et leur consigne', () => {
    const seq = sequence()
    const d = buildSeanceDigest(seq, seanceOf(seq, 2))
    expect(d).toContain('[id: act-1] "Étude guidée" (lecture, 30 min | phase : pratique_guidee)')
    expect(d).toContain('Consigne : Repérer les étapes du récit')
    expect(d).toContain('Différenciation prévue : Texte raccourci')
  })

  it('mentionne le mode pédagogique (canevas explicite)', () => {
    const seq = sequence()
    expect(buildSeanceDigest(seq, seanceOf(seq, 2))).toContain('ENSEIGNEMENT EXPLICITE')
    expect(buildSeanceDigest(seq, seanceOf(seq, 1))).toContain('Mode pédagogique : standard')
  })

  it('injecte le contenu des ressources produites et invite à s\'appuyer dessus', () => {
    const seq = sequence()
    const d = buildSeanceDigest(seq, seanceOf(seq, 2), [], {
      'act-1': [{
        id: 'r1', type: 'cours', audience: 'professeur',
        contenu_json: {}, contenu_markdown: 'NOTION_CLE : les cinq étapes du récit.',
      }],
    })
    expect(d).toContain('Ressource « cours »')
    expect(d).toContain('NOTION_CLE')
    expect(d).toContain('la trace écrite reprend les notions du cours')
  })

  it('signale une séance sans activités au lieu de produire un bloc vide', () => {
    const seq = sequence()
    const d = buildSeanceDigest(seq, seanceOf(seq, 1))
    expect(d).toContain('aucune activité définie')
  })

  it('inclut les repères du programme du niveau', () => {
    const seq = sequence()
    expect(buildSeanceDigest(seq, seanceOf(seq, 2))).toContain('REPÈRES DU PROGRAMME OFFICIEL')
  })
})
