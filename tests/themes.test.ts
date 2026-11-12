import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEMES, teamPalette } from '../src/lib/themes';
const css = readFileSync('src/app/themes.css', 'utf8');
function luminance(hsl: string) {
  const [h, s0, l0] = hsl.match(/[\d.]+/g)!.map(Number), s = s0 / 100, l = l0 / 100;
  const a = s * Math.min(l, 1 - l);
  const rgb = [0, 8, 4].map(n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); });
  return rgb.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((v, c, i) => v + c * [.2126, .7152, .0722][i], 0);
}
function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
test('every theme defines complete surfaces and accessible text/button pairs', () => {
  for (const theme of THEMES) {
    const block = css.split(`:root[data-theme='${theme.id}'] {`)[1]?.split('}')[0];
    assert.ok(block, theme.id);
    const vars = Object.fromEntries([...block.matchAll(/--([\w-]+): ([^;]+);/g)].map(m => [m[1], m[2]]));
    for (const [fg, bg] of [['foreground','background'],['card-foreground','card'],['popover-foreground','popover'],['muted-foreground','card'],['primary-foreground','primary'],['primary','card'],['accent-foreground','accent']]) {
      assert.ok(contrast(vars[fg], vars[bg]) >= 4.5, `${theme.id} ${fg}/${bg}: ${contrast(vars[fg],vars[bg])}`);
    }
  }
});
test('team palette lifts even very dark logos and varies more than an accent', () => {
  for (const color of ['#000000', '#ffffff', '#241773', '#ff0000', '#003594']) {
    const p = teamPalette(color);
    assert.ok(contrast(p['--primary']!, p['--card']!) >= 4.5);
    assert.ok(contrast(p['--primary']!, '220 40% 9%') >= 4.5);
  }
  assert.notDeepEqual(teamPalette('#241773'), teamPalette('#ff0000'));
});
