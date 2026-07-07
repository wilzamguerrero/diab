import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Trivial smoke test to verify the Vitest + Testing Library (jsdom environment) setup.
describe('project setup (jsdom environment)', () => {
  it('renders the App heading', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /diabetes insulin tracker/i }),
    ).toBeInTheDocument();
  });
});
