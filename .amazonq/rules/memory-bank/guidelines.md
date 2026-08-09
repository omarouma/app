# GaGa Chat — Development Guidelines

## Code Quality Standards

### TypeScript
- Strict TypeScript throughout — no `any` except where unavoidable (use `unknown` + type guards instead)
- All types/interfaces live in `src/types/index.ts` — single source of truth; never define domain types inline
- Use `type` for union/alias types, `interface` for object shapes
- Prefer explicit return types on exported functions and hooks
- Use `Record<string, T>` for dynamic key maps, not `{ [key: string]: T }`
- Cast unknown data with explicit type guards (see `isFirestoreTs` pattern in stores)

### Naming Conventions
- Components: PascalCase (`ChatRoom`, `MessageItem`)
- Hooks: camelCase prefixed with `use` (`useChatRoom`, `useContentModeration`)
- Stores: camelCase prefixed with `use` + `Store` suffix (`useFriendStore`, `useChatStore`)
- Constants: SCREAMING_SNAKE_CASE (`SWIPE_THRESHOLD`, `HIDE_BOTTOM_NAV_PATHS`, `COLLECTIONS`)
- Event handlers: `handle` prefix (`handleSend`, `handleDelete`, `handleEditStart`)
- Boolean state: `is`/`has`/`show` prefix (`isRecording`, `hasMore`, `showSearch`)
- Subscription functions: `subscribe` prefix (`subscribeFriends`, `subscribeChats`)

### File Organization
- One component per file; filename matches export name
- Hooks in `src/hooks/`, stores in `src/store/`, types in `src/types/index.ts`
- Feature-specific components in `src/components/features/<feature>/`
- Shared UI primitives in `src/components/ui/` (shadcn/ui pattern)

---

## Zustand Store Patterns

All stores follow this structure:

```ts
// 1. Define interface with state + actions
interface FooStore {
  items: Item[];
  loading: boolean;
  subscribe: (userId: string) => () => void;  // returns unsubscribe fn
  doAction: (id: string) => Promise<void>;
}

// 2. Create with create<FooStore>((set, get) => ({ ... }))
export const useFooStore = create<FooStore>((set, get) => ({
  items: [],
  loading: false,
  // ...
}));
```

Key patterns:
- Always guard with `if (!isFirestoreAvailable()) { console.warn('[StoreName.method] Firestore unavailable'); return ...; }`
- Subscription methods return an unsubscribe function `() => void`
- Use `set((state) => ({ ... }))` for functional updates; use `set({ ... })` for simple overwrites
- Avoid re-renders: compare before setting (e.g., compare joined IDs before updating friends list)
- Use `get()` to access current state inside async actions
- Dynamic imports to break circular dependencies: `const { useChatStore } = await import('./useChatStore')`
- Map raw DB records with a dedicated `mapUser` / `mapItem` function that provides safe defaults

### Data Mapping Pattern
```ts
const mapUser = (u: Record<string, unknown>): User => ({
  id: u.id as string,
  name: (u.name as string) || 'User',
  // always provide fallback defaults for optional fields
  coins: (u.coins as number) || 0,
  friends: (u.friends as string[]) || [],
});
```

### Timestamp Handling
```ts
type FirestoreTimestamp = { toDate: () => Date };
function isFirestoreTs(v: unknown): v is FirestoreTimestamp {
  return typeof v === 'object' && v !== null && 'toDate' in v;
}
function toDate(raw: unknown): Date {
  if (isFirestoreTs(raw)) return raw.toDate();
  if (raw) return new Date(raw as string | number | Date);
  return new Date();
}
```

---

## Data Access Patterns

### Always use the firestore router
```ts
import { getDocById, queryCollection, subscribeToCollection, COLLECTIONS } from '@/lib/firestore';
import { where, orderBy, limit } from '@/lib/firestore';
```
Never import Supabase or Firebase directly in stores/components — use `@/lib/firestore` as the abstraction layer.

