interface CloudflareContext {
  request: Request;
  next: () => Promise<Response>;
}

export async function onRequest(context: CloudflareContext) {
  const { request, next } = context;
  const url = new URL(request.url);

  // Handle JavaScript files
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".mjs")) {
    const response = await next();

    // Clone response to modify headers
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...response.headers,
        "Content-Type": "text/javascript",
      },
    });

    return newResponse;
  }

  // For all other requests, continue normally
  return next();
}
