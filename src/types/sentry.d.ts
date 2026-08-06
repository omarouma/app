// Ambient declaration for @sentry/react which is loaded dynamically (optional)
// and is not installed as a dependency. This satisfies TypeScript's module
// resolution for the lazy import in src/main.tsx.

declare module '@sentry/react';
