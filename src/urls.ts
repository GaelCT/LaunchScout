const MAX_PUBLIC_URL_LENGTH = 4096;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const PUBLIC_EMAIL =
  /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

/** Return a normalized public HTTPS URL, or null when the value is not safe to click. */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (
    !candidate ||
    candidate.length > MAX_PUBLIC_URL_LENGTH ||
    CONTROL_CHARACTERS.test(candidate) ||
    !/^https:\/\//i.test(candidate)
  )
    return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Extract a single syntactically valid public recipient without preserving mailto headers. */
export function getVerifiedPublicEmail(contact: unknown): string | null {
  if (typeof contact !== 'string') return null;
  const candidate = contact.trim();
  if (
    !candidate ||
    candidate.length > MAX_PUBLIC_URL_LENGTH ||
    CONTROL_CHARACTERS.test(candidate) ||
    !/^mailto:/i.test(candidate)
  )
    return null;

  try {
    const recipient = decodeURIComponent(candidate.slice('mailto:'.length).split('?')[0]).trim();
    return recipient.length <= 254 && PUBLIC_EMAIL.test(recipient) ? recipient : null;
  } catch {
    return null;
  }
}

/** Allow public HTTPS contact pages and normalized single-recipient mailto links only. */
export function safePublicContactUrl(contact: unknown): string | null {
  const httpsUrl = safeExternalUrl(contact);
  if (httpsUrl) return httpsUrl;
  const email = getVerifiedPublicEmail(contact);
  return email ? `mailto:${encodeURIComponent(email)}` : null;
}
