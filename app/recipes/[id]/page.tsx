import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getRecipe } from "@/lib/recipes";
import { listFoods } from "@/lib/foods";
import RecipeItemsEditor from "@/components/RecipeItemsEditor";
import { saveRecipeAction, archiveRecipeAction } from "../actions";

export default async function RecipeDetail({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const got = await getRecipe(id);
  if (!got) notFound();
  const foods = await listFoods();
  const initial = got.items.map((it) => ({ foodId: it.food_id, portions: it.portions }));
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 680 }}>
      <h1>{got.recipe.name}</h1>
      <form action={saveRecipeAction.bind(null, id)} className="card stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <label className="stack" style={{ gap: 4, flex: 2 }}><span>Name</span><input name="name" defaultValue={got.recipe.name} required /></label>
          <label className="stack" style={{ gap: 4, width: 110 }}><span>Servings</span><input name="servings" type="number" min="1" defaultValue={got.recipe.servings} /></label>
        </div>
        <RecipeItemsEditor foods={foods} initialItems={initial} servings={got.recipe.servings} />
        <label className="stack" style={{ gap: 4 }}><span>Method</span><textarea name="method" rows={4} defaultValue={got.recipe.method ?? ""} /></label>
        <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save recipe</button>
      </form>
      <form action={archiveRecipeAction.bind(null, id)}><button className="btn--sm">Archive recipe</button></form>
    </div>
  );
}
