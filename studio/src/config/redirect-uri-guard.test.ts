import { describe, it, expect } from 'vitest';
import { isPrivateIpRedirectHost } from './redirect-uri-guard';

describe('isPrivateIpRedirectHost', () => {
  it('flags RFC1918 hosts', () => {
    expect(isPrivateIpRedirectHost('http://192.168.0.101:4001/oauth2callback')).toBe(true);
    expect(isPrivateIpRedirectHost('http://10.1.2.3/oauth2callback')).toBe(true);
    expect(isPrivateIpRedirectHost('http://172.16.0.5:4001/oauth2callback')).toBe(true);
    expect(isPrivateIpRedirectHost('http://172.31.255.1/oauth2callback')).toBe(true);
  });

  it('allows localhost, loopback, and public hosts', () => {
    expect(isPrivateIpRedirectHost('http://localhost:4001/oauth2callback')).toBe(false);
    expect(isPrivateIpRedirectHost('http://127.0.0.1:4001/oauth2callback')).toBe(false);
    expect(isPrivateIpRedirectHost('https://abc.ngrok.app/oauth2callback')).toBe(false);
    expect(isPrivateIpRedirectHost('http://172.32.0.1/oauth2callback')).toBe(false);
    expect(isPrivateIpRedirectHost('http://8.8.8.8/oauth2callback')).toBe(false);
  });

  it('does not flag a Tailscale Funnel *.ts.net hostname (a DNS name, not a raw IP)', () => {
    expect(isPrivateIpRedirectHost('https://my-machine.tail1a2b3c.ts.net/oauth2callback')).toBe(false);
  });

  it('does not throw on an unparseable value', () => {
    expect(isPrivateIpRedirectHost('not a url')).toBe(false);
  });
});
