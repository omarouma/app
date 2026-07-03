/*
  Database router: uses Supabase when configured, falls back to Firebase Firestore.
  
  This file exports the same interface as both supabaseDb.ts and firestoreLegacy.ts,
  so stores and pages don't need to change their imports.
*/
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as supabaseDb from './supabaseDb';
import * as firestoreLegacy from './firestoreLegacy';

// Resolve backend once at module load — Supabase is the primary backend.
// Firebase is kept as fallback only when Supabase is NOT configured.
const IS_SUPABASE = supabaseDb.isSupabaseAvailable();
const db = IS_SUPABASE ? supabaseDb : firestoreLegacy;

// Export the same interface regardless of backend
export const COLLECTIONS = db.COLLECTIONS;
export const isFirestoreAvailable = IS_SUPABASE
  ? supabaseDb.isSupabaseAvailable
  : firestoreLegacy.isFirestoreAvailable;
export const getDb = db.getDb;
export const serverTimestamp = db.serverTimestamp;
export const increment = db.increment;
export const arrayUnion = db.arrayUnion;
export const arrayRemove = db.arrayRemove;
export const batchWrite = db.batchWrite;
export const Timestamp = db.Timestamp;
export const where = db.where;
export const orderBy = db.orderBy;
export const limit = db.limit;
export const startAfter = db.startAfter;

export type QueryConstraint = any;
export type TimestampLike = Date | string;

export async function getDocById<T = any>(collectionName: string, docId: string): Promise<(T & { id: string }) | null> {
  return IS_SUPABASE
    ? supabaseDb.getDocById<T>(collectionName, docId)
    : firestoreLegacy.getDocById<T>(collectionName, docId);
}

export async function setDocById(collectionName: string, docId: string, data: any, merge = true) {
  return IS_SUPABASE
    ? supabaseDb.setDocById(collectionName, docId, data, merge)
    : firestoreLegacy.setDocById(collectionName, docId, data, merge);
}

export async function updateDocById(collectionName: string, docId: string, data: any) {
  return IS_SUPABASE
    ? supabaseDb.updateDocById(collectionName, docId, data)
    : firestoreLegacy.updateDocById(collectionName, docId, data);
}

export async function deleteDocById(collectionName: string, docId: string) {
  return IS_SUPABASE
    ? supabaseDb.deleteDocById(collectionName, docId)
    : firestoreLegacy.deleteDocById(collectionName, docId);
}

export async function addDocToCollection(collectionName: string, data: any): Promise<string> {
  return IS_SUPABASE
    ? supabaseDb.addDocToCollection(collectionName, data)
    : firestoreLegacy.addDocToCollection(collectionName, data);
}

export async function addDocToSubcollection(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  data: any
) {
  return IS_SUPABASE
    ? supabaseDb.addDocToSubcollection(parentCollection, parentId, subcollectionName, data)
    : firestoreLegacy.addDocToSubcollection(parentCollection, parentId, subcollectionName, data);
}

export async function updateSubcollectionDoc(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  subDocId: string,
  data: any
) {
  return IS_SUPABASE
    ? supabaseDb.updateSubcollectionDoc(parentCollection, parentId, subcollectionName, subDocId, data)
    : firestoreLegacy.updateSubcollectionDoc(parentCollection, parentId, subcollectionName, subDocId, data);
}

export async function deleteSubcollectionDoc(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  subDocId: string
) {
  return IS_SUPABASE
    ? supabaseDb.deleteSubcollectionDoc(parentCollection, parentId, subcollectionName, subDocId)
    : firestoreLegacy.deleteSubcollectionDoc(parentCollection, parentId, subcollectionName, subDocId);
}

export async function queryCollection<T = any>(collectionName: string, constraints: any[]): Promise<(T & { id: string })[]> {
  return IS_SUPABASE
    ? supabaseDb.queryCollection<T>(collectionName, constraints)
    : firestoreLegacy.queryCollection<T>(collectionName, constraints);
}

export async function querySubcollection<T = any>(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  constraints: any[]
) {
  return IS_SUPABASE
    ? supabaseDb.querySubcollection<T>(parentCollection, parentId, subcollectionName, constraints)
    : firestoreLegacy.querySubcollection<T>(parentCollection, parentId, subcollectionName, constraints);
}

export function subscribeToDoc(collectionName: string, docId: string, onData: (data: any) => void) {
  return IS_SUPABASE
    ? supabaseDb.subscribeToDoc(collectionName, docId, onData)
    : firestoreLegacy.subscribeToDoc(collectionName, docId, onData);
}

export function subscribeToCollection<T = any>(
  collectionName: string,
  constraints: any[],
  onData: (data: (T & { id: string })[]) => void
) {
  return IS_SUPABASE
    ? supabaseDb.subscribeToCollection<T>(collectionName, constraints, onData)
    : firestoreLegacy.subscribeToCollection<T>(collectionName, constraints, onData);
}

export function subscribeToSubcollection<T = any>(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  constraints: any[],
  onData: (data: (T & { id: string })[]) => void
) {
  return IS_SUPABASE
    ? supabaseDb.subscribeToSubcollection<T>(parentCollection, parentId, subcollectionName, constraints, onData)
    : firestoreLegacy.subscribeToSubcollection<T>(parentCollection, parentId, subcollectionName, constraints, onData);
}

export async function batchDelete(
  arg1: string | { collection: string; docId: string }[],
  arg2?: any[]
): Promise<void> {
  return IS_SUPABASE
    ? supabaseDb.batchDelete(arg1, arg2)
    : (firestoreLegacy.batchDelete as any)(arg1, arg2);
}

export function fromFirestoreDate(d: any): Date | null {
  return IS_SUPABASE
    ? supabaseDb.fromFirestoreDate(d)
    : firestoreLegacy.fromFirestoreDate(d);
}

export function updateSubcollectionDocSafe(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  subDocId: string,
  data: any
) {
  return IS_SUPABASE
    ? supabaseDb.updateSubcollectionDocSafe(parentCollection, parentId, subcollectionName, subDocId, data)
    : firestoreLegacy.updateSubcollectionDocSafe(parentCollection, parentId, subcollectionName, subDocId, data);
}

export async function getDbSafe() {
  return IS_SUPABASE ? supabaseDb.getDbSafe() : firestoreLegacy.getDbSafe();
}

export async function runDbTransaction<T>(updateFn: (transaction: any) => Promise<T>): Promise<T> {
  return IS_SUPABASE
    ? supabaseDb.runDbTransaction<T>(updateFn)
    : firestoreLegacy.runDbTransaction<T>(updateFn);
}
