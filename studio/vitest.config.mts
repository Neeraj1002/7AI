import { defineConfig } from 'vitest/config';

// Week 5 Task 4 (C4) — explicit include/exclude rather than vitest's
// defaults: without this, `npm run build`'s compiled dist/**/*.test.js
// output was ALSO being picked up and run (and failing, since a
// CommonJS-compiled test file can't `require('vitest')` the way the source
// `.test.ts` files can via ESM import) — a real, found-during-verification
// footgun, not a hypothetical one.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
});
