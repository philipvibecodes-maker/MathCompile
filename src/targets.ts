export const TARGETS = [
  { id: 'latex', label: 'LaTeX' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'glsl', label: 'GLSL' },
  { id: 'c', label: 'C' },
] as const;

export type TargetId = (typeof TARGETS)[number]['id'];

export const COMMENT_PREFIX: Record<TargetId, string> = {
  latex: '%',
  python: '#',
  javascript: '//',
  glsl: '//',
  c: '//',
};
