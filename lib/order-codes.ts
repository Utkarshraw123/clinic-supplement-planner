// How a plan item's order code is stored, and how the Order code dropdown maps to it.
// Dependency-free so the client-side item form can import it.
//   stored null → follow the brand's default code (how items behaved before code lists)
//   stored ""   → explicitly no code on this item
//   stored "X"  → print code X
export const ORDER_DEFAULT = "__default";
export const ORDER_NONE = "__none";

export function storedFromFormValue(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v || v === ORDER_DEFAULT) return null;
  if (v === ORDER_NONE) return "";
  return v;
}

export function formValueFromStored(stored: string | null): string {
  if (stored === null) return ORDER_DEFAULT;
  if (stored.trim() === "") return ORDER_NONE;
  return stored.trim();
}

export function resolveOrderCode(stored: string | null, brandDefault: string | null): string {
  if (stored === null) return (brandDefault ?? "").trim();
  return stored.trim();
}
