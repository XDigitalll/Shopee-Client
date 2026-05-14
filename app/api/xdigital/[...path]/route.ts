import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

async function forward(request: NextRequest, path: string[]) {
  const url = new URL(request.url);
  const backendUrl = new URL(`${BACKEND_URL}/${path.join("/")}`);

  backendUrl.search = url.search;

  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  const contentType = request.headers.get("content-type") ?? "";

  if (authorization) {
    headers.set("Authorization", authorization);
  } else {
    const cookieToken = request.cookies.get(SESSION_COOKIE)?.value;
    if (cookieToken) {
      headers.set("Authorization", `Bearer ${cookieToken}`);
    }
  }

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    if (contentType.includes("multipart/form-data")) {
      init.body = await request.arrayBuffer();
    } else {
      init.body = await request.text();
    }
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(backendUrl, init);
  } catch (err) {
    console.error("[proxy] Backend unreachable:", backendUrl.toString(), err);
    return NextResponse.json(
      { message: "Backend inacessivel. Confirma se o servidor esta a correr na porta 8080." },
      { status: 502 }
    );
  }

  let text: string;
  try {
    text = await backendResponse.text();
  } catch (err) {
    console.error("[proxy] Failed to read backend response body:", err);
    return NextResponse.json(
      { message: "Erro ao ler resposta do servidor backend." },
      { status: 502 }
    );
  }

  return new NextResponse(text, {
    status: backendResponse.status,
    headers: {
      "Content-Type": backendResponse.headers.get("Content-Type") || "application/json",
    },
  });
}

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}
