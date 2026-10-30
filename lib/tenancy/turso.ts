// Turso Platform API client: create a tenant database and mint an auth token.
// Secrets come from env (never hard-coded or logged).
const BASE = "https://api.turso.tech/v1";

function cfg() {
  const token = process.env.TURSO_PLATFORM_TOKEN;
  const org = process.env.TURSO_ORG;
  const group = process.env.TURSO_GROUP || "default";
  if (!token || !org) throw new Error("TURSO_PLATFORM_TOKEN and TURSO_ORG must be set");
  return { token, org, group };
}

async function api(path: string, init: RequestInit): Promise<any> {
  const { token } = cfg();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Turso API ${init.method || "GET"} ${path} -> ${res.status}`);
  return res.json();
}

export async function createTursoDatabase(name: string): Promise<{ url: string; authToken: string }> {
  const { org, group } = cfg();
  const created = await api(`/organizations/${org}/databases`, {
    method: "POST",
    body: JSON.stringify({ name, group }),
  });
  const hostname: string = created.database?.Hostname || created.database?.hostname;
  if (!hostname) throw new Error("Turso create: no hostname in response");
  const tokenRes = await api(`/organizations/${org}/databases/${name}/auth/tokens`, { method: "POST", body: "{}" });
  const jwt: string = tokenRes.jwt;
  if (!jwt) throw new Error("Turso token: no jwt in response");
  return { url: `libsql://${hostname}`, authToken: jwt };
}

export async function deleteTursoDatabase(name: string): Promise<void> {
  const { org } = cfg();
  await api(`/organizations/${org}/databases/${name}`, { method: "DELETE" });
}
