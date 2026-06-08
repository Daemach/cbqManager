import { describe, it, expect } from 'vitest'
import { prettyPayload, isJson, copyText, parsePayload, payloadField, tooltipPayload } from './payloadView.js'

describe('prettyPayload', () => {
  it('pretty-prints a JSON object string with 2-space indent', () => {
    const raw = '{"mapping":"updateDatamaps","batchId":null,"properties":{"bReset":1}}'
    expect(prettyPayload(raw)).toBe(
      [
        '{',
        '  "mapping": "updateDatamaps",',
        '  "batchId": null,',
        '  "properties": {',
        '    "bReset": 1',
        '  }',
        '}'
      ].join('\n')
    )
  })

  it('pretty-prints a JSON array', () => {
    expect(prettyPayload('[1,2]')).toBe('[\n  1,\n  2\n]')
  })

  it('falls back to raw text for non-JSON', () => {
    expect(prettyPayload('not json at all')).toBe('not json at all')
  })

  it('returns "" for blank/null/whitespace', () => {
    expect(prettyPayload('')).toBe('')
    expect(prettyPayload(null)).toBe('')
    expect(prettyPayload(undefined)).toBe('')
    expect(prettyPayload('   ')).toBe('')
  })
})

describe('isJson', () => {
  it('is true for valid JSON', () => {
    expect(isJson('{"a":1}')).toBe(true)
    expect(isJson('[1,2,3]')).toBe(true)
  })
  it('is false for non-JSON and blank', () => {
    expect(isJson('hello')).toBe(false)
    expect(isJson('')).toBe(false)
    expect(isJson(null)).toBe(false)
  })
})

describe('copyText', () => {
  it('returns the pretty-printed JSON', () => {
    expect(copyText('{"a":1}')).toBe('{\n  "a": 1\n}')
  })
  it('returns the raw text for non-JSON', () => {
    expect(copyText('plain')).toBe('plain')
  })
  it('returns "" for a blank payload (never copies "null")', () => {
    expect(copyText(null)).toBe('')
    expect(copyText('')).toBe('')
  })
})

describe('parsePayload', () => {
  it('parses a JSON object', () => {
    expect(parsePayload('{"a":1}')).toEqual({ a: 1 })
  })
  it('returns null for blank, non-JSON, or non-object JSON', () => {
    expect(parsePayload('')).toBeNull()
    expect(parsePayload(null)).toBeNull()
    expect(parsePayload('nope')).toBeNull()
    expect(parsePayload('42')).toBeNull() // valid JSON but not an object
  })
})

describe('payloadField (extract mapping / batchId)', () => {
  const raw = '{"mapping":"updateDatamaps","batchId":7,"properties":{"bReset":1},"queue":null}'
  it('extracts a string field', () => {
    expect(payloadField(raw, 'mapping')).toBe('updateDatamaps')
  })
  it('coerces a numeric field to a string', () => {
    expect(payloadField(raw, 'batchId')).toBe('7')
  })
  it('returns "" for null / missing / blank-payload', () => {
    expect(payloadField(raw, 'queue')).toBe('') // present but null
    expect(payloadField(raw, 'nope')).toBe('') // missing
    expect(payloadField('', 'mapping')).toBe('')
    expect(payloadField('not json', 'mapping')).toBe('')
  })
  it('JSON-stringifies an object/array field rather than "[object Object]"', () => {
    expect(payloadField(raw, 'properties')).toBe('{"bReset":1}')
  })
})

describe('tooltipPayload (inline preview only when short)', () => {
  it('returns the pretty text when within the max', () => {
    expect(tooltipPayload('{"a":1}', 200)).toBe('{\n  "a": 1\n}')
  })
  it('returns "" when the pretty text exceeds the max (use the dialog instead)', () => {
    const big = JSON.stringify({ s: 'x'.repeat(300) })
    expect(tooltipPayload(big, 200)).toBe('')
  })
  it('returns "" for a blank payload', () => {
    expect(tooltipPayload('', 200)).toBe('')
  })
})
