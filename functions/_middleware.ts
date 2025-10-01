// Cloudflare Pages Functions middleware for SPA routing
export async function onRequest(context: any) {
  const url = new URL(context.request.url);
  const pathname = url.pathname;
  
  // Serve static assets directly
  if (
    pathname.startsWith('/assets/') ||
    pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|json|xml|txt)$/)
  ) {
    return context.next();
  }
  
  // For all other routes, return index.html (SPA routing)
  const response = await context.next();
  
  // If it's a 404, serve index.html instead
  if (response.status === 404 && !pathname.includes('.')) {
    return context.env.ASSETS.fetch(new URL('/', context.request.url));
  }
  
  return response;
}

