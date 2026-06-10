import { describe, it, expect } from 'vitest'
import {
  formatClientName,
  formatCaravanFullName,
  caravanNickname,
} from '../name-format.js'

describe('formatClientName', () => {
  it('full parts → SURNAME, FIRSTNAME MIDDLENAME SUFFIX', () => {
    expect(
      formatClientName({ first_name: 'Juan', middle_name: 'Santos', last_name: 'Dela Cruz', ext_name: 'Jr' })
    ).toBe('DELA CRUZ, JUAN SANTOS JR')
  })

  it('no suffix', () => {
    expect(
      formatClientName({ first_name: 'Maria', middle_name: 'Luz', last_name: 'Reyes' })
    ).toBe('REYES, MARIA LUZ')
  })

  it('no middle name, no suffix', () => {
    expect(
      formatClientName({ first_name: 'Jose', last_name: 'Santos' })
    ).toBe('SANTOS, JOSE')
  })

  it('last name only', () => {
    expect(formatClientName({ last_name: 'Dela Cruz' })).toBe('DELA CRUZ')
  })

  it('all null returns empty string', () => {
    expect(formatClientName({})).toBe('')
  })

  it('uppercases input', () => {
    expect(
      formatClientName({ first_name: 'juan', last_name: 'dela cruz' })
    ).toBe('DELA CRUZ, JUAN')
  })

  it('collapses extra whitespace', () => {
    expect(
      formatClientName({ first_name: '  Ana  ', last_name: '  Reyes  ' })
    ).toBe('REYES, ANA')
  })

  it('skips empty string parts', () => {
    expect(
      formatClientName({ first_name: 'Pedro', middle_name: '', last_name: 'Cruz', ext_name: '' })
    ).toBe('CRUZ, PEDRO')
  })

  it('ext_name III variant', () => {
    expect(
      formatClientName({ first_name: 'Jose', last_name: 'Santos', ext_name: 'III' })
    ).toBe('SANTOS, JOSE III')
  })
})

describe('formatCaravanFullName', () => {
  it('full parts → SURNAME, FIRSTNAME MIDDLENAME', () => {
    expect(
      formatCaravanFullName({ first_name: 'Mark', middle_name: 'Bautista', last_name: 'Morsiquillo' })
    ).toBe('MORSIQUILLO, MARK BAUTISTA')
  })

  it('no middle name', () => {
    expect(
      formatCaravanFullName({ first_name: 'Ana', last_name: 'Reyes' })
    ).toBe('REYES, ANA')
  })

  it('last name only', () => {
    expect(formatCaravanFullName({ last_name: 'Santos' })).toBe('SANTOS')
  })

  it('all null returns empty string', () => {
    expect(formatCaravanFullName({})).toBe('')
  })

  it('uppercases and collapses whitespace', () => {
    expect(
      formatCaravanFullName({ first_name: '  mark  ', last_name: '  dela cruz  ' })
    ).toBe('DELA CRUZ, MARK')
  })
})

describe('caravanNickname', () => {
  it('Mark Morsiquillo → MMORSIQUILLO', () => {
    expect(caravanNickname({ first_name: 'Mark', last_name: 'Morsiquillo' })).toBe('MMORSIQUILLO')
  })

  it('Juan Dela Cruz → JDELACRUZ (strips spaces in surname)', () => {
    expect(caravanNickname({ first_name: 'Juan', last_name: 'Dela Cruz' })).toBe('JDELACRUZ')
  })

  it('Ana Reyes → AREYES', () => {
    expect(caravanNickname({ first_name: 'Ana', last_name: 'Reyes' })).toBe('AREYES')
  })

  it('no first_name → surname without spaces', () => {
    expect(caravanNickname({ last_name: 'Dela Cruz' })).toBe('DELACRUZ')
  })

  it('no last_name → first initial only', () => {
    expect(caravanNickname({ first_name: 'Maria' })).toBe('M')
  })

  it('empty parts → empty string', () => {
    expect(caravanNickname({})).toBe('')
  })

  it('lowercased input is uppercased', () => {
    expect(caravanNickname({ first_name: 'mark', last_name: 'morsiquillo' })).toBe('MMORSIQUILLO')
  })
})
