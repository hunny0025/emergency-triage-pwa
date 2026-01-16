
// sw.js - Advanced Service Worker for Emergency Triage
const CACHE_NAME = 'upline-triage-v2';
const DYNAMIC_CACHE = 'upline-dynamic-v1';
const OFFLINE_URL = '/offline.html';

// Assets to cache immediately
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles.css',
  '/app.js',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[Service Worker] Skip waiting');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - network first, cache fallback
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // For API requests, try network first, then cache
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the response for offline use
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Return cached response if network fails
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // For page navigation
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/'))
        .then(response => response || caches.match(OFFLINE_URL))
    );
    return;
  }
  
  // For static assets, cache first
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request)
          .then(fetchResponse => {
            // Cache the new resource
            return caches.open(DYNAMIC_CACHE)
              .then(cache => {
                cache.put(event.request.url, fetchResponse.clone());
                return fetchResponse;
              });
          });
      })
  );
});

// Background sync for offline data
self.addEventListener('sync', event => {
  console.log('[Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'sync-patients') {
    event.waitUntil(syncPatients());
  }
});

// Sync patients data when back online
async function syncPatients() {
  console.log('[Service Worker] Syncing patient data...');
  
  // Get pending syncs from IndexedDB
  const pendingSyncs = await getPendingSyncs();
  
  for (const sync of pendingSyncs) {
    try {
      // Simulate API call
      const response = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sync.data)
      });
      
      if (response.ok) {
        console.log('[Service Worker] Sync successful:', sync.id);
        await removePendingSync(sync.id);
      }
    } catch (error) {
      console.error('[Service Worker] Sync failed:', error);
    }
  }
}

// IndexedDB for offline data storage
const DB_NAME = 'upline-triage-db';
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      // Create patients store
      if (!db.objectStoreNames.contains('patients')) {
        const patientsStore = db.createObjectStore('patients', { 
          keyPath: 'id',
          autoIncrement: true 
        });
        patientsStore.createIndex('priority', 'priority', { unique: false });
        patientsStore.createIndex('timestamp', 'timestamp', { unique: false });
        patientsStore.createIndex('status', 'status', { unique: false });
      }
      
      // Create pending syncs store
      if (!db.objectStoreNames.contains('pendingSyncs')) {
        const syncsStore = db.createObjectStore('pendingSyncs', { 
          keyPath: 'id',
          autoIncrement: true 
        });
        syncsStore.createIndex('type', 'type', { unique: false });
      }
      
      // Create analytics store
      if (!db.objectStoreNames.contains('analytics')) {
        const analyticsStore = db.createObjectStore('analytics', { 
          keyPath: 'timestamp' 
        });
        analyticsStore.createIndex('type', 'type', { unique: false });
      }
    };
  });
}

async function getPendingSyncs() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingSyncs'], 'readonly');
    const store = transaction.objectStore('pendingSyncs');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removePendingSync(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingSyncs'], 'readwrite');
    const store = transaction.objectStore('pendingSyncs');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Push notifications for emergency alerts
self.addEventListener('push', event => {
  console.log('[Service Worker] Push received:', event);
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Upline Emergency Alert';
  const options = {
    body: data.body || 'New emergency case requires attention',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'emergency-alert',
    data: data.url || '/',
    actions: [
      {
        action: 'view',
        title: 'View Case'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification click:', event);
  
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow(event.notification.data)
    );
  }
});