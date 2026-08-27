/**
 * Seed 5 starter protocol templates from the Wild Nutrition catalogue, matched to
 * the clinic's specialisms (menstrual health, peri/menopause, fertility, pregnancy).
 * Each is a targeted complex + supporting nutrients. Doses follow typical WN pack
 * directions — STARTING POINTS for the practitioner to confirm/adjust per client.
 * Idempotent: skips a protocol whose name already exists. Products matched by exact
 * catalogue name; a missing product is warned and skipped.
 *
 *   npx tsx scripts/seed-protocols.ts
 */
import { runMigrations } from "@/scripts/migrate";
import { query } from "@/lib/db";
import { createProtocol, addProtocolItem, setProtocolItemDosing, listProtocols } from "@/lib/protocols";

type Item = { product: string; dose: string };
type Proto = { name: string; description: string; items: Item[] };

const PROTOCOLS: Proto[] = [
  {
    name: "Menopause Support",
    description: "Core hormone support for menopause, with bone, mood and omega cover.",
    items: [
      { product: "Menopause Complex", dose: "2 capsules daily with food" },
      { product: "Magnesium", dose: "2 capsules with the evening meal" },
      { product: "Pure Strength Omega 3", dose: "2 capsules daily with food" },
      { product: "Vitamin D", dose: "1 capsule daily with food" },
    ],
  },
  {
    name: "Perimenopause Support",
    description: "Hormone balance for perimenopause, with an adaptogen for mood and sleep.",
    items: [
      { product: "Perimenopause Complex", dose: "2 capsules daily with food" },
      { product: "KSM-66 Ashwagandha Plus", dose: "2 capsules daily" },
      { product: "Magnesium", dose: "2 capsules with the evening meal" },
      { product: "Pure Strength Omega 3", dose: "2 capsules daily with food" },
    ],
  },
  {
    name: "Cycle & PMS Support",
    description: "Menstrual cycle and premenstrual support — hormone, magnesium and omega.",
    items: [
      { product: "Premenstrual Support", dose: "2 capsules daily with food" },
      { product: "Magnesium", dose: "2 capsules with the evening meal" },
      { product: "Vitamin B12 Plus", dose: "1 capsule daily with food" },
      { product: "Pure Strength Omega 3", dose: "2 capsules daily with food" },
    ],
  },
  {
    name: "Fertility & Preconception (Women)",
    description: "Preconception foundation for women — fertility complex, omega, vitamin D and shatavari.",
    items: [
      { product: "Fertility Support for Women", dose: "2 capsules daily with food" },
      { product: "Pure Strength Omega 3", dose: "2 capsules daily with food" },
      { product: "Vitamin D", dose: "1 capsule daily with food" },
      { product: "SRI-81 Shatavari Plus", dose: "2 capsules daily with food" },
    ],
  },
  {
    name: "Pregnancy & New Mother",
    description: "Prenatal and postnatal foundation — multi, omega-3 (DHA), gut and vitamin D.",
    items: [
      { product: "Pregnancy + New Mother Multi", dose: "2 capsules daily with food" },
      { product: "Pregnancy + New Mother Omega 3", dose: "2 capsules daily with food" },
      { product: "Pregnancy + New Mother Biotic", dose: "1 capsule daily" },
      { product: "Vitamin D", dose: "1 capsule daily with food" },
    ],
  },
];

async function productId(name: string): Promise<number | null> {
  const r = await query<{ id: number }>("SELECT id FROM products WHERE name = ? AND status = 'active'", [name]);
  return r[0]?.id ?? null;
}

async function main() {
  await runMigrations();
  const existing = new Set((await listProtocols()).map((p) => p.name.toLowerCase()));
  let created = 0, skipped = 0;
  for (const p of PROTOCOLS) {
    if (existing.has(p.name.toLowerCase())) { console.log(`skip "${p.name}" (exists)`); skipped++; continue; }
    const protocolId = await createProtocol(p.name, p.description);
    let added = 0;
    for (const it of p.items) {
      const prod = await productId(it.product);
      if (!prod) { console.warn(`  ! product not found, skipped: ${it.product}`); continue; }
      const itemId = await addProtocolItem(protocolId, prod);
      await setProtocolItemDosing(itemId, null, it.dose);
      added++;
    }
    console.log(`created "${p.name}" (${added}/${p.items.length} items)`);
    created++;
  }
  console.log(`seed-protocols: created ${created}, skipped ${skipped}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
