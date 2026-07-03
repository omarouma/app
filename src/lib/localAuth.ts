// Local auth fallback used when Firebase Auth isn’t configured.
// The app expects simple get/set + search helpers.

import type { User } from '@/types';

const LOCAL_KEY = 'gaga_chat_local_users';
const LOCAL_USER_KEY = 'gaga_chat_local_user';

function readAll(): User[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as User[];
  } catch {
    return [];
  }
}

function writeAll(users: User[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(users));
}

export function getLocalUser(): User | null {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function setLocalUser(user: User | null) {
  if (!user) {
    localStorage.removeItem(LOCAL_USER_KEY);
    return;
  }
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));

  // ensure in local users list for search
  const all = readAll();
  const idx = all.findIndex((u) => u.id === user.id);
  if (idx >= 0) all[idx] = user;
  else all.push(user);
  writeAll(all);
}

// ─────────────────────────────
// Demo/local auth implementation
// ─────────────────────────────
// This app expects many auth helpers; for production use Firebase.
// For now these functions store users in localStorage.

type StoredLocalUser = User & { passwordHash?: string; phoneOtp?: { code: string; expiresAt: number }; phone?: string };

function loadUsers(): StoredLocalUser[] {
  return readAll() as StoredLocalUser[];
}

function saveUsers(users: StoredLocalUser[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(users));
}

function safeId(email: string): string {
  return `local_${btoa(unescape(encodeURIComponent(email))).slice(0, 20)}`;
}

function simpleHash(s: string): string {
  // non-crypto hash for local demo only
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

export async function localSignUp(name: string, email: string, password: string): Promise<{ success: boolean; needsEmailVerification?: boolean; error?: string; user?: User }> {
  const users = loadUsers();
  if (users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
    return { success: false, error: 'Email already exists' };
  }
  const user: StoredLocalUser = {
    id: safeId(email),
    name,
    email,
    username: (name || 'user').toLowerCase().replace(/\s+/g, '_'),
    avatar: '',
    phone: undefined,
    passwordHash: simpleHash(password),
    bio: '',
    isAdmin: false,
    favorites: [],
  };
  users.push(user);
  saveUsers(users);
  setLocalUser(user);
  return { success: true, user };
}

export async function localLogin(email: string, password: string): Promise<{ success: boolean; needsEmailVerification?: boolean; error?: string; user?: User }> {
  const users = loadUsers();
  const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) return { success: false, error: 'Invalid credentials' };
  if (user.passwordHash && user.passwordHash !== simpleHash(password)) return { success: false, error: 'Invalid credentials' };
  setLocalUser(user);
  return { success: true, user };
}

export async function localLogout(): Promise<void> {
  setLocalUser(null);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function localResetPassword(_email: string): Promise<{ success: boolean; error?: string }> {
  // demo: always success
  return { success: true };
}

export async function sendPhoneOtp(phone: string): Promise<{ success: boolean; error?: string }> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const users = loadUsers();
  let u = users.find((x) => x.phone === phone);
  if (!u) {
    u = {
      id: `local_phone_${phone}`,
      name: `User_${phone.slice(-4)}`,
      email: undefined,
      username: `user_${phone.slice(-4)}`,
      avatar: '',
      phone,
      bio: '',
      isAdmin: false,
      favorites: [],
      passwordHash: undefined,
    };
    users.push(u);
  }
  u.phoneOtp = { code, expiresAt };
  saveUsers(users);
  // In real app, SMS provider sends this code.
  // DO NOT log OTP codes in production.
  return { success: true };
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<{ success: boolean; error?: string; user?: User }> {
  const users = loadUsers();
  const u = users.find((x) => x.phone === phone);
  if (!u?.phoneOtp) return { success: false, error: 'No OTP sent' };
  if (Date.now() > u.phoneOtp.expiresAt) return { success: false, error: 'OTP expired' };
  if (u.phoneOtp.code !== token) return { success: false, error: 'Invalid OTP' };

  // mark OTP as used by clearing
  u.phoneOtp = undefined;
  saveUsers(users);
  setLocalUser(u);
  return { success: true, user: u };
}

export async function localPhoneSignUp(name: string, phone: string): Promise<{ success: boolean; error?: string; user?: User }> {
  const users = loadUsers();
  let u = users.find((x) => x.phone === phone);
  if (!u) {
    u = {
      id: `local_phone_${phone}`,
      name,
      email: undefined,
      username: (name || 'user').toLowerCase().replace(/\s+/g, '_'),
      avatar: '',
      phone,
      bio: '',
      isAdmin: false,
      favorites: [],
    };
    users.push(u);
  } else {
    u.name = name;
  }
  saveUsers(users);
  setLocalUser(u);
  return { success: true, user: u };
}

export function searchLocalUsersByUsername(username: string): User[] {
  const all = readAll();
  const q = username.trim().toLowerCase();
  if (!q) return [];
  return all.filter((u) => (u.username || '').toLowerCase().includes(q));
}


