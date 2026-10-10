// Fits en formato EFT, el de «Copiar al portapapeles» del juego, eveworkbench y los foros:
//   [Rorqual, Beehive - SIR - DPS V26.1]
//   Damage Control II                      ← bloques sin «xN»: ranuras bajas, medias, altas, rigs, subsistemas
//   Heavy Energy Neutralizer II, Nanite Repair Paste   ← módulo con su munición cargada
//
//   Hornet II x100                         ← bloques con «xN»: bodega de drones (o cazas) y carga
// Los bloques se separan con líneas en blanco. Las ranuras vacías («[Empty High slot]») y «/OFFLINE» se ignoran.
// Si un bloque con cantidades es de drones o de carga lo decide la categoría del tipo, no el orden

export type EftLine = { name: string; quantity: number; kind: 'fitted' | 'charge' | 'bay'; block: number };
// slotBlocks: los bloques de ranuras en orden (bajas, medias, altas, rigs, subsistemas), también los que solo tienen
// ranuras vacías: si no, un bloque de medias vacío haría que las altas se contasen como medias
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
  // A partir del primer bloque con cantidades, todo lo que sigue es bodega o carga (una línea sin «xN» es 1)
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
    // «Módulo, Munición»: la munición cargada también puede pedir skills
    const [module, charge] = line.split(/,\s*/, 2);
    lines.push({ name: module.trim(), quantity: 1, kind: 'fitted', block });
    if (charge?.trim()) lines.push({ name: charge.trim(), quantity: 1, kind: 'charge', block });
  }
  if (!lines.length) throw new EftError('empty');
  return { ship, name, lines, slotBlocks };
}
