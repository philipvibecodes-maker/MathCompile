export const TARGETS = [
  { id: 'latex', label: 'LaTeX', enabled: true },
  { id: 'calculator', label: 'Calculator', enabled: true },
  { id: 'python', label: 'Python', enabled: true },
  { id: 'javascript', label: 'JavaScript', enabled: false },
  { id: 'glsl', label: 'GLSL', enabled: false },
  { id: 'c', label: 'C', enabled: false },
] as const;

export type TargetId = (typeof TARGETS)[number]['id'];

export const COMMENT_PREFIX: Record<TargetId, string> = {
  latex: '%',
  calculator: '#',
  python: '#',
  javascript: '//',
  glsl: '//',
  c: '//',
};
