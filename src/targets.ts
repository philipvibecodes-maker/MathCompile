export const TARGETS = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'glsl', label: 'GLSL' },
  { id: 'c', label: 'C' },
] as const;

export type TargetId = (typeof TARGETS)[number]['id'];

export const COMMENT_PREFIX: Record<TargetId, string> = {
  python: '#',
  javascript: '//',
  glsl: '//',
  c: '//',
};
