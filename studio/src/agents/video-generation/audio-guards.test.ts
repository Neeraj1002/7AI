import { describe, it, expect } from 'vitest';
import { audioTimelineProblem, type AudioTimeline } from './audio-guards';

// One AAC packet every 1024 samples at 48 kHz.
const PACKET = 1024 / 48000;
const clean = (seconds: number): AudioTimeline => ({
  packetTimes: Array.from({ length: Math.round(seconds / PACKET) }, (_, i) => i * PACKET),
  durationSeconds: seconds,
  sampleRate: 48000,
});

describe('audioTimelineProblem', () => {
  it('passes a complete audio track', () => {
    expect(audioTimelineProblem(clean(37.4))).toBeNull();
  });

  it('passes a track that is a couple of packets short of its length', () => {
    const t = clean(37.4);
    t.packetTimes = t.packetTimes.slice(0, -2);
    expect(audioTimelineProblem(t)).toBeNull();
  });

  it('fails a hole of about 3 s between two packets, naming where it is', () => {
    const t = clean(37.4);
    // The honey Short: packets after 16.88 s are 2.99 s late.
    t.packetTimes = t.packetTimes.map((time) => (time > 16.88 ? time + 2.99 : time));
    expect(audioTimelineProblem(t)).toMatch(/audio has a hole of 3\.0s at 16\.9s: part of the voiceover is missing/);
  });

  it('does not treat a gap of 0.07 s (the largest on a healthy file) as a hole', () => {
    const t = clean(41.3);
    t.packetTimes = t.packetTimes.map((time) => (time > 38.4 ? time + 0.04 : time));
    expect(audioTimelineProblem(t)).toBeNull();
  });

  it('fails when packets are missing without a single large hole', () => {
    const t = clean(37.4);
    // 1 packet in 3 removed: no gap over 0.5 s, but far fewer packets than the length needs.
    t.packetTimes = t.packetTimes.filter((_, i) => i % 3 !== 0);
    expect(audioTimelineProblem(t)).toMatch(/audio has \d+ packets but its 37\.4s needs about 175\d/);
  });

  it('fails a file with no audio packets', () => {
    expect(audioTimelineProblem({ packetTimes: [], durationSeconds: 0, sampleRate: 48000 })).toMatch(/no audio packets/);
  });
});
