/**
 * Tests unitaires — extraitOeuvreDefinition (buildPrompt + postProcess)
 *
 * Familles de cas :
 *   A. Aucun corpus → erreur explicite (comportement inchangé)
 *   B. Corpus avec contenu disponible → le LLM produit l'appareil pédagogique,
 *      le texte est injecté PAR CODE dans postProcess (champ texte = "")
 *   C. Corpus protégé (contenu vide) → pas d'erreur, placeholder injecté par code
 *   D. postProcess → fidélité du texte et des métadonnées garantie par code
 */

import { describe, it, expect } from 'vitest'
import { extraitOeuvreDefinition } from '../types/extrait-oeuvre'
import type { ResourceGenerationContext } from '../registry'
import type { CorpusItem } from '@/shared/schemas'
import type { ExtraitOeuvreContenu } from '@/shared/resource-schemas'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeCorpusItem = (overrides: Partial<CorpusItem> = {}): CorpusItem => ({
  id: 'camus-letranger',
  type: 'extrait',
  auteur: 'Albert Camus',
  oeuvre: "L'Étranger",
  titre: 'Incipit',
  annee_publication: 1942,
  edition_reference: 'Gallimard, Folio n°2, 1972',
  pages: 'p. 9',
  contenu: "Aujourd'hui, maman est morte. Ou peut-être hier, je ne sais pas.",
  checksum: 'def456',
  niveaux: ['premiere', 'terminale'],
  genres: ['roman', 'absurde'],
  themes: ['mort', 'indifférence', 'absurde'],
  domaine_public: false,  // sous droits pour les tests (décédé en 1960, droits jusqu'en 2031)
  verified: true,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  ...overrides,
})

const makeContext = (corpusItem?: CorpusItem | null): ResourceGenerationContext => ({
  sequenceTitle: "L'Absurde dans la littérature du XXe siècle",
  niveau: 'Première',
  theme: "L'indifférence et la mort",
  seanceNumero: 2,
  seanceTitle: "Lecture de L'Étranger",
  activiteTitre: 'Étude de l\'incipit',
  activiteType: 'lecture',
  activiteConsigne: 'Analyser le rapport de Meursault à la mort de sa mère',
  ressourceTitre: "Fiche de lecture — L'Étranger, incipit",
  corpusItem,
})

const systemMsg = (msgs: ReturnType<typeof extraitOeuvreDefinition.buildPrompt>) =>
  msgs[0].content as string

const userMsg = (msgs: ReturnType<typeof extraitOeuvreDefinition.buildPrompt>) =>
  msgs[1].content as string

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("extraitOeuvreDefinition.buildPrompt — cas A : aucun corpus", () => {
  it("lève une erreur claire si aucun corpus n'est fourni", () => {
    expect(() => extraitOeuvreDefinition.buildPrompt(makeContext()))
      .toThrow('extrait_oeuvre nécessite un texte corpus')
  })

  it('lève également une erreur si corpusItem est explicitement null', () => {
    expect(() => extraitOeuvreDefinition.buildPrompt(makeContext(null)))
      .toThrow('extrait_oeuvre nécessite un texte corpus')
  })
})

describe("extraitOeuvreDefinition.buildPrompt — cas B : corpus avec contenu disponible", () => {
  // Simuler un item domaine public avec contenu
  const item = makeCorpusItem({ contenu: "Aujourd'hui, maman est morte.", domaine_public: true })

  it('ne lève pas d\'erreur', () => {
    expect(() => extraitOeuvreDefinition.buildPrompt(makeContext(item))).not.toThrow()
  })

  it('retourne exactement 2 messages', () => {
    expect(extraitOeuvreDefinition.buildPrompt(makeContext(item))).toHaveLength(2)
  })

  it('exige des citations MOT POUR MOT et identifie le texte source officiel', () => {
    const system = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(item)))
    expect(system).toContain('MOT POUR MOT')
    expect(system).toContain('TEXTE SOURCE OFFICIEL')
  })

  it('demande au LLM de laisser le champ "texte" vide (injection par code)', () => {
    const system = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(item)))
    expect(system).toContain('chaîne vide')
    expect(system).toContain('NE recopie PAS')
  })

  it('inclut le texte source intégral dans le prompt', () => {
    const system = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(item)))
    expect(system).toContain("Aujourd'hui, maman est morte.")
  })

  it('inclut les métadonnées bibliographiques', () => {
    const system = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(item)))
    expect(system).toContain('Albert Camus')
    expect(system).toContain("L'Étranger")
    expect(system).toContain('p. 9')
  })

  it("ne contient pas de mention 'placeholder' ni 'à insérer'", () => {
    const system = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(item)))
    expect(system).not.toContain('placeholder')
    expect(system).not.toContain('à insérer')
    expect(system).not.toContain('Texte à insérer')
  })

  it('le message utilisateur cite l\'auteur et le titre de la ressource', () => {
    const user = userMsg(extraitOeuvreDefinition.buildPrompt(makeContext(item)))
    expect(user).toContain('Albert Camus')
    expect(user).toContain("Fiche de lecture — L'Étranger, incipit")
  })
})

