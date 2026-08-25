import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/products";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  return NextResponse.json(await searchProducts(q));
}
