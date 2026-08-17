/**
 * Tests unitaires — type de ressource fiche_preparation
 *
 * Vérifie :
 *  - l'enregistrement dans le registre (TEACHER_ONLY, jamais suggéré)
 *  - l'injection du checksum par postProcess (donnée de référence : par code,
 *    jamais par le LLM)
 *  - le prompt (digest, canevas explicite conditionnel, consignes)
 *  - le rendu Markdown (bornes de temps cumulées, sections, tri par ordre)
 */

import { describe, it, expect } from 'vitest'
import { fichePreparationDefinition, renderFichePreparationMarkdown } from '../types/fiche-preparation'
import { getResourceDefinition } from '../registry'
import { FichePreparationContenuSchema, type FichePreparationContenu } from '@/shared/resource-schemas'
import type { ResourceGenerationContext } from '../registry'

const contenu = (over: Partial<FichePreparationContenu> = {}): FichePreparationContenu => ({
  titre: 'Séance 2 — Le schéma narratif',
  place_dans_sequence: 'Après la découverte du genre, cette séance installe l\'outil d\'analyse central.',
  objectifs: ['Identifier les cinq étapes du schéma narratif'],
  prerequis: ['Notions de personnage et de narrateur'],
  materiel_global: ['Photocopies du texte', 'Vidéoprojecteur'],
  deroule: [
    {
      ordre: 1, intitule: 'Accueil et annonce des objectifs', duree_min: 10,
      phase: 'ouverture', activite_id: null, modalite: 'collectif',
      role_enseignant: 'Écrire l\'objectif au tableau et interroger : « Que se passe-t-il au début d\'un conte ? »',
      role_eleves: 'Répondent à l\'oral, réactivent la séance précédente.',
      trace_ecrite: 'Objectif du jour : le schéma narratif',
      difficultes_anticipees: null, materiel: null,
      transition: 'Distribuer le texte support.',
    },
    {
      ordre: 2, intitule: 'Étude guidée du texte', duree_min: 30,
      phase: 'pratique_guidee', activite_id: 'act-1', modalite: 'binomes',
      role_enseignant: 'Circuler, demander : « Où commence l\'élément perturbateur ? »',
      role_eleves: 'Surlignent les étapes dans le texte.',
      trace_ecrite: 'Tableau des 5 étapes complété collectivement',
      difficultes_anticipees: [
        { difficulte: 'Confusion élément perturbateur / péripéties', remediation: 'Revenir au conte étudié en séance 1.' },
      ],
      materiel: ['Surligneurs'], transition: null,
    },
  ],
  differenciation: 'Texte raccourci pour le groupe allégé.',
  points_vigilance: ['Le passage au travail en binômes est bruyant'],
  prolongements: 'Pour la prochaine séance : lire le chapitre 2.',
  seance_checksum: null,
  ...over,
})

const ctx = (over: Partial<ResourceGenerationContext> = {}): ResourceGenerationContext => ({
  sequenceTitle: 'Le récit d\'aventure',
  niveau: '5e',
  theme: 'Le voyage et l\'aventure',
  seanceNumero: 2,
  seanceTitle: 'Le schéma narratif',
  activiteTitre: 'Fiche de préparation',
  activiteType: 'exercice',
  activiteConsigne: '',
  ressourceTitre: 'Fiche de préparation — Séance 2',
  seanceDigest: 'SÉANCE À PRÉPARER (contenu complet) :\n- [id: act-1] "Étude guidée"',
  seanceChecksum: 'abcd1234',
  ...over,
})

describe('fiche_preparation — enregistrement et catégorie', () => {
  it('est enregistré dans le registre', () => {
    expect(getResourceDefinition('fiche_preparation')).toBe(fichePreparationDefinition)
  })

  it('est TEACHER_ONLY : pas de version élève, pas de renderer élève', () => {
    expect(fichePreparationDefinition.category).toBe('TEACHER_ONLY')
    expect(fichePreparationDefinition.toStudentVersion).toBeUndefined()
    expect(fichePreparationDefinition.toMarkdown.eleve).toBeUndefined()
  })

  it("n'est jamais suggéré au niveau activité (déclenché par le bouton séance)", () => {
    expect(fichePreparationDefinition.suggestedFor).toEqual([])
  })

  it('le contenu de test est valide vis-à-vis du schéma', () => {
    expect(FichePreparationContenuSchema.safeParse(contenu()).success).toBe(true)
  })
})

