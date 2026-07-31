/**
 * Input sanitization utilities for GaGa Chat.
 * Provides functions to sanitize user-generated text content
 * against XSS, injection attacks, and malicious content.
 */

// ─── HTML entity encoding map ──────────────────────────────────────────
const ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Encode special HTML characters to prevent XSS injection.
 */
function encodeHtml(str: string): string {
  return str.replace(/[&<>"'/]/g, (char) => ENTITY_MAP[char] || char);
}

// ─── URL detection
const URL_REGEX = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;

/**
 * Find all URLs in a string and return them as matches.
 */
function findUrls(text: string): string[] {
  return text.match(URL_REGEX) || [];
}

/**
 * Strip URL tracking parameters (UTM, fbclid, etc.)
 */
function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'ref', 'source', 'mc_cid', 'mc_eid',
    ];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Sanitize a URL: ensure it starts with a valid protocol and remove tracking.
 */
function sanitizeUrl(url: string): string {
  const clean = url.trim();
  if (!clean) return '';
  
  // Reject dangerous protocols
  if (/^(javascript|data|vbscript|file):/i.test(clean)) {
    return '';
  }
  
  // Ensure http/https protocol  
  let sanitized = clean;
  if (!/^https?:\/\//i.test(sanitized)) {
    sanitized = 'https://' + sanitized;
  }
  
  return stripTrackingParams(sanitized);
}

// ─── Dangerous patterns ────────────────────────────────────────────────
const DANGEROUS_PATTERNS = [
  /javascript\s*:/gi,
  /on\w+\s*=/gi,       // onclick=, onerror=, etc.
  /data\s*:\s*text\/html/gi,
  /vbscript\s*:/gi,
  /<script[\s>]/gi,
  /<iframe[\s>]/gi,
  /<object[\s>]/gi,
  /<embed[\s>]/gi,
  /<svg[\s>]/gi,
  /expression\s*\(/gi,
  /url\s*\(/gi,         // CSS url() injection
];

/**
 * Strip dangerous patterns from a string.
 */
function stripDangerousPatterns(str: string): string {
  let cleaned = str;
  for (const pattern of DANGEROUS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned;
}

// ─── Control characters ────────────────────────────────────────────────
/**
 * Strip ASCII control characters (except newlines and tabs).
 */
function stripControlChars(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// ─── Repeated characters ───────────────────────────────────────────────
/**
 * Limit repeated characters to prevent spam (e.g., "a".repeat(1000)).
 * Default max is 10 consecutive same characters.
 */
function limitRepeatedChars(str: string, maxRepeat = 10): string {
  return str.replace(/(.)\1{10,}/g, (match, char) => char.repeat(maxRepeat));
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Sanitize user-generated text for safe storage and display.
 * 
 * This function:
 * 1. Strips dangerous HTML/JS patterns
 * 2. Encodes remaining HTML entities
 * 3. Strips control characters
 * 4. Limits length
 * 5. Limits repeated characters
 * 6. Trims whitespace
 * 
 * @param text - The input text to sanitize
 * @param maxLength - Maximum allowed length (default: 5000)
 * @returns Sanitized text safe for display
 */
export function sanitizeText(text: string, maxLength = 5000): string {
  if (!text) return '';
  
  let cleaned = text;
  
  // 1. Strip dangerous patterns
  cleaned = stripDangerousPatterns(cleaned);
  
  // 2. Encode HTML entities (after stripping dangerous patterns)
  cleaned = encodeHtml(cleaned);
  
  // 3. Strip control characters
  cleaned = stripControlChars(cleaned);
  
  // 4. Limit repeated characters
  cleaned = limitRepeatedChars(cleaned, 15);
  
  // 5. Trim and limit length
  cleaned = cleaned.trim().slice(0, maxLength);
  
  return cleaned;
}

/**
 * Sanitize user display name (more restrictive).
 * Allows: letters, numbers, spaces, hyphens, underscores, periods, apostrophes.
 * Max length: 50 characters.
 */
export function sanitizeDisplayName(name: string): string {
  if (!name) return '';
return name
    .replace(/[^a-zA-Z0-9\s_'.-]/g, '')
    .trim()
    .slice(0, 50);
}

/**
 * Sanitize a phone number string.
 * Keeps only digits, +, -, (, ), and space.
 */
export function sanitizePhoneNumber(phone: string): string {
  if (!phone) return '';
  return phone.replace(/[^0-9+\-()\s]/g, '').trim().slice(0, 20);
}

/**
 * Sanitize an email address.
 * Strips dangerous characters while preserving email structure.
 */
export function sanitizeEmail(email: string): string {
  if (!email) return '';
return email.replace(/[^a-zA-Z0-9@._+-]/g, '').trim().slice(0, 254);
}

/**
 * Sanitize a URL that users provide.
 * Returns empty string if the URL is dangerous.
 */
export function sanitizeUserUrl(url: string): string {
  return sanitizeUrl(url);
}

/**
 * Check if text contains dangerous or malicious content.
 * Returns true if the text is safe.
 */
export function isTextSafe(text: string): boolean {
  if (!text) return true;
  
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(text)) return false;
  }
  
  // Check for too many URLs (spam indicator)
  const urls = findUrls(text);
  if (urls.length > 5) return false;
  
  // Check for excessive length
  if (text.length > 10000) return false;
  
  return true;
}
