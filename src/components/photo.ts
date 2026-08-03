/**
 * Portraits taken from the printout live in `public/` and are stored as paths
 * relative to it, so they follow the app wherever it is deployed — including
 * under a sub-path. The scraper stores absolute portal URLs instead, and the
 * artifact build swaps in data URIs; both are left alone.
 *
 * Its own module because both the portrait and the blurred mount behind it need
 * the same URL, and a component file that also exports a helper loses fast
 * refresh.
 */
export function resolvePhotoUrl(photo: string): string {
  if (/^(https?:)?\/\/|^data:/i.test(photo)) return photo;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${photo.replace(/^\//, '')}`;
}
