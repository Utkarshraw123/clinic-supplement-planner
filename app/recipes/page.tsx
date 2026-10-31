import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listRecipes } from "@/lib/recipes";
import { createRecipeAction } from "./actions";

export default async function RecipesPage() {
  await requireUser();
  const recipes = await listRecipes();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between"><h1>Recipes</h1></div>
      <div className="card">
        <form action={createRecipeAction} className="row" style={{ gap: 8 }}>
          <input name="name" placeholder="New recipe name" required style={{ flex: 1 }} />
          <input name="servings" type="number" min="1" defaultValue={1} style={{ width: 90 }} title="Servings" />
          <input type="hidden" name="method" value="" />
          <button type="submit" className="btn--primary">Create</button>
        </form>
      </div>
      <div className="card stack" style={{ gap: 8 }}>
        {recipes.length === 0 ? <p className="muted">No recipes yet.</p> : recipes.map((r) => (
          <Link key={r.id} href={`/recipes/${r.id}`} className="row" style={{ justifyContent: "space-between", textDecoration: "none", borderTop: "1px solid var(--border,#eee)", paddingTop: 8 }}>
            <span>{r.name}</span><span className="muted">{r.servings} serving{r.servings === 1 ? "" : "s"}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