### Query pattern
```ts
const data = await queryCollection(COLLECTIONS.USERS, [
  where('userId', '==', userId),
  orderBy('createdAt', 'desc'),
  limit(20),
]);
```

### Subscription pattern
```ts
const unsub = subscribeToCollection(
  COLLECTIONS.MESSAGES,
  [where('chatId', '==', chatId)],
  (data) => { set({ messages: data }); }
);
return () => { if (unsub) unsub(); };
```

### Batch fetch pattern (avoid N+1)
```ts
const batchFetchUsers = async (ids: string[]): Promise<User[]> => {
  if (!ids.length) return [];
  try {
    const data = await queryCollection(COLLECTIONS.USERS, [where('id', 'in', ids.slice(0, 30))]);
    return (data || []).map(mapUser);
  } catch {
    // fallback: sequential fetch
    const users: User[] = [];
    for (const id of ids) {
      const u = await getDocById(COLLECTIONS.USERS, id);
      if (u) users.push(mapUser(u));
    }
    return users;
  }
};
```

---

## React Component Patterns

### Hook decomposition for complex components
Large features (ChatRoom, etc.) split logic across focused hooks:
```ts
// In the component, destructure everything from the orchestrating hook:
const { messages, handleSend, input, setInput, ... } = useChatRoom(chatId, userId);
```

### Lazy loading (all pages/views)
```ts
const ChatsPage = lazy(() => import('@/pages/ChatsPage'));
// Always wrap in <Suspense fallback={<PageLoader />}>
```

### Error boundaries
Every route element is wrapped:
```tsx
<ErrorBoundary key="chats"><ChatsPage /></ErrorBoundary>
```

### Memoization
- Use `memo()` for pure presentational components rendered in lists
- Use `useCallback` for all event handlers passed as props (prevents child re-renders)
- Use `useMemo` for derived/computed values (search results, filtered lists)
- Use stable refs (`useRef`) for subscription functions to avoid re-subscription on render

```ts
// Stable ref pattern for subscriptions
const subscribeRef = useRef(subscribe);
useLayoutEffect(() => { subscribeRef.current = subscribe; });
useEffect(() => {
  if (!user?.id) return;
  const unsub = subscribeRef.current(user.id);
  return () => unsub();
}, [user?.id]);
```

### Virtualized lists
Use `react-virtuoso` for all long message/feed lists:
```tsx
<Virtuoso
  ref={virtuoso}
  data={msgs}
  initialTopMostItemIndex={msgs.length - 1}
  followOutput="auto"
  itemContent={(index, msg) => <MessageItem ... />}
/>
```

---

## UI & Styling Patterns

### Class merging utility
Always use `cn()` from `@/lib/utils` (wraps `clsx` + `tailwind-merge`):
```ts
import { cn } from '@/lib/utils';
className={cn('base-classes', condition && 'conditional-class', props.className)}
```

### Brand colors (use consistently)
- Primary green: `#00C300` (active states, CTAs, brand)
- Text primary: `#111111`
- Text secondary: `#8D8D8D`
- Background: `#F5F5F5` (inputs, secondary buttons)
- Border: `#EBEBEB`
- Danger/delete: `#FF3B30`

### Button patterns
```tsx
// Primary action
<button className="bg-[#00C300] text-white rounded-xl py-3 font-bold disabled:opacity-50">

// Secondary/cancel
<button className="bg-[#F5F5F5] text-[#111111] rounded-xl py-3 font-bold">

// Destructive
<button className="bg-[#FF3B30] text-white rounded-xl py-3 font-bold">
```

### Modal/sheet pattern (bottom sheet on mobile)
```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white rounded-t-3xl p-5 w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        {/* content */}
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
```

### Center dialog pattern
```tsx
<motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
  className="bg-white rounded-2xl p-6 max-w-sm w-full"
  onClick={e => e.stopPropagation()}
>
```

