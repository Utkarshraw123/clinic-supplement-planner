import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { listDietaryProtocols, createDietaryProtocol, updateDietaryProtocol, deleteDietaryProtocol } from "@/lib/dietary-protocols";

describe("dietary protocols", () => {
  beforeAll(async () => { await runMigrations(); });

  it("creates, lists, edits and deletes a dietary protocol", async () => {
    const id = (await createDietaryProtocol(` Low-FODMAP ${Date.now()} `, "Avoid onion and garlic.\r\nTry lactose-free."))!;
    let p = (await listDietaryProtocols()).find((x) => x.id === id)!;
    expect(p.body).toBe("Avoid onion and garlic.\nTry lactose-free.");
    await updateDietaryProtocol(id, p.name, "Reintroduce one food at a time.");
    p = (await listDietaryProtocols()).find((x) => x.id === id)!;
    expect(p.body).toBe("Reintroduce one food at a time.");
    await deleteDietaryProtocol(id);
    expect((await listDietaryProtocols()).some((x) => x.id === id)).toBe(false);
  });

  it("rejects a blank name or body", async () => {
    expect(await createDietaryProtocol("", "x")).toBeNull();
    expect(await createDietaryProtocol("x", " ")).toBeNull();
  });
});