describe('fiche_preparation — postProcess (checksum anti-dérive)', () => {
  it('injecte le checksum du contexte (le LLM a laissé null)', () => {
    const out = fichePreparationDefinition.postProcess!(contenu(), ctx())
    expect(out.seance_checksum).toBe('abcd1234')
  })

  it('écrase une valeur inventée par le LLM', () => {
    const out = fichePreparationDefinition.postProcess!(
      contenu({ seance_checksum: 'invention-du-llm' }),
      ctx()
    )
    expect(out.seance_checksum).toBe('abcd1234')
  })

  it('retombe sur null si le contexte ne fournit pas de checksum', () => {
    const out = fichePreparationDefinition.postProcess!(contenu(), ctx({ seanceChecksum: undefined }))
    expect(out.seance_checksum).toBeNull()
  })
})

describe('fiche_preparation — buildPrompt', () => {
  it('injecte le digest de la séance et la consigne de recopie des ids', () => {
    const messages = fichePreparationDefinition.buildPrompt(ctx())
    const system = messages[0].content
    expect(system).toContain('SÉANCE À PRÉPARER')
    expect(system).toContain('[id: act-1]')
    expect(system).toContain('recopie EXACTEMENT son id')
  })

  it('ajoute le canevas explicite uniquement en mode explicite', () => {
    const explicite = fichePreparationDefinition.buildPrompt(ctx({ modePedagogique: 'explicite' }))[0].content
    const standard = fichePreparationDefinition.buildPrompt(ctx({ modePedagogique: 'standard' }))[0].content
    expect(explicite).toContain('ENSEIGNEMENT EXPLICITE')
    expect(explicite).toContain('worked example')
    expect(standard).not.toContain('worked example')
    expect(standard).toContain('"phase" reste null')
  })

  it('relaie les instructions complémentaires du professeur', () => {
    const messages = fichePreparationDefinition.buildPrompt(ctx({ consignes: 'Classe agitée en fin de journée' }))
    expect(messages[1].content).toContain('INSTRUCTIONS COMPLÉMENTAIRES DU PROFESSEUR')
    expect(messages[1].content).toContain('Classe agitée en fin de journée')
  })
})

describe('fiche_preparation — rendu Markdown', () => {
  it('calcule les bornes de temps cumulées', () => {
    const md = renderFichePreparationMarkdown(contenu())
    expect(md).toContain('min 0–10 — Accueil et annonce des objectifs')
    expect(md).toContain('min 10–40 — Étude guidée du texte')
    expect(md).toContain('Durée totale du déroulé : 40 min')
  })

  it('trie les moments par ordre même si le tableau est désordonné', () => {
    const c = contenu()
    c.deroule = [c.deroule[1], c.deroule[0]]
    const md = renderFichePreparationMarkdown(c)
    expect(md.indexOf('Accueil et annonce')).toBeLessThan(md.indexOf('Étude guidée'))
    expect(md).toContain('min 0–10 — Accueil')
  })

  it('affiche trace écrite, difficultés, transition et sections de pied', () => {
    const md = renderFichePreparationMarkdown(contenu())
    expect(md).toContain('Trace écrite (tableau / cahier) :')
    expect(md).toContain('Confusion élément perturbateur / péripéties')
    expect(md).toContain('→ Revenir au conte étudié en séance 1.')
    expect(md).toContain('Transition : Distribuer le texte support.')
    expect(md).toContain('**Différenciation :**')
    expect(md).toContain('**Points de vigilance :**')
    expect(md).toContain('**Prolongements / devoirs :**')
  })

  it('affiche la phase du canevas quand elle est présente', () => {
    const md = renderFichePreparationMarkdown(contenu())
    expect(md).toContain('Pratique guidée — « Nous faisons »')
  })

  it('se dégrade proprement sans les sections optionnelles', () => {
    const md = renderFichePreparationMarkdown(contenu({
      prerequis: null, materiel_global: null, differenciation: null,
      points_vigilance: null, prolongements: null,
      deroule: contenu().deroule.map((m) => ({
        ...m, trace_ecrite: null, difficultes_anticipees: null, materiel: null, transition: null,
      })),
    }))
    expect(md).not.toContain('Prérequis')
    expect(md).not.toContain('Trace écrite')
    expect(md).not.toContain('Différenciation')
    expect(md).toContain('min 0–10')
  })
})
