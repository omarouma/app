// Firestore access for import/export/reconcile.
//
// `firebase-admin` is imported lazily so `--dry-run` (and the offline tests)
// work without the dependency installed or any credentials present. Credentials
// come from the standard `GOOGLE_APPLICATION_CREDENTIALS` path, exactly as the
// runbook prescribes; nothing is hard-coded.

let cachedAdmin = null;
let cachedDb = null;

export async function getAdmin() {
  if (cachedAdmin) return cachedAdmin;
  let mod;
  try {
    mod = await import('firebase-admin');
  } catch (error) {
    throw new Error(
      `firebase-admin is not installed. Run "npm install" in tools/migration. (${error.message})`,
    );
  }
  const admin = mod.default ?? mod;
  if (!admin.apps || admin.apps.length === 0) {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS must point at the Firebase service-account JSON.');
    }
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  cachedAdmin = admin;
  return admin;
}

export async function getDb() {
  if (cachedDb) return cachedDb;
  const admin = await getAdmin();
  cachedDb = admin.firestore();
  return cachedDb;
}

/**
 * Writes documents with `{ merge: true }` in bounded batches. Idempotent by
 * construction: re-running rewrites the same documents keyed on the original id.
 */
export function createBatchWriter(db, { batchSize = 400 } = {}) {
  let batch = db.batch();
  let pending = 0;
  let written = 0;

  async function flush() {
    if (!pending) return;
    await batch.commit();
    written += pending;
    batch = db.batch();
    pending = 0;
  }

  return {
    set(collectionPath, id, data) {
      const ref = id === undefined || id === null
        ? db.collection(collectionPath).doc()
        : db.collection(collectionPath).doc(String(id));
      batch.set(ref, data, { merge: true });
      pending += 1;
      return pending >= batchSize ? flush() : Promise.resolve();
    },
    flush,
    get written() {
      return written + pending;
    },
  };
}
