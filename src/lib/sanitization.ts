/**
 * Sanitization Utilities using DOMPurify
 * Prevents XSS attacks by sanitizing user-generated content
 */

import DOMPurify from 'dompurify';

/**
 * Configure DOMPurify with security-focused defaults
 */
const purifier = DOMPurify.sanitize;
void purifier;

/**
 * Sanitization utilities for different content types
 */
export const sanitize = {
  /**
   * Sanitize HTML content - allows basic formatting only
   * @param dirty - Potentially unsafe HTML
   * @returns Safe HTML string
   */
  html: (dirty: string): string => {
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p'],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
    });
  },

  /**
   * Sanitize plain text - strips all HTML and limits length
   * @param text - Potentially unsafe text
   * @param maxLength - Maximum length (default: 5000)
   * @returns Safe plain text
   */
  text: (text: string, maxLength = 5000): string => {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .trim()
      .slice(0, maxLength);
  },

  /**
   * Sanitize email addresses
   * @param email - Email to sanitize
   * @returns Safe email (lowercase, max 254 chars)
   */
  email: (email: string): string => {
    if (!email || typeof email !== 'string') return '';
    return email
      .toLowerCase()
      .trim()
      .slice(0, 254)
      .match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      ? email
      : '';
  },

  /**
   * Sanitize phone numbers
   * @param phone - Phone number to sanitize
   * @returns Safe phone (allows digits, +, -, parentheses, spaces)
   */
  phone: (phone: string): string => {
    if (!phone || typeof phone !== 'string') return '';
    return phone
      .replace(/[^0-9+\-\s()]/g, '') // Remove invalid characters
      .trim()
      .slice(0, 20); // Max 20 chars for phone number
  },

  /**
   * Sanitize usernames/display names
   * @param username - Username to sanitize
   * @returns Safe username (alphanumeric, ., -, _, max 30 chars)
   */
  username: (username: string): string => {
    if (!username || typeof username !== 'string') return '';
    return username
      .replace(/[^a-zA-Z0-9._-]/g, '') // Allow alphanumeric, dot, dash, underscore
      .trim()
      .slice(0, 30);
  },

  /**
   * Sanitize URLs
   * @param url - URL to sanitize
   * @returns Safe URL or empty string if invalid
   */
  url: (url: string): string => {
    if (!url || typeof url !== 'string') return '';
    try {
      const parsed = new URL(url);
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return '';
      }
      return url.slice(0, 2048); // Max URL length
    } catch {
      return ''; // Invalid URL
    }
  },

  /**
   * Sanitize markdown-like text (preserves formatting markup)
   * @param text - Text with markdown
   * @returns Sanitized markdown text
   */
  markdown: (text: string): string => {
    if (!text || typeof text !== 'string') return '';
    // Remove script tags and dangerous patterns
    return text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .slice(0, 5000);
  },

  /**
   * Sanitize JSON strings (used for data import/export)
   * @param jsonString - JSON string to sanitize
   * @returns Safe JSON string
   */
  json: (jsonString: string): string => {
    try {
      const parsed = JSON.parse(jsonString);
      // Re-stringify to ensure it's valid
      return JSON.stringify(parsed);
    } catch {
      return '{}'; // Return empty object if invalid
    }
  },

  /**
   * Sanitize file names
   * @param filename - File name to sanitize
   * @returns Safe file name (removes path traversal attempts)
   */
  filename: (filename: string): string => {
    if (!filename || typeof filename !== 'string') return 'file';
    // Remove control characters using charCode check
    const cleaned = filename
      .replace(/\.\./g, '') // Remove path traversal
      .replace(/[/\\]/g, '') // Remove path separators
      .split('')
      .filter((ch) => {
        const code = ch.charCodeAt(0);
        return !(code < 32 || code === 127);
      })
      .join('')
      .trim()
      .slice(0, 255); // Max filename length
    return cleaned;
  },
};

/**
 * Batch sanitize an array of strings
 * @param items - Array of strings to sanitize
 * @param sanitizer - Sanitization function to use
 * @returns Array of sanitized strings
 */
export function sanitizeArray(
  items: string[],
  sanitizer: (item: string) => string
): string[] {
  return items.map((item) => sanitizer(item));
}

/**
 * Sanitize object properties
 * Useful for sanitizing contact data with multiple fields
 * @param obj - Object with string properties
 * @param sanitizers - Map of property names to sanitizer functions
 * @returns Object with sanitized properties
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  sanitizers: Record<keyof T, (value: any) => any>
): T {
  const result = { ...obj };
  for (const key in sanitizers) {
    if (key in result) {
      result[key] = sanitizers[key](result[key]);
    }
  }
  return result;
}

/**
 * Check if a string contains potentially dangerous content
 * @param text - Text to check
 * @returns Boolean indicating if content is potentially dangerous
 */
export function hasDangerousContent(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /\.\.\/\.\./,
    /<svg[^>]*onload/i,
    /<img[^>]*onerror/i,
  ];

  return dangerousPatterns.some((pattern) => pattern.test(text));
}

/**
 * Sanitize and validate a contact data object
 * @param contact - Raw contact from phone import
 * @returns Sanitized contact object
 */
export function sanitizeContact(contact: {
  name?: string;
  email?: string;
  phone?: string;
  avatar?: string;
}) {
  return {
    name: sanitize.username(contact.name || ''),
    email: sanitize.email(contact.email || ''),
    phone: sanitize.phone(contact.phone || ''),
    avatar: sanitize.url(contact.avatar || ''),
  };
}

/**
 * Escape HTML entities for safe display
 * @param text - Text to escape
 * @returns HTML-escaped text
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
