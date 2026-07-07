import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Trivial smoke test to verify the Vitest + fast-check (node environment) setup.
describe('project setup (node environment)', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('runs a property-based test with fast-check', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        expect(a + b).toBe(b + a);
      }),
      { numRuns: 100 },
    );
  });
});
