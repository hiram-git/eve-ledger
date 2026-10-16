// Fits in EFT format, the one used by the game's «Copy to clipboard», eveworkbench and the forums:
//   [Rorqual, Beehive - SIR - DPS V26.1]
//   Damage Control II                      ← blocks without «xN»: low, mid, high slots, rigs, subsystems
//   Heavy Energy Neutralizer II, Nanite Repair Paste   ← module with its loaded ammo
//
//   Hornet II x100                         ← blocks with «xN»: drone (or fighter) bay and cargo
// Blocks are separated by blank lines. Empty slots («[Empty High slot]») and «/OFFLINE» are ignored.
// Whether a block with quantities is drones or cargo is decided by the type's category, not the order

export type EftLine = { name: string; quantity: number; kind: 'fitted' | 'charge' | 'bay'; block: number };
// slotBlocks: the slot blocks in order (low, mid, high, rigs, subsystems), including those with only
// empty slots: otherwise an empty mid block would make the highs count as mids
export type EftFit = { ship: string; name: string; lines: EftLine[]; slotBlocks: number[] };

const MAX_LENGTH = 50_000;

export class EftError extends Error {}

export function parseEft(text: string): EftFit {
  if (text.length > MAX_LENGTH) throw new EftError('too_long');
  const rows = text.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const start = rows.findIndex((l) => l !== '');
  const head = start >= 0 ? rows[start].match(/^\[([^,\]]+),\s*([^\]]*)\]$/) : null;
  if (!head) throw new EftError('no_header');
  const ship = head[1].trim();
  const name = head[2].trim() || ship;

  const lines: EftLine[] = [];
  const slotBlocks: number[] = [];
  let block = -1;
  let inBlock = false;
  // From the first block with quantities on, everything is bay or cargo (a line without «xN» is 1)
  let bays = false;
  for (const raw of rows.slice(start + 1)) {
    if (raw === '') {
      inBlock = false;
      continue;
    }
    if (!inBlock) {
      block++;
      inBlock = true;
    }
    const line = raw.replace(/\s*\/offline$/i, '');
    const qty = line.match(/^(.*\S)\s+x(\d+)$/i);
    if (!qty && !bays && slotBlocks.at(-1) !== block) slotBlocks.push(block);
    if (/^\[empty .* slot\]$/i.test(raw)) continue;
    if (qty) {
      bays = true;
      lines.push({ name: qty[1].trim(), quantity: Number(qty[2]), kind: 'bay', block });
      continue;
    }
    if (bays) {
      lines.push({ name: line, quantity: 1, kind: 'bay', block });
      continue;
    }
    // «Module, Ammo»: the loaded ammo can also require skills
    const [module, charge] = line.split(/,\s*/, 2);
    lines.push({ name: module.trim(), quantity: 1, kind: 'fitted', block });
    if (charge?.trim()) lines.push({ name: charge.trim(), quantity: 1, kind: 'charge', block });
  }
  if (!lines.length) throw new EftError('empty');
  return { ship, name, lines, slotBlocks };
}
