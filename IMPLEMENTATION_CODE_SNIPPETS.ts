/* PROFESSIONAL IMPROVEMENTS - READY-TO-IMPLEMENT CODE SNIPPETS */

// ============================================================================
// 1. ERROR HANDLING UTILITY - Copy to src/lib/errorHandling.ts
// ============================================================================

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  timestamp?: Date;
}

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: ErrorContext
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ErrorMessages = {
  NETWORK_OFFLINE: 'You appear to be offline. Please check your connection.',
  NETWORK_TIMEOUT: 'Network request timed out. Please try again.',
  PERMISSION_DENIED: 'You don\'t have permission to do this.',
  RESOURCE_NOT_FOUND: 'The resource you\'re looking for was not found.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  UNKNOWN_ERROR: 'Something went wrong. Please try again later.',
} as const;

export function getErrorMessage(error: unknown, context?: string): string {
  if (error instanceof AppError) {
    if (error.code === 'NETWORK_OFFLINE') return ErrorMessages.NETWORK_OFFLINE;
    if (error.code === 'PERMISSION_DENIED') return ErrorMessages.PERMISSION_DENIED;
    if (error.code === 'NOT_FOUND') return ErrorMessages.RESOURCE_NOT_FOUND;
    return error.message;
  }
  
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('network') || msg.includes('fetch')) return ErrorMessages.NETWORK_OFFLINE;
    if (msg.includes('permission')) return ErrorMessages.PERMISSION_DENIED;
    if (msg.includes('timeout')) return ErrorMessages.NETWORK_TIMEOUT;
    if (msg.includes('validation')) return ErrorMessages.VALIDATION_ERROR;
    return error.message;
  }
  
  return ErrorMessages.UNKNOWN_ERROR;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000,
  context?: ErrorContext
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        const backoffDelay = delayMs * Math.pow(2, attempt);
        console.warn(
          `[Retry] Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${backoffDelay}ms...`,
          lastError.message
        );
        await new Promise(r => setTimeout(r, backoffDelay));
      }
    }
  }
  
  throw new AppError(
    `Failed after ${maxRetries} attempts: ${lastError?.message}`,
    'MAX_RETRIES_EXCEEDED',
    context
  );
}

export function logErrorEvent(error: Error, context?: ErrorContext): void {
  // Send to error tracking service (Sentry, LogRocket, etc.)
  if (typeof window !== 'undefined' && (window as any).Sentry) {
    (window as any).Sentry.captureException(error, {
      contexts: { app: context }
    });
  }
  console.error('[ErrorEvent]', { error: error.message, context });
}


// ============================================================================
// 2. ACCESSIBILITY UTILITIES - Copy to src/lib/a11y.ts
// ============================================================================

export const a11y = {
  button: {
    // Proper ARIA attributes for buttons
    getButtonProps: (label: string, icon?: string) => ({
      'aria-label': label,
      'aria-pressed': false, // For toggle buttons
      'title': label,
    }),
    
    // For icon-only buttons
    getIconButtonProps: (label: string) => ({
      'aria-label': label,
      'type': 'button',
      'title': label,
    }),
  },
  
  menu: {
    // Focus management for menus
    getFocusTrap: (containerRef: React.RefObject<HTMLDivElement>) => {
      return {
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Escape') {
            // Close menu
            e.currentTarget.dispatchEvent(new CustomEvent('close-menu'));
          }
          if (e.key === 'Tab') {
            e.preventDefault(); // Trap focus within menu
          }
        },
      };
    },
  },
  
  notification: {
    // ARIA live regions for toast notifications
    getAriaLiveProps: (priority: 'low' | 'high' = 'high') => ({
      'role': 'status',
      'aria-live': priority === 'high' ? 'assertive' : 'polite',
      'aria-atomic': true,
    }),
  },
  
  loading: {
    getLoadingProps: (label = 'Loading...') => ({
      'role': 'status',
      'aria-live': 'polite',
      'aria-label': label,
    }),
  },
};

// Example usage in a component:
export const AccessibleButton = ({ 
  children, 
  onClick, 
  label, 
  icon: Icon 
}: any) => (
  <button
    onClick={onClick}
    {...a11y.button.getButtonProps(label)}
    className="btn"
  >
    {Icon && <Icon size={18} aria-hidden="true" />}
    <span>{children}</span>
  </button>
);


// ============================================================================
// 3. VALIDATION SCHEMAS - Copy to src/lib/schemas.ts
// ============================================================================

import { z } from 'zod';
import DOMPurify from 'dompurify';

// Message validation
export const MessageSchema = z.object({
  content: z.string()
    .min(1, 'Message cannot be empty')
    .max(5000, 'Message is too long')
    .transform(v => DOMPurify.sanitize(v.trim())),
  type: z.enum(['text', 'voice', 'image', 'video', 'file', 'location', 'contact']),
  replyTo: z.string().optional(),
  mediaUrl: z.string().url().optional(),
});

