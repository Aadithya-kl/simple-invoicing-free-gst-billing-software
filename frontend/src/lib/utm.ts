/**
 * The UTM tags a visitor arrived with.
 *
 * They are only in the address bar of the first page load: the router drops the
 * query string as soon as it redirects (to /login, to the dashboard), so they
 * are read once at startup and kept in localStorage. A later visit with new tags
 * replaces the old set (last touch); a visit with none leaves it alone.
 *
 * The backend attaches them to events the browser reports, such as a click on
 * the WhatsApp support bubble.
 */

const STORAGE_KEY = 'si_utm';
const UTM_KEY = /^utm_[a-z0-9_]{1,40}$/;

export type UtmParams = Record<string, string>;

/** Every utm_* parameter in a query string, keys lowercased, blanks dropped. */
export function parseUtm(search: string): UtmParams {
  const params = new URLSearchParams(search);
  const utm: UtmParams = {};
  params.forEach((value, rawKey) => {
    const key = rawKey.trim().toLowerCase();
    const trimmed = value.trim();
    if (UTM_KEY.test(key) && trimmed) {
      utm[key] = trimmed;
    }
  });
  return utm;
}

/** Saves the tags on the current URL, if there are any. Call once at startup. */
export function captureUtm(search: string = window.location.search) {
  const utm = parseUtm(search);
  if (Object.keys(utm).length === 0) {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(utm));
  } catch {
    // Storage blocked (private mode, quota): the tags are lost, nothing breaks.
  }
}

/** The saved tags, or an empty object. */
export function getStoredUtm(): UtmParams {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const utm: UtmParams = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (UTM_KEY.test(key) && typeof value === 'string' && value) {
        utm[key] = value;
      }
    }
    return utm;
  } catch {
    return {};
  }
}
