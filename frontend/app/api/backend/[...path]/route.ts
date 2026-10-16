import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

async function proxyRequest(req: NextRequest) {
  // 1. Read the secure HttpOnly cookie on the server
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Build the target FastAPI URL
  const url = new URL(req.url);
  const path = url.pathname.replace("/api/backend", "");
  const targetUrl = `${process.env.NEXT_PUBLIC_API_URL}${path}${url.search}`;

  // 3. Prepare headers and attach the Bearer token
  const headers = new Headers(req.headers);
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  
  // Remove headers that shouldn't be forwarded
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length"); 

  const clientIp = 
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||   "unknown";
  headers.set("x-forwarded-for", clientIp);

  const method = req.method;
  let body: BodyInit | null = null;
  
  // Only forward body for non-GET/HEAD requests
  if (method !== "GET" && method !== "HEAD") {
    body = await req.blob();
  }

  // 4. Forward the request to FastAPI
  const res = await fetch(targetUrl, {
    method,
    headers,
    body,
  });

  // 5. Stream the response back to the browser
  const resBody = await res.blob();
  const resHeaders = new Headers(res.headers);
  resHeaders.delete("content-encoding");
  resHeaders.delete("transfer-encoding");

  if (res.status === 204) {
    return new NextResponse(null, {
      status: res.status,
      headers: resHeaders,
    });
  }

  return new NextResponse(resBody, {
    status: res.status,
    headers: resHeaders,
  });
}

// Export all HTTP methods
export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
