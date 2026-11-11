// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Colours live only in theme.css. This keeps the theme editable in one place:
 * any hex or rgb()/rgba() colour typed into another stylesheet fails here.
 */
const APP_DIR = __dirname;
const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

function stylesheets(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return name.endsWith('.css') ? [path] : [];
  });
}

describe('centralised theme colours', () => {
  it('theme.css defines the palette and site tokens', () => {
    const theme = readFileSync(join(APP_DIR, 'theme.css'), 'utf8');
    expect(theme).toMatch(/--palette-[a-z-]+:\s*#[0-9a-f]{6};/);
    expect(theme).toContain('--surface:');
    expect(theme).toContain(":root[data-theme='dark']");
  });

  it('no other stylesheet contains a colour value or token definition', () => {
    const offenders: string[] = [];
    for (const file of stylesheets(APP_DIR)) {
      if (file.endsWith('theme.css')) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const code = line.replace(/\/\*.*?\*\//g, '');
          if (COLOUR.test(code) || /^\s*--[a-z0-9-]+\s*:/.test(code))
            offenders.push(
              `${relative(APP_DIR, file)}:${index + 1}: ${line.trim()}`,
            );
        });
    }
    expect(offenders).toEqual([]);
  });
});
