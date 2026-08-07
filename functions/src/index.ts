
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

interface Contact {
  name: string;
  email?: string;
  phone?: string;
}

export const matchContacts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { contacts } = data;

  if (!Array.isArray(contacts)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with an array of contacts."
    );
  }

  const phoneNumbers = contacts
    .map((c: Contact) => c.phone)
    .filter(Boolean) as string[];
  const emails = contacts
    .map((c: Contact) => c.email)
    .filter(Boolean) as string[];

  const usersRef = admin.firestore().collection("users");
  const matchedUsers: Record<string, unknown>[] = [];

  if (emails.length > 0) {
    const emailSnapshot = await usersRef.where("email", "in", emails).get();
    emailSnapshot.forEach((doc) => {
      matchedUsers.push(doc.data());
    });
  }

  if (phoneNumbers.length > 0) {
    const phoneSnapshot = await usersRef
      .where("phone", "in", phoneNumbers)
      .get();
    phoneSnapshot.forEach((doc) => {
      if (!matchedUsers.some((user) => user.uid === doc.data().uid)) {
        matchedUsers.push(doc.data());
      }
    });
  }

  return { matchedUsers };
});