### Active nav item pattern
```tsx
const isActive = location.pathname === item.to;
className={isActive ? 'bg-[#00C300]/10 text-[#00C300]' : 'text-[#8D8D8D] hover:text-[#111111] hover:bg-[#F5F5F5]'}
```

---

## Error Handling Patterns

### Async actions in stores
```ts
try {
  // operation
} catch (err: unknown) {
  console.error('[StoreName.methodName] Error:', err);
  throw err; // re-throw so UI can handle
}
```

### User-facing errors
Use `toast.error(message)` from `sonner` for all user-visible errors:
```ts
import { toast } from 'sonner';
toast.success('Done!');
toast.error(err instanceof Error ? err.message : 'Something went wrong');
```

### Silent failures (non-critical)
Catch and swallow with empty catch blocks for non-critical operations:
```ts
try { localStorage.setItem(key, value); } catch { /* ignore */ }
```

### Availability guard (all store methods)
```ts
if (!isFirestoreAvailable()) {
  console.warn('[StoreName.method] Firestore unavailable');
  return defaultValue;
}
```

---

## Hook Patterns

### useCallback dependencies
- Always include all referenced state/props in deps array
- Use `// eslint-disable-next-line react-hooks/exhaustive-deps` only when intentionally omitting stable refs
- Prefer stable refs over disabling the rule

### Hook return shape
Hooks return a flat object of state + handlers:
```ts
export function useFoo() {
  // state
  const [value, setValue] = useState('');
  // handlers
  const handleChange = useCallback((v: string) => setValue(v), []);
  return { value, setValue, handleChange };
}
```

### Content moderation hook usage
```ts
const { checkText, checkMedia } = useContentModeration();
// Before sending:
const result = checkText(input);
if (!result.isSafe) return; // toast already shown by hook
```

---

## Routing Conventions

- Mobile routes: defined in `MOBILE_PROTECTED_ROUTE_PATHS` array, rendered via `getMobileRouteElement(path)` switch
- Desktop routes: nested under a `/*` catch-all with `DesktopNav` sidebar
- Auth guard: `<ProtectedRoute element={...} isAuthenticated={isAuthenticated} />`
- Admin guard: `<ProtectedRoute adminOnly isAuthenticated={...} isAdmin={user?.isAdmin} />`
- Redirect after auth: `isMobile ? '/chats' : '/chat'`
- Public paths that skip auth: `/privacy`, `/terms`, `/cookies`, `/community-guidelines`

---

## PWA & Service Worker

- SW registered in `useServiceWorker()` hook inside `AppContent`
- Update prompt shown via `toast.info()` with "Update Now" action
- Background sync tag: `'sync-messages'`
- SW version tracked in `localStorage` key `'gaga_sw_last_version'`
- SW messages handled: `SW_VERSION` (version check + reload), `NAVIGATE` (deep link)

---

## Performance Guidelines

- All pages are lazy-loaded with `React.lazy()` + `<Suspense>`
- Virtualize all lists longer than ~20 items with `react-virtuoso`
- Batch DB reads: use `where('id', 'in', ids.slice(0, 30))` (Firestore/Supabase limit: 30)
- Avoid re-subscriptions: use stable refs + `useLayoutEffect` to keep subscription functions current
- `optimizeDeps.include: ['lucide-react']` in vite config for faster dev startup
- Each npm package gets its own chunk via `manualChunks` in rollup config

---

## Security Guidelines

- Sanitize all media URLs before rendering: `sanitizeMediaUrl(url)` from `@/lib/utils`
- Sanitize user input before DB writes: `@/lib/sanitize`
- Never expose raw DB errors to users — log with `console.error`, show generic toast
- All Supabase tables have RLS enabled — never bypass with service role key in client code
- Content moderation: run `checkText()` before sending messages, `checkMedia()` before uploads
- Blocked file extensions: `.exe`, `.bat`, `.cmd`, `.scr`, `.msi`, `.vbs`, `.ps1`, `.sh`
