import { describe, it, expect } from 'vitest';
import { ffmpegVersionLine } from './ffmpeg-version';

describe('ffmpegVersionLine', () => {
  it('keeps the version and build, drops the copyright tail', () => {
    expect(ffmpegVersionLine('ffmpeg version 8.0.1-3ubuntu2 Copyright (c) 2000-2025 the FFmpeg developers\nbuilt with gcc 14')).toBe('ffmpeg version 8.0.1-3ubuntu2');
  });

  it('reports unknown for empty output', () => {
    expect(ffmpegVersionLine('')).toBe('unknown');
  });
});
