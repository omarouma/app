/*
  Database router — Supabase is the ONLY production backend.
  Historical note: The file is named `firestore.ts` and some exports carry the
  `Firestore` suffix for backwards-compatibility with 30+ existing imports across
  the codebase. The canonical (new) names are exported alongside and should be
  preferred for all new code:
    isFirestoreAvailable  →  isDbAvailable
    fromFirestoreDate     →  fromDbDate
*/
import * as supabaseDb from './supabaseDb';

export const COLLECTIONS = supabaseDb.COLLECTIONS;

/** @deprecated Use `isDbAvailable` for new code — the `Firestore` suffix is legacy naming. */
export const isFirestoreAvailable = supabaseDb.isSupabaseAvailable;
export const isDbAvailable = supabaseDb.isSupabaseAvailable;

export const getDb = supabaseDb.getDb;
export const serverTimestamp = supabaseDb.serverTimestamp;
export const increment = supabaseDb.increment;
export const arrayUnion = supabaseDb.arrayUnion;
export const arrayRemove = supabaseDb.arrayRemove;
export const batchWrite = supabaseDb.batchWrite;
export const Timestamp = supabaseDb.Timestamp;
export const where = supabaseDb.where;
export const orderBy = supabaseDb.orderBy;
export const limit = supabaseDb.limit;
export const startAfter = supabaseDb.startAfter;

export type QueryConstraint = import('./supabaseDb').QueryConstraint;
export type TimestampLike = Date | string;

export async function getDocById<T = any>(
  collectionName: string,
  docId: string,
): Promise<(T & { id: string }) | null> {
  return supabaseDb.getDocById<T>(collectionName, docId);
}

export async function setDocById(
  collectionName: string,
  docId: string,
  data: any,
  merge = true,
) {
  return supabaseDb.setDocById(collectionName, docId, data, merge);
}

export async function updateDocById(collectionName: string, docId: string, data: any) {
  return supabaseDb.updateDocById(collectionName, docId, data);
}

export async function deleteDocById(collectionName: string, docId: string) {
  return supabaseDb.deleteDocById(collectionName, docId);
}

export async function addDocToCollection(collectionName: string, data: any): Promise<string> {
  return supabaseDb.addDocToCollection(collectionName, data);
}

export async function addDocToSubcollection(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  data: any,
) {
  return supabaseDb.addDocToSubcollection(parentCollection, parentId, subcollectionName, data);
}

export async function updateSubcollectionDoc(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  subDocId: string,
  data: any,
) {
  return supabaseDb.updateSubcollectionDoc(
    parentCollection,
    parentId,
    subcollectionName,
    subDocId,
    data,
  );
}

export async function deleteSubcollectionDoc(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  subDocId: string,
) {
  return supabaseDb.deleteSubcollectionDoc(
    parentCollection,
    parentId,
    subcollectionName,
    subDocId,
  );
}

export async function queryCollection<T = any>(
  collectionName: string,
  constraints: any[],
): Promise<(T & { id: string })[]> {
  return supabaseDb.queryCollection<T>(collectionName, constraints);
}

export async function querySubcollection<T = any>(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  constraints: any[],
) {
  return supabaseDb.querySubcollection<T>(parentCollection, parentId, subcollectionName, constraints);
}

export function subscribeToDoc(
  collectionName: string,
  docId: string,
  onData: (data: any) => void,
  onError?: (error: Error) => void,
) {
  const onDataCallback = (data: any) => {
    try {
      onData(data);
    } catch (err) {
      console.error('Error in onData callback:', err);
      if (onError) onError(err as Error);
    }
  };
  return supabaseDb.subscribeToDoc(collectionName, docId, onDataCallback);
}

export function subscribeToCollection<T = any>(
  collectionName: string,
  constraints: any[],
  onData: (data: (T & { id: string })[]) => void,
  onError?: (error: Error) => void,
) {
  const onDataCallback = (data: (T & { id: string })[]) => {
    try {
      onData(data);
    } catch (err) {
      console.error('Error in onData callback:', err);
      if (onError) onError(err as Error);
    }
  };
  return supabaseDb.subscribeToCollection<T>(collectionName, constraints, onDataCallback);
}

export function subscribeToSubcollection<T = any>(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  constraints: any[],
  onData: (data: (T & { id: string })[]) => void,
  onError?: (error: Error) => void,
) {
  const onDataCallback = (data: (T & { id: string })[]) => {
    try {
      onData(data);
    } catch (err) {
      console.error('Error in onData callback:', err);
      if (onError) onError(err as Error);
    }
  };
  return supabaseDb.subscribeToSubcollection<T>(
    parentCollection,
    parentId,
    subcollectionName,
    constraints,
    onDataCallback,
  );
}

export async function batchDelete(
  arg1: string | { collection: string; docId: string }[],
  arg2?: any[],
): Promise<void> {
  return supabaseDb.batchDelete(arg1, arg2);
}

/** @deprecated Use `fromDbDate` for new code — the `Firestore` suffix is legacy naming. */
export function fromFirestoreDate(d: any): Date | null {
  return supabaseDb.fromFirestoreDate(d);
}

export function fromDbDate(d: unknown): Date | null {
  return supabaseDb.fromFirestoreDate(d);
}

export function updateSubcollectionDocSafe(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  subDocId: string,
  data: any,
) {
  return supabaseDb.updateSubcollectionDocSafe(
    parentCollection,
    parentId,
    subcollectionName,
    subDocId,
    data,
  );
}

export async function getDbSafe() {
  return supabaseDb.getDbSafe();
}

export async function runDbTransaction<T>(
  updateFn: (transaction: any) => Promise<T>,
): Promise<T> {
  return supabaseDb.runDbTransaction<T>(updateFn);
}
