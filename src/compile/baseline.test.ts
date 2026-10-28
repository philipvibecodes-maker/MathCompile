import { describe, expect, it } from 'vitest';
import compact from './fixtures/compiler-baseline.json';
import { parseCellLatex, type MathJson } from './ir';
import {
  compileWorksheet,
  compileCellsForCalc,
  compileCellForCalc,
  type CompileOptions,
} from './codegen';

interface Baseline {
  runtime: string[];
  cases: {
    name: string;
    sources: (string | { python: string })[];
    raw: { json?: MathJson }[];
    variants: {
      options: CompileOptions;
      python: unknown;
      calc: unknown;
      single: unknown[];
    }[];
  }[];
}

// Captured from main before refactoring. Store each runtime source once;
// expand it on read so the comparison still pins every emitted byte.
const baseline = JSON.parse(JSON.stringify(compact), (_key, value) =>
  value && typeof value === 'object' && '$runtime' in value
    ? compact.runtime[value.$runtime]
    : value,
) as Baseline;

describe('compiler output baseline (eb8cdc2)', () => {
  for (const fixture of baseline.cases) {
    it(fixture.name, () => {
      const cells = fixture.sources.map((source) => ({
        json: typeof source === 'string'
          ? parseCellLatex(source)
          : ['PythonSource', source.python] as MathJson,
      }));
      expect(cells).toEqual(fixture.raw);
      for (const variant of fixture.variants) {
        const options = variant.options;
        // JSON omits undefined optional properties, as the capture did.
        const actual = JSON.parse(JSON.stringify({
          options,
          python: compileWorksheet(cells, 'python', options),
          calc: compileCellsForCalc(cells, options),
          single: cells.map((cell) => compileCellForCalc(cell, options)),
        }));
        expect(actual).toEqual(variant);
      }
    });
  }
});
