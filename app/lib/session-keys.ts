// Email typed on the Sign-in screen, saved at successful verify purely so the
// Channels tab can say "Signed in as …" (FE-only stopgap; the backend session
// carries no email). Same 'sevenai.*' convention as lib/auth.tsx's keys.
export const EMAIL_KEY = 'sevenai.email';
