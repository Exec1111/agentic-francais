/**
 * Repères des programmes officiels de français (BO Éducation Nationale) par niveau.
 *
 * Ces repères sont injectés dans les prompts de génération de ressources pour
 * ancrer le contenu dans les attendus institutionnels : entrées du programme,
 * attendus de langue, calibrage de la difficulté.
 *
 * Sources : programmes de français cycle 3 (BO 2020), cycle 4 (BO 2020),
 * programmes de seconde et première (BO spécial n°1 du 22 janvier 2019).
 */

interface ProgrammeReperes {
  /** Cycle ou classe au sens institutionnel */
  cycle: string
  /** Entrées / objets d'étude du programme de l'année */
  entrees: string[]
  /** Attendus d'étude de la langue (grammaire, orthographe, lexique) */
  langue: string[]
  /** Attendus en écriture */
  ecriture: string
  /** Attendus en lecture */
  lecture: string
  /** Calibrage : ce qu'on peut raisonnablement exiger d'un élève de ce niveau */
  calibrage: string
}

const PROGRAMMES: Record<string, ProgrammeReperes> = {
  '6e': {
    cycle: 'Cycle 3 (classe de 6e)',
    entrees: [
      'Le monstre, aux limites de l\'humain',
      'Récits d\'aventures',
      'Récits de création ; création poétique',
      'Résister au plus fort : ruses, mensonges et masques',
    ],
    langue: [
      'Identification des classes de mots (nom, verbe, déterminant, adjectif, pronom)',
      'Accord sujet-verbe, accords dans le groupe nominal',
      'Conjugaison : présent, imparfait, passé simple, futur de l\'indicatif',
      'Distinction phrase simple / phrase complexe (observation)',
    ],
    ecriture: 'Rédiger un récit court, cohérent et organisé (environ une page), en respectant les temps du récit.',
    lecture: 'Lire et comprendre des textes narratifs patrimoniaux (contes, fables, épopées, récits mythologiques) avec un guidage du professeur.',
    calibrage: 'Élèves de 11-12 ans : vocabulaire abstrait limité, consignes courtes et explicites, une seule notion par exercice, exemples concrets indispensables.',
  },
  '5e': {
    cycle: 'Cycle 4 (classe de 5e)',
    entrees: [
      'Se chercher, se construire — Le voyage et l\'aventure : pourquoi aller vers l\'inconnu ?',
      'Vivre en société, participer à la société — Avec autrui : familles, amis, réseaux',
      'Regarder le monde, inventer des mondes — Imaginer des univers nouveaux',
      'Agir sur le monde — Héros / héroïnes et héroïsmes',
    ],
    langue: [
      'Analyse du groupe nominal et des expansions du nom (adjectif, complément du nom, proposition subordonnée relative)',
      'Accord du participe passé avec être et avoir (cas simples)',
      'Conjugaison : modes indicatif et impératif ; initiation au conditionnel et au subjonctif présent',
      'Phrase complexe : juxtaposition, coordination, subordination (repérage)',
      'Lexique : formation des mots (préfixes, suffixes), polysémie, synonymie',
    ],
    ecriture: 'Rédiger des récits complets (1 à 2 pages) intégrant descriptions et dialogues ; réécrire en améliorant son texte.',
    lecture: 'Lire des œuvres intégrales et des extraits variés (roman d\'aventures, récit de voyage, poésie, théâtre) ; première analyse des procédés d\'écriture simples.',
    calibrage: 'Élèves de 12-13 ans : capables de repérer des procédés simples (comparaison, métaphore, champ lexical) si la consigne les nomme ; éviter le métalangage avancé (focalisation, modalisation).',
  },
  '4e': {
    cycle: 'Cycle 4 (classe de 4e)',
    entrees: [
      'Se chercher, se construire — Dire l\'amour',
      'Vivre en société, participer à la société — Individu et société : confrontations de valeurs',
      'Regarder le monde, inventer des mondes — La fiction pour interroger le réel',
      'Agir sur le monde — Informer, s\'informer, déformer',
    ],
    langue: [
      'Propositions subordonnées (relative, conjonctive complétive, circonstancielle)',
      'Accord du participe passé (y compris cas complexes courants)',
      'Conjugaison : conditionnel, subjonctif présent ; concordance des temps simple',
      'Discours rapporté : direct et indirect',
      'Figures de style : comparaison, métaphore, hyperbole, antithèse, personnification',
    ],
    ecriture: 'Rédiger des textes variés (récit fantastique, lettre, article, texte argumentatif simple) de 2 pages environ, avec un point de vue identifiable.',
    lecture: 'Lire des œuvres des XVIIIe-XIXe siècles (nouvelle réaliste ou fantastique, roman, poésie lyrique, presse) ; analyse des effets produits sur le lecteur.',
    calibrage: 'Élèves de 13-14 ans : début d\'argumentation structurée, analyse de l\'implicite avec guidage ; le vocabulaire d\'analyse littéraire de base est exigible (narrateur, point de vue, registre).',
  },
  '3e': {
    cycle: 'Cycle 4 (classe de 3e) — préparation au DNB',
    entrees: [
      'Se chercher, se construire — Se raconter, se représenter (autobiographie)',
      'Vivre en société, participer à la société — Dénoncer les travers de la société (satire)',
      'Regarder le monde, inventer des mondes — Visions poétiques du monde',
      'Agir sur le monde — Agir dans la cité : individu et pouvoir (littérature et engagement, guerres mondiales)',
    ],
    langue: [
      'Maîtrise de la phrase complexe et de l\'ensemble des subordonnées',
      'Valeurs des temps et des modes ; concordance des temps',
      'Discours rapporté (direct, indirect, indirect libre — repérage)',
      'Modalisation : exprimer certitude, doute, jugement',
      'Figures de style étendues : ironie, antiphrase, litote, euphémisme, anaphore, gradation',
    ],
    ecriture: 'Rédiger un texte argumentatif organisé ou un récit complexe (sujet de réflexion / sujet d\'imagination du DNB, environ 2 pages), avec introduction, paragraphes et exemples.',
    lecture: 'Lire des œuvres engagées et autobiographiques (XXe siècle dominant) ; analyser les procédés au service d\'une visée (dénoncer, émouvoir, témoigner). Entraînement aux questions de compréhension et d\'interprétation type DNB.',
    calibrage: 'Élèves de 14-15 ans : exercices pouvant reprendre le format DNB (questions sur texte, réécriture, dictée, rédaction) ; exiger la justification par citation précise du texte.',
  },
  '2nde': {
    cycle: 'Lycée — classe de seconde',
    entrees: [
      'La poésie du Moyen Âge au XVIIIe siècle',
      'La littérature d\'idées et la presse du XIXe siècle au XXIe siècle',
      'Le roman et le récit du XVIIIe siècle au XXIe siècle',
      'Le théâtre du XVIIe siècle au XXIe siècle',
    ],
    langue: [
      'Les accords complexes ; les subordonnées (analyse complète)',
      'L\'interrogation : syntaxe, sémantique',
      'Initiation à la stylistique : valeurs des temps, lexique mélioratif/péjoratif, registres',
    ],
    ecriture: 'S\'initier au commentaire littéraire (plan organisé, citations analysées) et à l\'écriture d\'appropriation ; rédaction de 3-4 pages attendue en fin d\'année.',
    lecture: 'Lire des œuvres intégrales dans les quatre objets d\'étude ; situer les œuvres dans leur contexte historique et littéraire (mouvements : humanisme, classicisme, Lumières, romantisme, réalisme, naturalisme).',
    calibrage: 'Élèves de 15-16 ans : analyse littéraire autonome attendue avec méthode fournie ; le métalangage complet est exigible (focalisation, énonciation, registres, mouvements littéraires).',
  },
  '1ere': {
    cycle: 'Lycée — classe de première (préparation EAF / bac de français)',
    entrees: [
      'La poésie du XIXe siècle au XXIe siècle',
      'La littérature d\'idées du XVIe siècle au XVIIIe siècle',
      'Le roman et le récit du Moyen Âge au XXIe siècle',
      'Le théâtre du XVIIe siècle au XXIe siècle',
      '(Œuvres au programme national + parcours associés)',
    ],
    langue: [
      'Questions de grammaire de l\'oral de l\'EAF : interrogation, négation, subordonnées',
      'Analyse stylistique fine au service de l\'interprétation',
    ],
    ecriture: 'Maîtriser le commentaire littéraire et la dissertation sur œuvre (épreuve écrite de l\'EAF, 4h) ; contraction de texte et essai pour la voie technologique.',
    lecture: 'Lecture linéaire (explication de texte pour l\'oral de l\'EAF) et lecture cursive ; mise en relation des œuvres avec leur parcours.',
    calibrage: 'Élèves de 16-17 ans : exercices au format des épreuves de l\'EAF (lecture linéaire, question de grammaire, commentaire, dissertation) ; exiger problématisation et plan.',
  },
  'terminale': {
    cycle: 'Lycée — classe de terminale (spécialité HLP ou consolidation)',
    entrees: [
      'Spécialité Humanités, Littérature et Philosophie : La recherche de soi ; L\'Humanité en question',
    ],
    langue: [
      'Maîtrise rédactionnelle complète attendue',
    ],
    ecriture: 'Essai littéraire et interprétation philosophique d\'un texte (épreuves de spécialité HLP).',
    lecture: 'Lecture critique et mise en perspective culturelle et philosophique des textes.',
    calibrage: 'Élèves de 17-18 ans : autonomie complète, exercices de type bac attendus.',
  },
}

