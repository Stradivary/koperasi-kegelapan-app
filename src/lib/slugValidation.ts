/**
 * Shared slug creation and validation utilities.
 *
 * Standardizes slug rules across client and server:
 * - Minimum 3 characters, maximum 50
 * - Lowercase letters, digits, and hyphens only
 * - Must start and end with a letter or digit
 * - No consecutive hyphens
 */

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 50;

/**
 * Normalize a name into a valid slug candidate.
 * Replaces non-alphanumeric chars with hyphens, collapses consecutive hyphens,
 * trims leading/trailing hyphens.
 */
export function createSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validate a slug string against the standard rules.
 * Returns an error message (in Indonesian) or null if valid.
 */
export function validateSlugFormat(slug: string): string | null {
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return `Slug harus antara ${SLUG_MIN_LENGTH} dan ${SLUG_MAX_LENGTH} karakter`;
  }
  if (/[^a-z0-9-]/.test(slug)) {
    return "Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung";
  }
  if (/--/.test(slug)) {
    return "Slug tidak boleh mengandung tanda hubung berturut-turut";
  }
  if (!/^[a-z0-9]/.test(slug) || !/[a-z0-9]$/.test(slug)) {
    return "Slug harus diawali dan diakhiri dengan huruf atau angka";
  }
  return null;
}