// Call navigation state
export const CallNavigationStateSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  mode: z.enum(['voice', 'video']).optional(),
  callType: z.enum(['voice', 'video']).optional(),
  isOutgoing: z.boolean().optional().default(false),
}).strict();

// Contact from phone
export const PhoneContactSchema = z.object({
  id: z.string(),
  name: z.string()
    .min(1, 'Contact name is required')
    .max(100, 'Name is too long')
    .transform(v => DOMPurify.sanitize(v.trim())),
  email: z.string().email().optional(),
  phone: z.string().regex(/^[0-9+\-\s()]*$/, 'Invalid phone number').optional(),
  avatar: z.string().url().optional(),
});

// Notification filter state
export const NotificationFilterSchema = z.object({
  type: z.enum([
    'all',
    'message', 'call', 'reaction', 'mention', 'group_invite',
    'friend_request', 'money_received', 'group_call', 'post_like',
    'comment', 'friend_removed', 'blocked_interaction'
  ]),
  selectedIds: z.array(z.string()).default([]),
  searchQuery: z.string().max(100).default(''),
});

// Usage example:
export function validateMessage(input: unknown) {
  const result = MessageSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(
      result.error.errors[0].message,
      'VALIDATION_ERROR'
    );
  }
  return result.data;
}


// ============================================================================
// 4. SANITIZATION UTILITIES - Copy to src/lib/sanitization.ts
// ============================================================================

import DOMPurify from 'dompurify';

export const sanitize = {
  html: (html: string): string => {
    return DOMPurify.sanitize(html, { 
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p'],
      ALLOWED_ATTR: [],
    });
  },
  
  text: (text: string): string => {
    return text.trim().slice(0, 5000);
  },
  
  email: (email: string): string => {
    return email.toLowerCase().trim().slice(0, 254);
  },
  
  phone: (phone: string): string => {
    return phone.replace(/[^\d+\-()]/g, '').slice(0, 20);
  },
  
  username: (username: string): string => {
    return username.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 30);
  },
  
  url: (url: string): string => {
    try {
      const parsed = new URL(url);
      return parsed.toString();
    } catch {
      return '';
    }
  },
};


// ============================================================================
// 5. IMPROVED CALLPAGE.tsx - Replace useEffect blocks
// ============================================================================

// Add this hook at the top of CallPage component:

const useCallInitialization = (
  userId: string | undefined,
  currentUser: User | null,
  isVideo: boolean,
  currentCall: Call | null,
  startCall: (uid: string, cid: string, mode: 'voice' | 'video') => Promise<Call>,
  endCall: () => Promise<void>
) => {
  const [error, setError] = useState<string | null>(null);
  const initiatedRef = useRef(false);
  const hadCallRef = useRef(false);
  const switchingToUserIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  // Initialize call
  useEffect(() => {
    isMountedRef.current = true;
    
    if (!userId || !currentUser) return;
    if (initiatedRef.current) return;

    const initializeCall = async () => {
      try {
        if (!isMountedRef.current) return;

        if (currentCall && !currentCall.participantIds.includes(userId)) {
          switchingToUserIdRef.current = userId;
          await endCall();
          initiatedRef.current = false;
          return;
        }

        if (currentCall) return;

        initiatedRef.current = true;
        switchingToUserIdRef.current = null;
        setError(null);

        await withRetry(
          () => startCall(userId, currentUser.id, isVideo ? 'video' : 'voice'),
          2,
          500,
          { component: 'CallPage', action: 'initializeCall' }
        );
      } catch (err) {
        if (isMountedRef.current) {
          const message = getErrorMessage(err);
          setError(message);
          logErrorEvent(err instanceof Error ? err : new Error(String(err)), {
            component: 'CallPage',
            action: 'initializeCall',
            userId,
          });
        }
      }
    };

    initializeCall();

    return () => {
      isMountedRef.current = false;
    };
  }, [userId, currentUser?.id, isVideo, currentCall, startCall, endCall]);

  // Track call establishment
  useEffect(() => {
    if (currentCall) {
      hadCallRef.current = true;
      switchingToUserIdRef.current = null;
    }
  }, [currentCall]);

  return {
    error,
    setError,
    hadCallRef,
    switchingToUserIdRef,
    initiatedRef,
  };
};

// Usage in component:
// const { error, setError, hadCallRef, switchingToUserIdRef } = 
//   useCallInitialization(userId, currentUser, isVideo, currentCall, startCall, endCall);


// ============================================================================
// 6. IMPROVED CONTACTSPAGE.tsx - Batch queries with rate limiting
// ============================================================================