describe("extraitOeuvreDefinition.buildPrompt — cas C : corpus protégé (contenu vide)", () => {
  const protectedItem = makeCorpusItem({ contenu: '' })

  it('ne lève pas d\'erreur malgré le contenu vide', () => {
    expect(() => extraitOeuvreDefinition.buildPrompt(makeContext(protectedItem))).not.toThrow()
  })

  it('retourne exactement 2 messages', () => {
    expect(extraitOeuvreDefinition.buildPrompt(makeContext(protectedItem))).toHaveLength(2)
  })

  it('impose un placeholder exact pour le champ "texte"', () => {
    const system = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(protectedItem)))
    expect(system).toContain('Texte à insérer par l\'enseignant')
    expect(system).toContain("L'Étranger")
    expect(system).toContain('Albert Camus')
    expect(system).toContain('p. 9')
  })

  it("interdit d'inventer du texte", () => {
    const system = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(protectedItem)))
    expect(system).toContain('ne pas inventer')
  })

  it("n'exige pas de reproduction MOT POUR MOT (pas de texte à reproduire)", () => {
    const system = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(protectedItem)))
    expect(system).not.toContain('MOT POUR MOT')
    expect(system).not.toContain('TEXTE SOURCE OFFICIEL')
  })

  it('autorise des questions sans citation verbatim', () => {
    const system = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(protectedItem)))
    expect(system).toContain('sans citer le texte mot pour mot')
  })

  it('demande une note_prof rappelant de fournir le texte séparément', () => {
    const system = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(protectedItem)))
    expect(system).toContain('note_prof')
    expect(system).toContain('séparément')
  })

  it('mentionne la référence bibliographique', () => {
    const system = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(protectedItem)))
    expect(system).toContain('RÉFÉRENCE BIBLIOGRAPHIQUE')
    expect(system).toContain('Gallimard, Folio n°2, 1972')
  })

  it("le message utilisateur mentionne 'protégée' (pas de reproduction de texte)", () => {
    const user = userMsg(extraitOeuvreDefinition.buildPrompt(makeContext(protectedItem)))
    expect(user).toContain('protégée')
    expect(user).toContain('placeholder')
  })

  it('fonctionne sans le champ pages (item sans pages)', () => {
    const itemSansPages = makeCorpusItem({ contenu: '', pages: undefined })
    expect(() => extraitOeuvreDefinition.buildPrompt(makeContext(itemSansPages))).not.toThrow()
    const system = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(itemSansPages)))
    expect(system).not.toContain('undefined')
  })
})

describe('extraitOeuvreDefinition — comportement symétrique avec/sans contenu', () => {
  it('les deux modes génèrent des prompts substantiels (> 400 caractères)', () => {
    const withContent    = makeCorpusItem({ contenu: "Aujourd'hui, maman est morte." })
    const withoutContent = makeCorpusItem({ contenu: '' })

    const lenWith    = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(withContent))).length
    const lenWithout = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(withoutContent))).length

    expect(lenWith).toBeGreaterThan(400)
    expect(lenWithout).toBeGreaterThan(400)
  })

  it('le mode protégé est plus court que le mode avec un texte LONG', () => {
    // Avec un texte long, l'injection du contenu rend le prompt with-content plus long
    const longText = 'A'.repeat(2000)
    const withLongContent    = makeCorpusItem({ contenu: longText })
    const withoutContent     = makeCorpusItem({ contenu: '' })

    const lenWith    = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(withLongContent))).length
    const lenWithout = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(withoutContent))).length

    expect(lenWithout).toBeLessThan(lenWith)
  })

  it('le placeholder contient exactement le titre de la ressource pour faciliter la localisation', () => {
    const item = makeCorpusItem({ contenu: '' })
    const system = systemMsg(extraitOeuvreDefinition.buildPrompt(makeContext(item)))
    // Le placeholder doit citer l'œuvre pour que l'enseignant sache quoi insérer
    expect(system).toContain("L'Étranger")
  })
})

