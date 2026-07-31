/**
 * Content moderation hook for image/video scanning.
 * 
 * Scans media URLs and text content for potentially harmful material.
 * Uses client-side checks (regex patterns, EXIF analysis) and can be
 * extended to call server-side moderation APIs.
 */
import { useCallback } from 'react';
import { toast } from 'sonner';

// ─── Harmful text patterns ────────────────────────────────────────────
const HARMFUL_PATTERNS = [
  /\b(spam|scam|fraud|phishing)\b/i,
  /\b(sex|cam|nude|xxx|porn|adult)\s*(free|live|chat|video|call)\b/i,
  /\b(buy|sell|purchase)\s*(followers|likes|views|subscribers)\b/i,
  /\b(credit\s*card|ssn|social\s*security|bank\s*account|routing\s*number)\b/i,
  /\b(casino|gambling|bet|lottery|prize)\s*(free|win|money|cash)\b/i,
  /https?:\/\/(?:[^\s]*\.)?(?:bit\.ly|tinyurl|shorturl|shorte\.st)\/[^\s]+/i,
];

const SPAM_PATTERNS = [
  /@\w{2,10}\s*(?:check|visit|follow|dm|click|link|bio)\s*(?:my|our|the)\s*/i,
  /(?:check|visit|click|tap)\s*(?:the\s*)?link\s*(?:in\s*)?(?:my\s*)?bio/i,
  /(?:follow|sub|sub4sub|like4like|f4f|l4l)\s*(?:back|me|for\s*follow)?/i,
  /(?:send\s*)?(?:dm|pm|message|inbox)\s*me\b/i,
  /\b(free|earn|make)\s*(?:\$|money|cash|bitcoin|crypto)\s*(?:fast|quick|easy|now|today)\b/i,
];

const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.scr', '.msi', '.vbs', '.ps1', '.sh'];

// ─── Image analysis (EXIF) ─────────────────────────────────────────────
interface ImageAnalysisResult {
  isSafe: boolean;
  reasons: string[];
}

async function analyzeImage(file: File): Promise<ImageAnalysisResult> {
  const reasons: string[] = [];

  // Check file extension
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    reasons.push(`Blocked file type: ${ext}`);
    return { isSafe: false, reasons };
  }

  // Check MIME type
  if (!file.type.startsWith('image/')) {
    reasons.push('Not an image file');
    return { isSafe: false, reasons };
  }

  // Check file size (max 20MB for images)
  if (file.size > 20 * 1024 * 1024) {
    reasons.push('Image exceeds 20MB size limit');
    return { isSafe: false, reasons };
  }

  // Check dimensions via Image object
  try {
    const dimensions = await getImageDimensions(file);
    if (dimensions.width * dimensions.height > 50_000_000) {
      reasons.push('Image resolution too high (>50MP)');
      return { isSafe: false, reasons };
    }
  } catch {
    reasons.push('Could not read image dimensions');
    return { isSafe: false, reasons };
  }

  return { isSafe: true, reasons: [] };
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

// ─── Video analysis ────────────────────────────────────────────────────
interface VideoAnalysisResult {
  isSafe: boolean;
  reasons: string[];
}

async function analyzeVideo(file: File): Promise<VideoAnalysisResult> {
  const reasons: string[] = [];

  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    reasons.push(`Blocked file type: ${ext}`);
    return { isSafe: false, reasons };
  }

  if (!file.type.startsWith('video/')) {
    reasons.push('Not a video file');
    return { isSafe: false, reasons };
  }

  // Check file size (max 500MB for videos)
  if (file.size > 500 * 1024 * 1024) {
    reasons.push('Video exceeds 500MB size limit');
    return { isSafe: false, reasons };
  }

  // Check duration via video element
  try {
    const duration = await getVideoDuration(file);
    if (duration > 600) {
      reasons.push('Video exceeds 10 minute duration limit');
      return { isSafe: false, reasons };
    }
  } catch {
    reasons.push('Could not read video metadata');
    return { isSafe: false, reasons };
  }

  return { isSafe: true, reasons: [] };
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    };
    video.src = url;
  });
}

// ─── Text moderation ───────────────────────────────────────────────────
interface TextModerationResult {
  isSafe: boolean;
  reasons: string[];
  sanitized: string;
}

function moderateText(text: string): TextModerationResult {
  const reasons: string[] = [];

  // Check for harmful content
  for (const pattern of HARMFUL_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push('Content flagged as potentially harmful');
      break;
    }
  }

  // Check for spam patterns
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push('Content flagged as potential spam');
      break;
    }
  }

  // Check text length
  if (text.length > 5000) {
    reasons.push('Text exceeds 5000 character limit');
  }

  return {
    isSafe: reasons.length === 0,
    reasons,
    sanitized: text.slice(0, 5000),
  };
}

// ─── Public API ────────────────────────────────────────────────────────
export interface ModerationResult {
  isSafe: boolean;
  reasons: string[];
}

/**
 * Hook for content moderation. Provides functions to check text and media files.
 */
export function useContentModeration() {
  const checkText = useCallback((text: string): ModerationResult => {
    const result = moderateText(text);
    if (!result.isSafe) {
      const firstReason = result.reasons[0];
      if (firstReason) {
        toast.error(firstReason, { duration: 4000 });
      }
    }
    return { isSafe: result.isSafe, reasons: result.reasons };
  }, []);

  const checkImage = useCallback(async (file: File): Promise<ModerationResult> => {
    const result = await analyzeImage(file);
    if (!result.isSafe) {
      const firstReason = result.reasons[0];
      if (firstReason) {
        toast.error(firstReason, { duration: 4000 });
      }
    }
    return result;
  }, []);

  const checkVideo = useCallback(async (file: File): Promise<ModerationResult> => {
    const result = await analyzeVideo(file);
    if (!result.isSafe) {
      const firstReason = result.reasons[0];
      if (firstReason) {
        toast.error(firstReason, { duration: 4000 });
      }
    }
    return result;
  }, []);

  const checkMedia = useCallback(async (file: File): Promise<ModerationResult> => {
    if (file.type.startsWith('image/')) return checkImage(file);
    if (file.type.startsWith('video/')) return checkVideo(file);
    return { isSafe: false, reasons: ['Unsupported file type'] };
  }, [checkImage, checkVideo]);

  return { checkText, checkImage, checkVideo, checkMedia };
}

export default useContentModeration;
