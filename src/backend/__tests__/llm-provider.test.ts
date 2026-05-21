import { describe, it, expect } from 'vitest'
import { extractJSON, safeParseJSON } from '../llm-provider'

describe('LLM Provider JSON Utilities', () => {
  describe('extractJSON', () => {
    it('should strip markdown code blocks with json language tag', () => {
      const raw = '```json\n{\n  "name": "Jean-Valjean"\n}\n```'
      const extracted = extractJSON(raw)
      expect(JSON.parse(extracted)).toEqual({ name: 'Jean-Valjean' })
    })

    it('should strip markdown code blocks without language tag', () => {
      const raw = '```\n[\n  1,\n  2,\n  3\n]\n```'
      const extracted = extractJSON(raw)
      expect(JSON.parse(extracted)).toEqual([1, 2, 3])
    })

    it('should strip prefix and suffix conversational text', () => {
      const raw = 'Here is the requested sequence details:\n{\n  "title": "Poésie"\n}\nHope this helps!'
      const extracted = extractJSON(raw)
      expect(JSON.parse(extracted)).toEqual({ title: 'Poésie' })
    })

    it('should clean trailing commas in objects and arrays', () => {
      const raw = '{\n  "items": [1, 2, 3,],\n  "meta": "data",\n}'
      const extracted = extractJSON(raw)
      expect(JSON.parse(extracted)).toEqual({
        items: [1, 2, 3],
        meta: 'data'
      })
    })

    it('should strip single-line comments //', () => {
      const raw = '{\n  // This is a comment\n  "title": "Miserables"\n}'
      const extracted = extractJSON(raw)
      expect(JSON.parse(extracted)).toEqual({ title: 'Miserables' })
    })

    it('should strip multi-line comments /* */', () => {
      const raw = '{\n  /* This is a \n  multi-line comment */\n  "title": "Miserables"\n}'
      const extracted = extractJSON(raw)
      expect(JSON.parse(extracted)).toEqual({ title: 'Miserables' })
    })
  })

  describe('safeParseJSON', () => {
    it('should parse a clean JSON object correctly', () => {
      const raw = '{"a": 1, "b": 2}'
      expect(safeParseJSON(raw, 'test-clean')).toEqual({ a: 1, b: 2 })
    })

    it('should self-heal and parse a truncated JSON object', () => {
      const raw = '{"a": 1, "b": 2} extra stuff that broke the transmission'
      expect(safeParseJSON(raw, 'test-truncated')).toEqual({ a: 1, b: 2 })
    })

    it('should throw an error for completely invalid JSON', () => {
      const raw = 'This is not JSON at all'
      expect(() => safeParseJSON(raw, 'test-invalid')).toThrowError()
    })
  })
})
