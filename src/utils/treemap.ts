/**
 * treemap.ts — Squarified treemap layout (Bruls, Huizing & van Wijk 2000) for the market heatmap:
 * splits a rectangle into tiles whose areas follow the values while keeping tiles close to square,
 * plus a two-level layout (groups such as sectors, then the items inside each group) and the tile
 * colour scale (green up, red down, saturating at ±limit percent).
 */

export interface TreeItem {
  id: string;
  value: number;
}

export interface TreeRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Worst aspect ratio of a row of areas laid along a side of length `side`. */
function worst(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  if (sum <= 0 || side <= 0) return Infinity;
  const max = Math.max(...row);
  const min = Math.min(...row);
  const s2 = side * side;
  return Math.max((s2 * max) / (sum * sum), (sum * sum) / (s2 * min));
}

/** Tiles for items with positive values (largest first), filling width × height exactly. */
export function squarify(items: TreeItem[], width: number, height: number, x0 = 0, y0 = 0): TreeRect[] {
  const list = items.filter((i) => i.value > 0 && Number.isFinite(i.value)).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const total = list.reduce((s, i) => s + i.value, 0);
  if (list.length === 0 || total <= 0 || width <= 0 || height <= 0) return [];
  const scale = (width * height) / total;
  const areas = list.map((i) => i.value * scale);
  const out: TreeRect[] = [];
  let x = x0;
  let y = y0;
  let w = width;
  let h = height;
  let i = 0;
  while (i < list.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < list.length && worst([...row, areas[j]], side) <= worst(row, side)) {
      row.push(areas[j]);
      j++;
    }
    const sum = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      // Column on the left
      const colW = j >= list.length ? w : sum / h;
      let yy = y;
      row.forEach((a, k) => {
        const hh = k === row.length - 1 ? y + h - yy : a / colW;
        out.push({ id: list[i + k].id, x, y: yy, w: colW, h: hh });
        yy += hh;
      });
      x += colW;
      w -= colW;
    } else {
      // Row on top
      const rowH = j >= list.length ? h : sum / w;
      let xx = x;
      row.forEach((a, k) => {
        const ww = k === row.length - 1 ? x + w - xx : a / rowH;
        out.push({ id: list[i + k].id, x: xx, y, w: ww, h: rowH });
        xx += ww;
      });
      y += rowH;
      h -= rowH;
    }
    i = j;
  }
  return out;
}

export interface TreeGroup {
  id: string;
  items: TreeItem[];
}

/** Groups laid out first (by their total), then each group's items inside its tile below a header. */
export function nestedTreemap(
  groups: TreeGroup[],
  width: number,
  height: number,
  header = 0
): Array<{ group: TreeRect; items: TreeRect[] }> {
  const totals = groups.map((g) => ({ id: g.id, value: g.items.reduce((s, i) => s + (i.value > 0 ? i.value : 0), 0) }));
  return squarify(totals, width, height).map((rect) => {
    const g = groups.find((x) => x.id === rect.id)!;
    const head = rect.h > header * 3 ? header : 0;
    return { group: rect, items: squarify(g.items, rect.w, rect.h - head, rect.x, rect.y + head) };
  });
}

/**
 * Tile background for a percent change: a mix of the up/down colour into the neutral surface,
 * full strength at ±limit (CSS color-mix, follows the theme tokens).
 */
export function heatColor(changePct: number | null | undefined, limit = 3): string {
  if (changePct === null || changePct === undefined || !Number.isFinite(changePct) || changePct === 0) return 'var(--bg-surface-subtle)';
  const strength = Math.round(25 + 65 * Math.min(1, Math.abs(changePct) / limit));
  return `color-mix(in srgb, ${changePct > 0 ? 'var(--color-up)' : 'var(--color-down)'} ${strength}%, var(--bg-surface-subtle))`;
}
