/** Form checks shared by the auth Server Actions. Pure, for testing. */

/** Matches the profiles.username check in the database. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
export const MIN_PASSWORD_LENGTH = 8;

export function validateUsername(value: unknown): { username: string } | { error: string } {
  const username = typeof value === "string" ? value.trim() : "";
  if (username.length < 3 || username.length > 20) {
    return { error: "Usernames are 3 to 20 characters." };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { error: "Use only letters, numbers and underscores." };
  }
  return { username };
}

export function validateEmail(value: unknown): { email: string } | { error: string } {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  // A light check; Supabase does the real one when it sends the email.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  return { email };
}

export function validatePassword(value: unknown): { password: string } | { error: string } {
  const password = typeof value === "string" ? value : "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Passwords are at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  return { password };
}

/**
 * Where to send the user after signing in. Only paths on this site are
 * allowed, so a crafted link can't bounce users to another site.
 */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}

/** A starting username from an email or Google name: "Bama.Fan-22@x.com" -> "BamaFan22". */
export function suggestUsername(source: string | null | undefined): string {
  const base = (source ?? "").split("@")[0].replace(/[^A-Za-z0-9_]/g, "").slice(0, 20);
  return base.length >= 3 ? base : "";
}
