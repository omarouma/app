/*
  Firestore helper layer.

  The app code imports from '@/lib/firestore'. In this repo, those helpers were referenced
  but the file was missing, causing hundreds of TS2307 errors.

  This implementation provides the minimal API surface used across the app:
  - initialize/get db
  - CRUD helpers for docs (by id) and collections
  - query helpers (where/orderBy/limit/startAfter)
  - realtime helpers (subscribeToDoc / subscribeToCollection / subscribeToSubcollection)
  - batchDelete

  Notes:
  - This is client-side Firestore only.
  - Rules in firestore.rules govern access.
*/
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  type Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  getDocs,
  onSnapshot,
  serverTimestamp as _serverTimestamp,
  increment as _increment,
  arrayUnion as _arrayUnion,
  arrayRemove as _arrayRemove,
  runTransaction,
  Timestamp,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import { getFirestoreDB } from '@/lib/firebase';

// Re-export a few common Firestore builders so existing imports keep working.
export {
  where,
  orderBy,
  limit,
  startAfter,
} from 'firebase/firestore';

export type TimestampLike = Timestamp | Date | string;

export const serverTimestamp = () => _serverTimestamp();

export const increment = (n: number) => _increment(n);
export const arrayUnion = <T>(...values: T[]) => _arrayUnion(...values);
export const arrayRemove = <T>(...values: T[]) => _arrayRemove(...values);

export async function batchWrite(operations: Array<{ collection: string; docId: string; data?: any }>) {
  const db = getDb();
  if (!db) return;
  const batch = writeBatch(db);
  for (const op of operations) {
    const ref = doc(db, op.collection, op.docId);
    if (op.data) {
      batch.update(ref, op.data);
    }
  }
  await batch.commit();
}

export async function runDbTransaction<T>(updateFn: (transaction: any) => Promise<T>): Promise<T> {
  const db = getDb();
  if (!db) throw new Error('Firestore not available');
  return runTransaction(db, updateFn);
}

export const isFirestoreAvailable = () => {
  try {
    const db = getFirestoreDB();
    return !!db;
  } catch {
    return false;
  }
};

export function getDb(): Firestore | null {
  return getFirestoreDB();
}

// Collection names used throughout the app.
export const COLLECTIONS = {
  CHATS: 'chats',
  MESSAGES: 'messages',
  USERS: 'users',
  POSTS: 'posts',
  STORIES: 'stories',
  REELS: 'reels',
  LIVE_STREAMS: 'liveStreams',
  FRIENDSHIPS: 'friendships',
  FRIEND_REQUESTS: 'friendRequests',
  BLOCKED_USERS: 'blockedUsers',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
  SUBSCRIPTIONS: 'subscriptions',
  REFERRALS: 'referrals',
  TIPS: 'tips',
  CREATOR_SUBSCRIPTIONS: 'creatorSubscriptions',
  ADS: 'ads',
  ACHIEVEMENTS: 'achievements',
  STREAKS: 'streaks',
  POST_VIEWS: 'postViews',
  STORY_HIGHLIGHTS: 'storyHighlights',
  BOOKMARKS: 'bookmarks',
  BOOKMARK_COLLECTIONS: 'bookmarkCollections',
  CALL_HISTORY: 'callHistory',
  HASHTAGS: 'hashtags',
  POLLS: 'polls',
  WALLETS: 'wallets',
  PRESENCE: 'presence',
  TYPING: 'typing',
  REPORTS: 'reports',
  VOICE_ROOMS: 'voiceRooms',
  BROADCAST_LISTS: 'broadcast_lists',
  USER_REPORTS: 'userReports',
};




export async function getDocById<T = DocumentData>(collectionName: string, docId: string) {
  const db = getDb();
  if (!db) return null;
  const snap = await getDoc(doc(db, collectionName, docId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as DocumentData), } as T & { id: string };
}

export async function setDocById(collectionName: string, docId: string, data: DocumentData, merge = true) {
  const db = getDb();
  if (!db) throw new Error('Firestore not available');
  await setDoc(doc(db, collectionName, docId), data, { merge });
}

export async function updateDocById(collectionName: string, docId: string, data: DocumentData) {
  const db = getDb();
  if (!db) throw new Error('Firestore not available');
  await updateDoc(doc(db, collectionName, docId), data);
}

export async function deleteDocById(collectionName: string, docId: string) {
  const db = getDb();
  if (!db) throw new Error('Firestore not available');
  await deleteDoc(doc(db, collectionName, docId));
}

