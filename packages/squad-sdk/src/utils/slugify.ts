/**
 * Convert a display name to a URL/label-safe slug.
 *
 * "Steve Rogers"               → "steve-rogers"
 * "Tony Stark (Iron Man)"      → "tony-stark-iron-man"
 * "Doctor Strange (Stephen Strange)" → "doctor-strange-stephen-strange"
 * "Thor"                       → "thor"
 * "already-slugified"          → "already-slugified"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