// ── Cas D : postProcess — injection du texte et des métadonnées par code ──────

const makeFullContent = (overrides: Partial<ExtraitOeuvreContenu> = {}): ExtraitOeuvreContenu => ({
  // Métadonnées volontairement fausses : postProcess doit les écraser
  auteur: 'Auteur Halluciné',
  oeuvre: 'Œuvre Inventée',
  edition_reference: 'Édition Fantaisiste',
  pages: 'p. 999',
  introduction: 'Une introduction contextuelle.',
  texte: '',
  notes_bas_de_page: null,
  questions: [
    { enonce: 'Question 1 ?', reponse_attendue: 'Réponse 1', elements_analyse: null },
    { enonce: 'Question 2 ?', reponse_attendue: 'Réponse 2', elements_analyse: 'Métaphore filée' },
  ],
  note_prof: null,
  ...overrides,
})

describe('extraitOeuvreDefinition.postProcess — corpus avec contenu', () => {
  const texteSixLignes = 'Ligne un\nLigne deux\nLigne trois\nLigne quatre\nLigne cinq\nLigne six'
  const item = makeCorpusItem({ contenu: texteSixLignes })

  it('injecte le texte du corpus dans le champ "texte" (jamais celui du LLM)', () => {
    const result = extraitOeuvreDefinition.postProcess!(
      makeFullContent({ texte: 'Texte halluciné par le LLM' }),
      makeContext(item),
    )
    expect(result.texte).toContain('Ligne un')
    expect(result.texte).not.toContain('halluciné')
  })

  it('numérote les lignes tous les 5 par code', () => {
    const result = extraitOeuvreDefinition.postProcess!(makeFullContent(), makeContext(item))
    expect(result.texte).toContain('[5] Ligne cinq')
    expect(result.texte).not.toContain('[6]')
  })

  it('écrase les métadonnées bibliographiques avec celles de la base', () => {
    const result = extraitOeuvreDefinition.postProcess!(makeFullContent(), makeContext(item))
    expect(result.auteur).toBe('Albert Camus')
    expect(result.oeuvre).toBe("L'Étranger")
    expect(result.edition_reference).toBe('Gallimard, Folio n°2, 1972')
    expect(result.pages).toBe('p. 9')
  })

  it("préserve l'appareil pédagogique produit par le LLM", () => {
    const result = extraitOeuvreDefinition.postProcess!(makeFullContent(), makeContext(item))
    expect(result.introduction).toBe('Une introduction contextuelle.')
    expect(result.questions).toHaveLength(2)
    expect(result.questions[1].elements_analyse).toBe('Métaphore filée')
  })
})

describe('extraitOeuvreDefinition.postProcess — corpus protégé (contenu vide)', () => {
  const protectedItem = makeCorpusItem({ contenu: '' })

  it('injecte le placeholder standard à la place du texte', () => {
    const result = extraitOeuvreDefinition.postProcess!(makeFullContent(), makeContext(protectedItem))
    expect(result.texte).toBe("[Texte à insérer par l'enseignant — L'Étranger, Albert Camus, p. 9]")
  })

  it('fonctionne sans le champ pages', () => {
    const sansPages = makeCorpusItem({ contenu: '', pages: undefined })
    const result = extraitOeuvreDefinition.postProcess!(makeFullContent(), makeContext(sansPages))
    expect(result.texte).toBe("[Texte à insérer par l'enseignant — L'Étranger, Albert Camus]")
    expect(result.pages).toBeNull()
  })
})

describe('extraitOeuvreDefinition.postProcess — sans corpus', () => {
  it('retourne le contenu inchangé si aucun corpus (cas défensif)', () => {
    const full = makeFullContent({ texte: 'Texte du LLM' })
    const result = extraitOeuvreDefinition.postProcess!(full, makeContext(null))
    expect(result).toEqual(full)
  })
})