async function findUsersInBatchedQueries(
  emails: string[],
  phones: string[],
  userId: string
): Promise<User[]> {
  const results: User[] = [];
  const seenIds = new Set<string>();
  
  // Batch emails in groups of 5
  const emailBatches = chunk(emails, 5);
  for (const batch of emailBatches) {
    const batchResults = await Promise.all(
      batch.map(email =>
        withRetry(
          () => queryCollection('users', [where('email', '==', email)]),
          2,
          300
        )
      )
    );
    
    batchResults.flat().forEach(user => {
      if (user.id !== userId && !seenIds.has(user.id)) {
        results.push(user);
        seenIds.add(user.id);
      }
    });
    
    // Rate limiting: wait 100ms between batches
    await new Promise(r => setTimeout(r, 100));
  }
  
  // Batch phones similarly
  const phoneBatches = chunk(phones, 5);
  for (const batch of phoneBatches) {
    const batchResults = await Promise.all(
      batch.map(phone =>
        withRetry(
          () => queryCollection('users', [
            where('phone', '>=', phone),
            where('phone', '<=', phone + '\uf8ff')
          ]),
          2,
          300
        )
      )
    );
    
    batchResults.flat().forEach(user => {
      if (user.id !== userId && !seenIds.has(user.id)) {
        results.push(user);
        seenIds.add(user.id);
      }
    });
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  return results;
}

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}


// ============================================================================
// 7. IMPROVED GROUPCHATPAGE.tsx - State reducer
// ============================================================================

interface GroupChatState {
  input: string;
  showMenu: boolean;
  showSearch: boolean;
  searchQuery: string;
  replyingTo: Message | null;
  contextMenu: { msg: Message; x: number; y: number } | null;
  isRecording: boolean;
}

type GroupChatAction =
  | { type: 'SET_INPUT'; payload: string }
  | { type: 'TOGGLE_MENU' }
  | { type: 'TOGGLE_SEARCH' }
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_REPLY'; payload: Message | null }
  | { type: 'SET_CONTEXT_MENU'; payload: GroupChatState['contextMenu'] }
  | { type: 'SET_RECORDING'; payload: boolean }
  | { type: 'RESET' };

const initialGroupChatState: GroupChatState = {
  input: '',
  showMenu: false,
  showSearch: false,
  searchQuery: '',
  replyingTo: null,
  contextMenu: null,
  isRecording: false,
};

function groupChatReducer(state: GroupChatState, action: GroupChatAction): GroupChatState {
  switch (action.type) {
    case 'SET_INPUT':
      return { ...state, input: action.payload };
    case 'TOGGLE_MENU':
      return { ...state, showMenu: !state.showMenu };
    case 'TOGGLE_SEARCH':
      return { ...state, showSearch: !state.showSearch };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.payload };
    case 'SET_REPLY':
      return { ...state, replyingTo: action.payload };
    case 'SET_CONTEXT_MENU':
      return { ...state, contextMenu: action.payload };
    case 'SET_RECORDING':
      return { ...state, isRecording: action.payload };
    case 'RESET':
      return initialGroupChatState;
    default:
      return state;
  }
}

// Usage in component:
// const [state, dispatch] = useReducer(groupChatReducer, initialGroupChatState);
// dispatch({ type: 'SET_INPUT', payload: newInput });


// ============================================================================
// 8. IMPROVED ACCESSIBILITY - CallPage buttons
// ============================================================================

interface CallButtonProps {
  variant: 'primary' | 'secondary' | 'danger';
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export const CallButton: React.FC<CallButtonProps> = ({
  variant,
  icon,
  label,
  onClick,
  disabled = false,
}) => {
  const variantClasses = {
    primary: 'bg-[#00C300] hover:bg-[#00A800] text-white',
    secondary: 'bg-white/10 hover:bg-white/20 text-white',
    danger: 'bg-[#FF3B30] hover:bg-[#E0321B] text-white',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`
        flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00C300]
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-200
        ${variantClasses[variant]}
      `}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
};


// ============================================================================
// 9. DEBUG HOOK - Development/Production monitoring
// ============================================================================

export function usePerformanceMonitor(
  componentName: string,
  operation: string,
  threshold = 1000
) {
  return async <T,>(fn: () => Promise<T>): Promise<T> => {
    const startTime = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      
      if (duration > threshold) {
        console.warn(
          `[Perf] ${componentName}.${operation} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
        );
        if ((window as any).Sentry) {
          (window as any).Sentry.captureMessage(
            `Slow operation: ${componentName}.${operation}`,
            'warning'
          );
        }
      }
      return result;
    } catch (err) {
      const duration = performance.now() - startTime;
      console.error(
        `[Perf] ${componentName}.${operation} failed after ${duration.toFixed(2)}ms`
      );
      throw err;
    }
  };
}


// ============================================================================
// 10. TYPE-SAFE NAVIGATION - For all pages with location.state
// ============================================================================

export function useTypedNavigationState<T extends Record<string, any>>(
  schema: z.ZodSchema<T>
): T | null {
  const location = useLocation();
  
  const result = schema.safeParse(location.state);
  if (!result.success) {
    console.warn('Invalid navigation state:', result.error);
    return null;
  }
  
  return result.data;
}

// Usage:
// const navigationState = useTypedNavigationState(CallNavigationStateSchema);
// if (!navigationState) {
//   navigate('/');
//   return null;
// }


export default {};
