// Sample doctrine for the screenshots: three EFT fits and an .emp plan, via the demo API (with the mocked ESI)
const A = process.env.DEMO_API ?? 'http://127.0.0.1:3998';
const j = (r: Response) => r.json();
const post = (p: string, b: unknown, m = 'POST') => fetch(A + p, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(j);
const d = await post('/doctrines', { name: 'Hurricane Fleet' });
const hurricane = `[Hurricane, Hurricane - Fleet DPS]
Damage Control II
Gyrostabilizer II
Gyrostabilizer II

Large Shield Extender II
Large Shield Extender II
10MN Afterburner II

425mm AutoCannon II, Republic Fleet EMP M
425mm AutoCannon II, Republic Fleet EMP M
425mm AutoCannon II, Republic Fleet EMP M
425mm AutoCannon II, Republic Fleet EMP M
425mm AutoCannon II, Republic Fleet EMP M
Heavy Energy Neutralizer II

Medium Projectile Burst Aerator I
Medium Projectile Burst Aerator I


Hammerhead II x5

Republic Fleet EMP M x3000`;
const scimitar = `[Scimitar, Scimitar - Fleet Logi]
Power Diagnostic System II
Power Diagnostic System II
Damage Control II

Large Shield Extender II
Large Shield Extender II
10MN Afterburner II
Sensor Booster II

Large Remote Shield Booster II
Large Remote Shield Booster II
Large Remote Shield Booster II
Large Remote Shield Booster II
[Empty High slot]


Warrior II x5`;
const rifter = `[Rifter, Rifter - Tackle]
Damage Control II

10MN Afterburner II

[Empty High slot]


Warrior II x2`;
for (const eft of [hurricane, scimitar, rifter]) await post(`/doctrines/${d.id}/fits`, { eft });
const plan = Bun.gzipSync(new TextEncoder().encode(`<?xml version="1.0"?><plan name="Hurricane Fleet - DPS óptimo">
<entry skillID="33095" level="5"/><entry skillID="12205" level="5"/><entry skillID="33699" level="5"/><entry skillID="3318" level="5"/>
<entry skillID="3394" level="5"/><entry skillID="3413" level="5"/><entry skillID="3426" level="5"/><entry skillID="3425" level="5"/><entry skillID="26260" level="4"/></plan>`));
await post('/fits/1/plan', { data: Buffer.from(plan).toString('base64'), filename: 'hurricane.emp' }, 'PUT');
await post('/doctrines/prices', {});
const v = await fetch(A + '/doctrines').then(j);
for (const f of v.doctrines[0].fits) console.log(f.name, f.clone, Math.round(f.cost.total));
