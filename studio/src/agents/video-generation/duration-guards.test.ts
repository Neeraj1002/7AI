import { describe, it, expect } from 'vitest';
import { voiceLengthMismatch, finalLengthMismatch, pictureLengthMismatch } from './duration-guards';
import { END_TAIL_SECONDS } from './quality-spec';

describe('voiceLengthMismatch', () => {
  it('accepts two measurements within a second of each other', () => {
    expect(voiceLengthMismatch(35.4, 35.4)).toBeNull();
    expect(voiceLengthMismatch(35.4, 36.3)).toBeNull();
  });

  it('fails in plain words when they differ by more than a second', () => {
    const reason = voiceLengthMismatch(35.4, 13.2);
    expect(reason).toMatch(/voiceover file is 35\.4s but the transcription heard 13\.2s/);
    expect(reason).toMatch(/Nothing was rendered/);
  });
});

describe('finalLengthMismatch', () => {
  it('accepts voice + end tail, as the healthy honey render would have been', () => {
    expect(finalLengthMismatch(35.4 + END_TAIL_SECONDS, 35.4, END_TAIL_SECONDS)).toBeNull();
    expect(finalLengthMismatch(36.5, 35.4, END_TAIL_SECONDS)).toBeNull();
  });

  it('fails the 13.33 s file made from a 35.4 s voiceover', () => {
    const reason = finalLengthMismatch(13.33, 35.4, END_TAIL_SECONDS);
    expect(reason).toMatch(/finished video is 13\.3s but the voiceover is 35\.4s/);
    expect(reason).toMatch(/cut off/);
  });

  it('fails a video that runs well past the voiceover', () => {
    expect(finalLengthMismatch(45, 35.4, END_TAIL_SECONDS)).toMatch(/longer than the voiceover/);
  });
});

describe('pictureLengthMismatch', () => {
  it('accepts a stock picture that covers the voiceover, with or without the pad past it', () => {
    expect(pictureLengthMismatch(35.67, 35.4)).toBeNull();
    expect(pictureLengthMismatch(34.6, 35.4)).toBeNull();
  });

  it('fails a stock picture shorter than the voiceover', () => {
    expect(pictureLengthMismatch(12.1, 35.4)).toMatch(/stock picture is 12\.1s but the voiceover is 35\.4s/);
  });
});
