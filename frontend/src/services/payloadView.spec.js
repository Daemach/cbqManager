import { describe, it, expect } from 'vitest'
import { prettyPayload, isJson, copyText } from './payloadView.js'

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
