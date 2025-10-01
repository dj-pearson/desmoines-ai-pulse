// Service Worker for Des Moines Insider
// IMPORTANT: Increment these versions when you deploy new code
const CACHE_NAME = 'dmi-cache-v3';
const STATIC_CACHE = 'dmi-static-v3';
const API_CACHE = 'dmi-api-v3';
const IMAGE_CACHE = 'dmi-images-v3';

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/DMI-Logo.png',
  '/DMI-Icon.png',
  '/offline.html',
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/rest/v1/events',
  '/rest/v1/restaurants',
  '/rest/v1/attractions',
  '/rest/v1/playgrounds',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Caching static assets');
        // Cache assets individually to avoid complete failure
        return Promise.allSettled(
          STATIC_ASSETS.map(asset => 
            cache.add(asset).catch(err => {
              console.warn(`Failed to cache asset ${asset}:`, err);
              return null;
            })
          )
        );
      })
      .then(() => self.skipWaiting())
      .catch(err => {
        console.error('Service Worker install failed:', err);
        // Still try to skip waiting even if caching fails
        self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && 
                cacheName !== API_CACHE && 
                cacheName !== IMAGE_CACHE) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle different types of requests with different strategies
  if (request.method !== 'GET') {
    return; // Only cache GET requests
  }

  // Static assets - Cache First
  if (STATIC_ASSETS.some(asset => url.pathname === asset)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Images - Cache First with fallback
  if (request.destination === 'image') {
    event.respondWith(cacheFirstWithFallback(request, IMAGE_CACHE));
    return;
  }

  // API calls - Network First with cache fallback
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/functions/v1/')) {
    event.respondWith(networkFirstWithCache(request, API_CACHE));
    return;
  }

  // HTML pages - ALWAYS get fresh HTML (critical for SPA with hashed assets)
  if (request.mode === 'navigate' || request.destination === 'document' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirstForNavigation(request));
    return;
  }

  // Other assets - Stale While Revalidate
  event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
});

// Cache First Strategy
async function cacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok && networkResponse.status !== 206 && !request.headers.has('range')) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Cache first failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

// Cache First with Fallback for Images
async function cacheFirstWithFallback(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok && networkResponse.status !== 206 && !request.headers.has('range')) {
      // Only cache successful responses and limit cache size
      const cacheSize = await getCacheSize(cache);
      if (cacheSize < 50) { // Limit to 50 images
        cache.put(request, networkResponse.clone());
      }
    }
    return networkResponse;
  } catch (error) {
    // Return placeholder image for failed image requests
    return new Response(
      '<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ddd"/></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
}

// Network First with Cache Fallback
async function networkFirstWithCache(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok && networkResponse.status !== 206) {
      const cache = await caches.open(cacheName);
      // Cache API responses with TTL (5 minutes)
      const clonedResponse = networkResponse.clone();
      const headers = new Headers(clonedResponse.headers);
      headers.set('cached-at', Date.now().toString());
      
      const responseWithHeaders = new Response(await clonedResponse.blob(), {
        status: clonedResponse.status,
        statusText: clonedResponse.statusText,
        headers: headers,
      });
      
      try { cache.put(request, responseWithHeaders); } catch (err) { console.warn('SW cache put failed, skipping:', err); }
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Check if cache is stale (older than 5 minutes)
      const cachedAt = cachedResponse.headers.get('cached-at');
      const isStale = cachedAt && (Date.now() - parseInt(cachedAt)) > 5 * 60 * 1000;
      
      if (!isStale) {
        return cachedResponse;
      }
    }
    
    return new Response('Offline', { status: 503 });
  }
}

// Network First for Navigation - ALWAYS bypass cache for HTML
async function networkFirstForNavigation(request) {
  try {
    // CRITICAL: Always fetch fresh HTML to get correct asset hashes
    const response = await fetch(request, { cache: 'no-cache' });
    return response;
  } catch (error) {
    // Only if completely offline, use cached HTML
    const cache = await caches.open(STATIC_CACHE);
    const cachedResponse = await cache.match('/index.html');
    return cachedResponse || new Response('Offline', { status: 503 });
  }
}

// Stale While Revalidate
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // Skip caching for external resources that might violate CSP
  const url = request.url || '';
  const skipCache = url.includes('googleapis.com') || 
                    url.includes('googletagmanager.com') ||
                    url.includes('chrome-extension:') ||
                    url.startsWith('chrome-extension:');
  
  // Always try to fetch from network in background
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (!skipCache && networkResponse.ok && networkResponse.status !== 206 && !request.headers.has('range')) {
      try {
        cache.put(request, networkResponse.clone());
      } catch (err) {
        // Silently skip caching errors
      }
    }
    return networkResponse;
  }).catch((err) => {
    // If fetch fails, return cached version or error
    if (cachedResponse) {
      return cachedResponse;
    }
    throw err;
  });
  
  // Return cached version immediately if available
  return cachedResponse || fetchPromise;
}

// Utility function to get cache size
async function getCacheSize(cache) {
  const keys = await cache.keys();
  return keys.length;
}

// Handle background sync for failed requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('Background sync triggered');
    // Implement retry logic for failed requests
  }
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/DMI-Icon.png',
      badge: '/DMI-Icon.png',
    });
  }
});

// Cache management - clean up old entries
setInterval(async () => {
  const cacheNames = await caches.keys();
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    
    // Remove old entries (older than 1 day for API cache)
    if (cacheName === API_CACHE) {
      for (const request of keys) {
        const response = await cache.match(request);
        const cachedAt = response?.headers.get('cached-at');
        if (cachedAt && (Date.now() - parseInt(cachedAt)) > 24 * 60 * 60 * 1000) {
          await cache.delete(request);
        }
      }
    }
  }
}, 60 * 60 * 1000); // Run every hour
