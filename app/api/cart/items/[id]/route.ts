import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const authorization = request.headers.get("authorization");
  const body = await request.json();
  const response = await fetch(`${BACKEND_URL}/cart/update`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify({ productId: Number(id), quantity: body.quantity }),
    cache: "no-store",
  });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
  });
}

export async function DELETE(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const authorization = request.headers.get("authorization");
  const response = await fetch(`${BACKEND_URL}/cart/remove/${id}`, {
    method: "DELETE",
    headers: authorization ? { Authorization: authorization } : {},
    cache: "no-store",
  });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
  });
}