export async function addDocToCollection(collectionName: string, data: DocumentData) {
  const db = getDb();
  if (!db) throw new Error('Firestore not available');
  const colRef = collection(db, collectionName);
  const ref = await addDoc(colRef, data);
  return ref.id;
}

// Subcollection helpers: /{parentCollection}/{parentId}/{subCollection}/{docId}
export async function addDocToSubcollection(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  data: DocumentData
) {
  const db = getDb();
  if (!db) throw new Error('Firestore not available');
  const subRef = collection(db, parentCollection, parentId, subcollectionName);
  const ref = await addDoc(subRef, data);
  return ref.id;
}

export async function updateSubcollectionDoc(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  subDocId: string,
  data: DocumentData
) {
  const db = getDb();
  if (!db) throw new Error('Firestore not available');
  const ref = doc(db, parentCollection, parentId, subcollectionName, subDocId);
  await updateDoc(ref, data);
}

export async function deleteSubcollectionDoc(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  subDocId: string
) {
  const db = getDb();
  if (!db) throw new Error('Firestore not available');
  const ref = doc(db, parentCollection, parentId, subcollectionName, subDocId);
  await deleteDoc(ref);
}

export async function queryCollection<T = DocumentData>(collectionName: string, constraints: QueryConstraint[]) {
  const db = getDb();
  if (!db) return [];
  const q = query(collection(db, collectionName), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as T & { id: string });
}

export async function querySubcollection<T = DocumentData>(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  constraints: QueryConstraint[]
) {
  const db = getDb();
  if (!db) return [];
  const colRef = collection(db, parentCollection, parentId, subcollectionName);
  const q = query(colRef, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as T & { id: string });
}

export function subscribeToDoc(
  collectionName: string,
  docId: string,
  onData: (data: any) => void
): Unsubscribe {
  const db = getDb();
  if (!db) return () => {};
  const ref = doc(db, collectionName, docId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      onData({ id: snap.id, ...(snap.data() as DocumentData) });
    },
    (err) => {
      console.error(`[subscribeToDoc] ${collectionName}/${docId}:`, err);
    }
  );
}

export function subscribeToCollection<T = DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[],
  onData: (data: (T & { id: string })[]) => void
): Unsubscribe {
  const db = getDb();
  if (!db) return () => {};
  const colRef = collection(db, collectionName);
  const q = query(colRef, ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as T & { id: string }));
    },
    (err) => {
      console.error(`[subscribeToCollection] ${collectionName}:`, err);
    }
  );
}

export function subscribeToSubcollection<T = DocumentData>(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  constraints: QueryConstraint[],
  onData: (data: (T & { id: string })[]) => void
): Unsubscribe {
  const db = getDb();
  if (!db) return () => {};
  const colRef = collection(db, parentCollection, parentId, subcollectionName);
  const q = query(colRef, ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as T & { id: string }));
    },
    (err) => {
      console.error(`[subscribeToSubcollection] ${parentCollection}/${parentId}/${subcollectionName}:`, err);
    }
  );
}

export async function batchDelete(
  collectionName: string,
  constraints?: QueryConstraint[]
): Promise<void>;
export async function batchDelete(
  items: { collection: string; docId: string }[]
): Promise<void>;
export async function batchDelete(
  arg1: string | { collection: string; docId: string }[],
  arg2?: QueryConstraint[]
): Promise<void> {
  const db = getDb();
  if (!db) return;

  const batch = writeBatch(db);

  if (typeof arg1 === 'string') {
    const collectionName = arg1;
    const constraints = arg2 || [];
    const q =
      constraints.length > 0
        ? query(collection(db, collectionName), ...constraints)
        : query(collection(db, collectionName));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => batch.delete(d.ref));
  } else {
    const items = arg1;
    items.forEach((item) => {
      const ref = doc(db, item.collection, item.docId);
      batch.delete(ref);
    });
  }

  await batch.commit();
}


// Compatibility helpers referenced by some components.
export function fromFirestoreDate(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d?.toDate === 'function') return d.toDate();
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

export function updateSubcollectionDocSafe(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  subDocId: string,
  data: DocumentData
) {
  return updateSubcollectionDoc(parentCollection, parentId, subcollectionName, subDocId, data);
}

export async function getDbSafe(): Promise<Firestore | null> {
  return getDb();
}

export { Timestamp };
