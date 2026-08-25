import { execute, query } from "@/lib/db";

export async function recordAudit(input: { actorId?: number; action: string; entity: string; entityId?: number; detail?: string }): Promise<void> {
  await execute(
    "INSERT INTO audit_events (actor_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)",
    [input.actorId ?? null, input.action, input.entity, input.entityId ?? null, input.detail ?? null]
  );
}

export async function listAuditForEntity(entity: string, entityId: number): Promise<{ action: string; detail: string|null; created_at: string; actor_id: number|null }[]> {
  return query(
    "SELECT action, detail, created_at, actor_id FROM audit_events WHERE entity = ? AND entity_id = ? ORDER BY created_at DESC",
    [entity, entityId]
  );
}
