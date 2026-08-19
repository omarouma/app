/// <reference types="vite/client" />
import { z } from 'zod';

// =================================================================================
// Schema Definition
// =================================================================================

/**
 * Defines the schema for environment variables.
 *
 * - `VITE_` prefixed variables are exposed to the client-side.
 * - Non-prefixed variables are for server-side/build-time use only.
 *
 * Use `.refine` for dependent validation (e.g., TURN credentials must be all present or all absent).
 */
const envSchema = z.object({
  // --- Core App Settings (Required) ---
  VITE_SUPABASE_URL: z.string().url("Supabase URL must be a valid URL."),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, "Supabase anon key is required."),
  VITE_FIREBASE_API_KEY: z.string().min(1, "Firebase API key is required."),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1, "Firebase auth domain is required."),
  VITE_FIREBASE_DATABASE_URL: z.string().optional(),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1, "Firebase project ID is required."),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1, "Firebase storage bucket is required."),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1, "Firebase messaging sender ID is required."),
  VITE_FIREBASE_APP_ID: z.string().min(1, "Firebase app ID is required."),
  VITE_FIREBASE_MEASUREMENT_ID: z.string().optional(), // Optional for analytics
  VITE_VAPID_PUBLIC_KEY: z.string().optional(),

  // --- Sentry (Optional) ---
  VITE_SENTRY_DSN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // --- Media Services (Optional) ---
  VITE_CLOUDINARY_CLOUD_NAME: z.string().optional(),
  VITE_CLOUDINARY_UPLOAD_PRESET: z.string().optional(),
  VITE_YOUTUBE_API_KEY: z.string().optional(),
  VITE_YOUTUBE_REGION: z.string().optional(),
  VITE_PEXELS_API_KEY: z.string().optional(),
  VITE_TENOR_API_KEY: z.string().optional(),
  VITE_GA_MEASUREMENT_ID: z.string().optional(),

  // --- Google AdSense (Optional) ---
  VITE_ADSENSE_FEED_SLOT: z.string().optional(),
  VITE_ADSENSE_BANNER_SLOT: z.string().optional(),
  VITE_ADSENSE_SIDEBAR_SLOT: z.string().optional(),

  // --- WebRTC (Conditionally Required) ---
  VITE_TURN_SERVER_URL: z.string().optional(),
  VITE_TURN_SERVER_USERNAME: z.string().optional(),
  VITE_TURN_SERVER_CREDENTIAL: z.string().optional(),

  // --- ZEGO Cloud (Audio/Video Calling) ---
  // App ID is public and safe for the client web app.
  VITE_ZEGO_APP_ID: z.string().optional(),
  // ZEGO signaling server URL — required for the SDK to connect to the right region.
  VITE_ZEGO_SERVER_URL: z.string().url("ZEGO server URL must be a valid websocket or HTTP URL.").optional(),
  // ZEGO Server Secret — used ONLY for test/demo token generation.
  // For production, generate tokens server-side instead.
  VITE_ZEGO_SERVER_SECRET: z.string().optional(),
  // Optional: a serverless endpoint that returns a ZEGO token.
  VITE_ZEGO_TOKEN_SERVER_URL: z
    .string()
    .refine((v) => v.startsWith('/') || /^https?:\/\//i.test(v), {
      message: 'Must be an absolute http(s) URL or a root-relative path (e.g. /api/zego-token).',
    })
    .optional(),

  // --- Vite/Node Specific ---
  MODE: z.enum(['development', 'production', 'test']),
  DEV: z.boolean(),
  PROD: z.boolean(),

}).refine(data => {
  // If one TURN credential is provided, they all must be.
  const turnKeys = [data.VITE_TURN_SERVER_URL, data.VITE_TURN_SERVER_USERNAME, data.VITE_TURN_SERVER_CREDENTIAL];
  const providedCount = turnKeys.filter(Boolean).length;
  return providedCount === 0 || providedCount === 3;
}, {
  message: "Incomplete TURN server credentials. Please provide all three: URL, username, and credential, or none at all.",
  path: ["VITE_TURN_SERVER_URL"], // Path to report the error on
});

// =================================================================================
// Parsing and Export
// =================================================================================

/**
 * Parses the environment variables and returns a validated and typed object.
 * This function will throw an error if validation fails, halting the app's startup.
 * @returns The validated environment variables.
 */
const parseAndValidateEnv = () => {
  try {
    const parsedEnv = envSchema.parse(import.meta.env);

    const fullEnv = {
      ...parsedEnv,
      IS_TURN_CONFIGURED: !!(
        parsedEnv.VITE_TURN_SERVER_URL &&
        parsedEnv.VITE_TURN_SERVER_USERNAME &&
        parsedEnv.VITE_TURN_SERVER_CREDENTIAL
      ),
    };

    if (import.meta.env.DEV && typeof window !== 'undefined') {
      // Only expose non-sensitive keys in dev for debugging
      (window as any).__gagaEnvLoaded = true;
    }

    return fullEnv;
  } catch (error) {
    // In test mode, return a best-effort object so importing modules
    // that load env.ts don't crash the test suite.
    if (import.meta.env.MODE === 'test') {
      console.debug('[env] Skipping env validation in test mode');
      return import.meta.env as unknown as never;
    }
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((e) => `${e.path.join('.')} - ${e.message}`).join('\n');
      const fullMessage = `
        ================================================================================
        ERROR: Invalid or missing environment variables.
        Please check your .env file and ensure all required variables are set correctly.
        --------------------------------------------------------------------------------
        ${errorMessages}
        ================================================================================
      `;
      console.error(fullMessage);
      throw new Error("Environment variable validation failed. See console for details.", { cause: error });
    }
    throw error;
  }
};

const env = parseAndValidateEnv();

// Default export
export default env;