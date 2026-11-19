import { hash, verify } from '@node-rs/argon2';
import { randomBytes, createHash } from 'node:crypto';

// argon2id hashes (docs/technical/04-security.md)
export function hashPassword(password: string): Promise<string> {
  return hash(password, { algorithm: 2 });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Used when a phone is not found, so a wrong phone takes as long as a wrong password
let dummyHash: Promise<string> | undefined;
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
}

// Temporary passwords: easy to read and type, no 0/O or 1/l
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function temporaryPassword(length = 10): string {
  const bytes = randomBytes(length);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
