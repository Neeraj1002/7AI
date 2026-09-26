// Bugs Task 5 (R1) — Google's OAuth server rejects a redirect_uri whose host
// is a private/LAN IP (RFC1918) with a confusing "device_id and device_name
// are required for private IP" 400. localhost/127.0.0.0/8 and real public
// domains are accepted. This is checked at boot so the mistake shows up as a
// log line instead of a mid-flow Google error.
export function isPrivateIpRedirectHost(redirectUri: string): boolean {
  let host: string;
  try {
    host = new URL(redirectUri).hostname;
  } catch {
    return false;
  }
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