// ── Normalisation du niveau saisi ──────────────────────────────────────────────

const NIVEAU_ALIASES: Record<string, string> = {
  '6e': '6e', '6eme': '6e', 'sixieme': '6e', '6è': '6e', '6ème': '6e',
  '5e': '5e', '5eme': '5e', 'cinquieme': '5e', '5è': '5e', '5ème': '5e',
  '4e': '4e', '4eme': '4e', 'quatrieme': '4e', '4è': '4e', '4ème': '4e',
  '3e': '3e', '3eme': '3e', 'troisieme': '3e', '3è': '3e', '3ème': '3e',
  '2nde': '2nde', '2de': '2nde', 'seconde': '2nde', '2nd': '2nde',
  '1ere': '1ere', '1re': '1ere', 'premiere': '1ere', '1ère': '1ere',
  'terminale': 'terminale', 'term': 'terminale', 'tle': 'terminale',
}

/** Normalise un niveau saisi librement ("Première", "5ème"…) vers une clé du référentiel. */
export function normalizeNiveau(niveau: string): string | null {
  const cleaned = niveau
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents
  return NIVEAU_ALIASES[cleaned] ?? null
}

/**
 * Retourne le bloc de repères du programme officiel pour un niveau,
 * formaté pour injection directe dans un prompt LLM.
 * Retourne null si le niveau n'est pas reconnu.
 */
export function getProgrammeReperes(niveau: string): string | null {
  const key = normalizeNiveau(niveau)
  if (!key) return null
  const p = PROGRAMMES[key]
  if (!p) return null

  return `REPÈRES DU PROGRAMME OFFICIEL — ${p.cycle} :
- Entrées du programme : ${p.entrees.join(' | ')}
- Étude de la langue (attendus) : ${p.langue.join(' ; ')}
- Écriture (attendus) : ${p.ecriture}
- Lecture (attendus) : ${p.lecture}
- Calibrage de la difficulté : ${p.calibrage}`
}
