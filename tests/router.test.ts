import { describe, expect, it } from 'vitest'
import { parseHash } from '../src/utils/router.ts'

describe('parseHash', () => {
  it('空・# だけは HOME', () => {
    expect(parseHash('').segments).toEqual([])
    expect(parseHash('#/').segments).toEqual([])
  })
  it('画面名とクエリを分ける', () => {
    const r = parseHash('#/set?ids=OF-DRV-01-A,OF-DRV-01-B&n=2')
    expect(r.segments).toEqual(['set'])
    expect(r.params.get('ids')).toBe('OF-DRV-01-A,OF-DRV-01-B')
    expect(r.params.get('n')).toBe('2')
  })
  it('COACH は #/coach で開ける', () => {
    expect(parseHash('#/coach').segments).toEqual(['coach'])
  })
})
