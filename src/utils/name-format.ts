/**
 * Standardized name formatters for Excel reports.
 *
 * All formatters return UPPERCASE strings in Filipino name convention:
 *   "SURNAME, FIRSTNAME MIDDLENAME SUFFIX"
 *
 * Rules:
 *  - null / undefined / empty parts are skipped
 *  - multiple internal spaces are collapsed to one
 *  - the result is fully upper-cased
 */

interface ClientNameParts {
  first_name?:  string | null;
  middle_name?: string | null;
  last_name?:   string | null;
  ext_name?:    string | null; // legacy suffix: "JR", "III", etc.
}

interface UserNameParts {
  first_name?:  string | null;
  middle_name?: string | null;
  last_name?:   string | null;
}

interface NicknameParts {
  first_name?: string | null;
  last_name?:  string | null;
}

/** Trim, collapse whitespace, uppercase. Returns '' for null/empty. */
function clean(s: string | null | undefined): string {
  if (!s) return '';
  return s.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Format a client name as "SURNAME, FIRSTNAME MIDDLENAME SUFFIX".
 * Parts that are null/empty are skipped.
 *
 * Examples:
 *   {first_name:'Juan', middle_name:'Santos', last_name:'Dela Cruz', ext_name:'Jr'}
 *     → "DELA CRUZ, JUAN SANTOS JR"
 *   {last_name: 'Reyes'}  → "REYES"
 *   {}                    → ""
 */
export function formatClientName(p: ClientNameParts): string {
  const last   = clean(p.last_name);
  const first  = clean(p.first_name);
  const middle = clean(p.middle_name);
  const ext    = clean(p.ext_name);

  const given = [first, middle, ext].filter(Boolean).join(' ');

  if (last && given) return `${last}, ${given}`;
  if (last)          return last;
  if (given)         return given;
  return '';
}

/**
 * Format a caravan (user) name as "SURNAME, FIRSTNAME MIDDLENAME".
 * Users have no ext_name / suffix.
 *
 * Examples:
 *   {first_name:'Mark', middle_name:'Bautista', last_name:'Morsiquillo'}
 *     → "MORSIQUILLO, MARK BAUTISTA"
 *   {first_name:'Ana', last_name:'Reyes'} → "REYES, ANA"
 */
export function formatCaravanFullName(p: UserNameParts): string {
  const last   = clean(p.last_name);
  const first  = clean(p.first_name);
  const middle = clean(p.middle_name);

  const given = [first, middle].filter(Boolean).join(' ');

  if (last && given) return `${last}, ${given}`;
  if (last)          return last;
  if (given)         return given;
  return '';
}

/**
 * Caravan nickname: first letter of first_name + full last_name, no spaces,
 * fully uppercase.
 *
 * Examples:
 *   {first_name:'Mark', last_name:'Morsiquillo'} → "MMORSIQUILLO"
 *   {first_name:'Juan', last_name:'Dela Cruz'}   → "JDELACRUZ"
 *   {first_name:'Ana',  last_name:'Reyes'}       → "AREYES"
 *
 * If first_name is absent, returns just the last_name (no spaces).
 * If last_name is absent, returns first initial only.
 */
export function caravanNickname(p: NicknameParts): string {
  const first = clean(p.first_name);
  const last  = clean(p.last_name).replace(/\s+/g, ''); // strip spaces in surname

  if (first && last) return first[0] + last;
  if (last)          return last;
  if (first)         return first[0];
  return '';
}
