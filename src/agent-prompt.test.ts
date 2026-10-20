import { describe, expect, it } from 'vitest';
import { AGENT_PROMPT, CUSTOM_FUNCTIONS_DOC_URL } from './agent-prompt';

describe('agent prompt', () => {
  it('links the doc instead of inlining it', () => {
    expect(AGENT_PROMPT).toContain(CUSTOM_FUNCTIONS_DOC_URL);
  });

  it('covers the import-* modes and argument types', () => {
    expect(AGENT_PROMPT).toContain('from sympy import *');
    expect(AGENT_PROMPT).toContain('import sympy as sp');
    expect(AGENT_PROMPT).toContain('int/float');
  });
});
