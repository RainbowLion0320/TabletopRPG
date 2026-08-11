import { describe, expect, it } from 'vitest';
import playwrightConfig from '../playwright.config';

describe('Playwright output isolation', () => {
  it('keeps smoke artifacts away from long-play reports', () => {
    expect(playwrightConfig.outputDir).toBe('test-results/playwright');
  });
});
