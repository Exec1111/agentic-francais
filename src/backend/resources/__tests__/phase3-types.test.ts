/**
 * Tests unitaires — Phase 3 : types à schéma dédié
 * (dictee, oeuvre_complete, fiche_lecture, grille_evaluation, carte_mentale).
 *
 * Vérifie surtout le contrat prof/élève : aucun élément de corrigé / barème /
 * réponse ne doit fuiter dans la version élève (via toStudentVersion + Markdown).
 */

import { describe, it, expect } from 'vitest'
import { dicteeDefinition } from '../types/dictee'
import { oeuvreCompleteDefinition } from '../types/oeuvre-complete'
import { ficheLectureDefinition } from '../types/fiche-lecture'
import { grilleEvaluationDefinition } from '../types/grille-evaluation'
import { carteMentaleDefinition } from '../types/carte-mentale'
import type {
  DicteeContenu, OeuvreCompleteContenu, FicheLectureContenu,
  GrilleEvaluationContenu, CarteMentaleContenu,
} from '@/shared/resource-schemas'

// ── dictee (TEACHER_ONLY) ─────────────────────────────────────────────────────

describe('dictee', () => {
  const d: DicteeContenu = {
    titre: 'Les accords', niveau: '5e',
    texte_complet: 'Les fleurs sont écloses.',
    points_de_vigilance: ['accord sujet-verbe'],
    consignes_passation: 'Lire deux fois.',
    variante_allegee: null, variante_challenge: null,
    correction_type: 'Barème : -1 par erreur.',
  }

  it('est TEACHER_ONLY (pas de renderer élève)', () => {
    expect(dicteeDefinition.category).toBe('TEACHER_ONLY')
    expect(dicteeDefinition.toMarkdown.eleve).toBeUndefined()
  })

  it('le Markdown prof contient le texte et la correction', () => {
    const out = dicteeDefinition.toMarkdown.professeur(d as never)
    expect(out).toContain('Les fleurs sont écloses')
    expect(out).toContain('Barème')
  })
})

// ── oeuvre_complete ───────────────────────────────────────────────────────────

describe('oeuvre_complete', () => {
  const full: OeuvreCompleteContenu = {
    auteur: 'Hugo', oeuvre: 'Demain dès l\'aube', edition_reference: 'Gallimard', pages: null,
    introduction: 'Un poème du deuil.',
    texte: 'Demain, dès l\'aube…',
    notes_bas_de_page: null,
    questions: [{ enonce: 'Qui est le destinataire ?', reponse_attendue: 'Sa fille Léopoldine.', elements_analyse: 'Apostrophe.' }],
    questions_approfondissement: [{ enonce: 'En quoi est-ce un poème lyrique ?', pistes: 'Expression du je intime.' }],
    note_prof: 'Insister sur le cheminement.',
  }

  it('postProcess injecte le texte du corpus (numéroté)', () => {
    const ctx = { corpusItem: { auteur: 'Hugo', oeuvre: 'X', edition_reference: 'Y', pages: null, contenu: 'Ligne une\nLigne deux' } } as never
    const out = oeuvreCompleteDefinition.postProcess!(full, ctx)
    expect(out.texte).toContain('Ligne une')
    expect(out.auteur).toBe('Hugo')
  })

  it('prof montre le corrigé, élève non', () => {
    const pro = oeuvreCompleteDefinition.toMarkdown.professeur(full as never)
    expect(pro).toContain('Sa fille Léopoldine')
    expect(pro).toContain('Expression du je intime')

    const student = oeuvreCompleteDefinition.toStudentVersion!(full) as OeuvreCompleteContenu
    const ele = oeuvreCompleteDefinition.toMarkdown.eleve!(student as never)
    expect(ele).not.toContain('Sa fille Léopoldine')
    expect(ele).not.toContain('Expression du je intime')
    expect(ele).toContain('Qui est le destinataire')
  })
})

// ── fiche_lecture ─────────────────────────────────────────────────────────────

describe('fiche_lecture', () => {
  const full: FicheLectureContenu = {
    oeuvre: 'Le Petit Prince', auteur: 'Saint-Exupéry',
    sections: [{ titre: 'Les personnages', questions: [
      { enonce: 'Qui est le renard ?', espace_reponse: 3, reponse_attendue: 'Un guide qui enseigne l\'amitié.' },
    ] }],
    note_prof: 'Discuter l\'apprivoisement.',
  }

  it('prof montre la réponse attendue, élève non', () => {
    const pro = ficheLectureDefinition.toMarkdown.professeur(full as never)
    expect(pro).toContain('Un guide qui enseigne')

    const student = ficheLectureDefinition.toStudentVersion!(full) as FicheLectureContenu
    const ele = ficheLectureDefinition.toMarkdown.eleve!(student as never)
    expect(ele).not.toContain('Un guide qui enseigne')
    expect(ele).toContain('Qui est le renard')
  })
})

// ── grille_evaluation ─────────────────────────────────────────────────────────

describe('grille_evaluation', () => {
  const full: GrilleEvaluationContenu = {
    objectif: 'Rédiger un texte argumentatif',
    competences: [{
      intitule: 'Cohérence', description: 'Le propos est organisé.',
      niveaux: [
        { label: 'Maîtrisé', description: 'Plan clair', points: 4 },
        { label: 'Non atteint', description: 'Confus', points: 0 },
      ],
    }],
    total_points: 4, bareme: '4 pts = 20/20', note_prof: 'Présenter avant la tâche.',
  }

  it('prof montre points et barème, élève non', () => {
    const pro = grilleEvaluationDefinition.toMarkdown.professeur(full as never)
    expect(pro).toContain('4 pts = 20/20')
    expect(pro).toContain('| Points |')

    const student = grilleEvaluationDefinition.toStudentVersion!(full) as GrilleEvaluationContenu
    const ele = grilleEvaluationDefinition.toMarkdown.eleve!(student as never)
    expect(ele).not.toContain('4 pts = 20/20')
    expect(ele).not.toContain('| Points |')
    // Les critères restent visibles pour l'élève
    expect(ele).toContain('Cohérence')
    expect(ele).toContain('Maîtrisé')
  })
})

// ── carte_mentale ─────────────────────────────────────────────────────────────

describe('carte_mentale', () => {
  const full: CarteMentaleContenu = {
    theme_central: 'Le lyrisme', objectif: 'Synthétiser',
    branches: [{
      label: 'Thèmes',
      sous_branches: [
        { label: 'amour', detail: null, a_completer: false },
        { label: 'mort', detail: null, a_completer: true },
      ],
    }],
    note_prof: 'Faire compléter en binôme.',
  }

  it('prof montre tous les nœuds ; élève masque les nœuds a_completer', () => {
    const pro = carteMentaleDefinition.toMarkdown.professeur(full as never)
    expect(pro).toContain('amour')
    expect(pro).toContain('mort')

    const student = carteMentaleDefinition.toStudentVersion!(full) as CarteMentaleContenu
    const ele = carteMentaleDefinition.toMarkdown.eleve!(student as never)
    expect(ele).toContain('amour')       // nœud-indice conservé
    expect(ele).not.toContain('mort')    // nœud à compléter masqué
    expect(ele).toContain('____')        // emplacement vide
  })
})
