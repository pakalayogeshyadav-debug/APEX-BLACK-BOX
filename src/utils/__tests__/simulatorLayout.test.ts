import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateAndClampLayout,
  isTypingInInputElement,
  DEFAULT_SIM_LAYOUT
} from '../simulatorLayout.ts';

describe('Vehicle Simulator Console Layout & Input Filtering', () => {
  it('falls back to default layout when given null or non-object input', () => {
    const layoutNull = validateAndClampLayout(null, 1920, 1080);
    assert.strictEqual(layoutNull.version, 1);
    assert.strictEqual(layoutNull.width, 740);
    assert.strictEqual(layoutNull.height, 620);
    assert.strictEqual(layoutNull.windowMode, 'floating');

    const layoutUndefined = validateAndClampLayout(undefined, 1920, 1080);
    assert.strictEqual(layoutUndefined.width, 740);
  });

  it('rejects obsolete or unknown versions and returns fallback', () => {
    const invalidVersion = validateAndClampLayout({ version: 99, x: 200, y: 200 }, 1920, 1080);
    assert.strictEqual(invalidVersion.version, 1);
  });

  it('clamps coordinates so window stays accessible within viewport', () => {
    // Attempting to place console way outside viewport: x = 5000, y = 5000 in a 1280x800 screen
    const clamped = validateAndClampLayout(
      {
        version: 1,
        isOpen: true,
        x: 5000,
        y: 5000,
        width: 740,
        height: 620
      },
      1280,
      800
    );

    // Max X is 1280 - 740 - 10 = 530
    assert.ok(clamped.x <= 530, `X coordinate ${clamped.x} should be <= 530`);
    assert.ok(clamped.x >= 10, `X coordinate ${clamped.x} should be >= 10`);
    // Max Y is 800 - 620 - 10 = 170
    assert.ok(clamped.y <= 170, `Y coordinate ${clamped.y} should be <= 170`);
    assert.ok(clamped.y >= 70, `Y coordinate ${clamped.y} should be >= 70`);
  });

  it('enforces minimum operable dimensions (width >= 380, height >= 340)', () => {
    const minClamped = validateAndClampLayout(
      {
        version: 1,
        isOpen: true,
        x: 100,
        y: 100,
        width: 100, // too small
        height: 100 // too small
      },
      1920,
      1080
    );

    assert.strictEqual(minClamped.width, 380);
    assert.strictEqual(minClamped.height, 340);
  });

  it('correctly filters keyboard input when typing in form controls or editable areas', () => {
    assert.strictEqual(isTypingInInputElement('INPUT', false), true);
    assert.strictEqual(isTypingInInputElement('textarea', false), true);
    assert.strictEqual(isTypingInInputElement('SELECT', false), true);
    assert.strictEqual(isTypingInInputElement('DIV', true), true); // contentEditable
    assert.strictEqual(isTypingInInputElement('div', false), false);
    assert.strictEqual(isTypingInInputElement('BODY', false), false);
    assert.strictEqual(isTypingInInputElement(null, false), false);
  });
});
