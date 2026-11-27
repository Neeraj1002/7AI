// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
// The card is drawn to static HTML with react-native-web so each state's text can be checked without a device.
import { createElement, type ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';

import { renderToStaticMarkup } from 'react-dom/server';
import { DirectionCard } from './DirectionCard';
import type { Direction, DirectionPreset } from '../lib/direction';

// vi.mock calls are hoisted above the imports by vitest.
vi.mock('react-native', async () => await import('react-native-web'));
vi.mock('@expo/vector-icons', () => ({ Feather: () => null }));

const presets: DirectionPreset[] = [
  { key: 'neutral', version: 1, label: 'Plain label', summary: 'Plain summary', parts: [{ key: 'persona', label: 'Part one', text: 'Part text' }] },
  { key: 'history', version: 2, label: 'Other label', summary: 'Other summary', parts: [] },
];
const neutral: Direction = { preset: 'neutral', note: '' };

const draw = (over: Partial<ComponentProps<typeof DirectionCard>> = {}) =>
  renderToStaticMarkup(
    createElement(DirectionCard, {
      presets,
      loading: false,
      loadFailed: false,
      saved: null,
      draft: neutral,
      onChange: () => {},
      saving: false,
      savedVersion: null,
      warnings: [],
      saveError: false,
      ...over,
    }),
  );

describe('Direction card states', () => {
  it('presets present: shows each label and summary, the default tag, the note box and the change line', () => {
    const html = draw();
    for (const t of ['Plain label', 'Plain summary', 'Other label', 'Other summary', 'Default, nothing saved', 'Your note', 'A change affects new videos only']) {
      expect(html).toContain(t);
    }
    expect(html).not.toContain('Couldn&#x27;t load');
  });
  it('presets empty: the card still draws, with no choices and no note box', () => {
    const html = draw({ presets: [] });
    expect(html).toContain('A change affects new videos only');
    expect(html).not.toContain('Your note');
    expect(html).not.toContain('Plain label');
    expect(html).not.toContain('Couldn&#x27;t load');
  });
  it('presets fetch failed: says so and offers no choices', () => {
    const html = draw({ presets: [], loadFailed: true });
    expect(html).toContain('Couldn&#x27;t load the creative directions');
    expect(html).not.toContain('Your note');
  });

  it.each([[null], [[null]], [[{ ...presets[0], parts: null }]], [[{ ...presets[0], parts: [null] }]]])(
    'shows the card error for malformed presets (%j)',
    (response) => {
      const html = draw({ presets: response as DirectionPreset[] });
      expect(html).toContain('Couldn&#x27;t load the creative directions');
      expect(html).not.toContain('Your note');
    },
  );
  it('save error and warnings show their own text', () => {
    expect(draw({ saveError: true })).toContain('Couldn&#x27;t save. Your choice is still here');
    expect(draw({ warnings: ['Careful with this'], savedVersion: 4 })).toContain('Saved as v4, with a warning:');
  });
});
