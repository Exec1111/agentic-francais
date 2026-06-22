/**
 * Extraction de texte depuis un dépôt enseignant (paliers 1 & 2).
 *  - Palier 1 : texte collé, .txt, .docx (couche texte native).
 *  - Palier 2 : PDF — extraction de la couche texte embarquée (aucune OCR).
 *
 * Garde-fou : un PDF scanné (image, sans couche texte) renvoie un texte vide ;
 * on lève alors `PdfNoTextLayerError` pour que rien de vide n'entre au corpus.
 * L'OCR (palier 3) prendra le relais plus tard.
 */

import mammoth from 'mammoth'
import { extractText, getDocumentProxy } from 'unpdf'

export type ExtractKind = 'txt' | 'docx' | 'pdf'

export interface ExtractResult {
  kind: ExtractKind
  text: string
}

/** Seuil en-deçà duquel on considère qu'aucun texte exploitable n'a été extrait. */
const MIN_USABLE_CHARS = 20

export class PdfNoTextLayerError extends Error {
  constructor() {
    super(
      "Ce PDF ne contient pas de couche texte (il est probablement scanné). " +
        "L'extraction automatique n'est pas encore disponible pour ce cas — " +
        "collez le texte manuellement ou déposez un fichier .txt/.docx.",
    )
    this.name = 'PdfNoTextLayerError'
  }
}

export class PdfExtractionError extends Error {
  constructor() {
    super(
      "Ce PDF n'a pas pu être lu (fichier corrompu ou format inattendu). " +
        "Vérifiez le fichier, ou collez le texte manuellement.",
    )
    this.name = 'PdfExtractionError'
  }
}

export class UnsupportedFileError extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'UnsupportedFileError'
  }
}

/** Normalise les fins de ligne et supprime les espaces de fin superflus. */
function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractPdf(buffer: Buffer): Promise<string> {
  let normalized: string
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    const merged = Array.isArray(text) ? text.join('\n') : text
    normalized = normalizeText(merged)
  } catch {
    // Échec de parsing (fichier corrompu, non-PDF mal étiqueté…) → message clair.
    throw new PdfExtractionError()
  }
  if (normalized.length < MIN_USABLE_CHARS) throw new PdfNoTextLayerError()
  return normalized
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer })
  return normalizeText(value)
}

function detectKind(filename: string, mimetype?: string): ExtractKind {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf' || mimetype === 'application/pdf') return 'pdf'
  if (
    ext === 'docx' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx'
  }
  if (ext === 'txt' || ext === 'md' || mimetype?.startsWith('text/')) return 'txt'
  throw new UnsupportedFileError(
    `Format non pris en charge : « ${filename} ». Acceptés : .txt, .docx, .pdf (ou collez le texte).`,
  )
}

/** Extrait le texte d'un fichier déposé selon son type. */
export async function extractTextFromFile(
  filename: string,
  buffer: Buffer,
  mimetype?: string,
): Promise<ExtractResult> {
  const kind = detectKind(filename, mimetype)
  switch (kind) {
    case 'pdf':
      return { kind, text: await extractPdf(buffer) }
    case 'docx':
      return { kind, text: await extractDocx(buffer) }
    case 'txt':
      return { kind, text: normalizeText(buffer.toString('utf-8')) }
  }
}
