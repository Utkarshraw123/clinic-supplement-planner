import { listTenants } from "@/lib/control-users";

export function slugify(name: string): string {
  let s = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  if (s.length < 3) s = (s + "-clinic").replace(/^-+/, "");
  return s.slice(0, 40).replace(/-+$/g, "");
}

export async function uniqueTenantSlug(name: string): Promise<string> {
  const base = slugify(name);
  const taken = new Set((await listTenants()).map((t) => t.id));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`.slice(0, 40);
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("could not allocate a unique tenant slug");
}
