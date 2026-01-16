// sw.js - Advanced Service Worker for Emergency Triage v2.0
const CACHE_VERSION = 'v2.1.0';
const CACHE_NAME = `upline-triage-${CACHE_VERSION}`;
const DYNAMIC_CACHE = 'upline-dynamic-v2';
const OFFLINE_URL = '/offline.html';

// Assets to cache immediately
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles.css',
  '/app.js',
  '/icon-192.png',
  '/icon-512.png',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/offline.html'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing version', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] Install completed');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Install failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating new version');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old caches
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE && cacheName.startsWith('upline-triage-')) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[SW] Activation completed');
      return self.clients.claim();
    })
  );
});

// Fetch event - sophisticated caching strategy
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Skip extension requests
  if (url.protocol === 'chrome-extension:') return;
  
  // API requests: network first, then cache
  if (url.pathname.includes('/api/')) {
    event.respondWith(apiFirstStrategy(event));
    return;
  }
  
  // Navigation requests: network first with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(navigationFirstStrategy(event));
    return;
  }
  
  // Static assets: cache first, network fallback
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstStrategy(event));
    return;
  }
  
  // External resources: network first
  event.respondWith(networkFirstStrategy(event));
});

// Strategy: API first (for data)
async function apiFirstStrategy(event) {
  try {
    // Try network first
    const response = await fetch(event.request);
    
    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put(event.request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('[SW] Network failed for API, trying cache');
    
    // Try cache as fallback
    const cachedResponse = await caches.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline response for API calls
    return new Response(JSON.stringify({ 
      error: 'You are offline', 
      timestamp: new Date().toISOString(),
      cache: 'miss'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Strategy: Navigation first (for HTML pages)
async function navigationFirstStrategy(event) {
  try {
    // Try network first
    const response = await fetch(event.request);
    
    // Update cache with fresh response
    const cache = await caches.open(DYNAMIC_CACHE);
    await cache.put(event.request, response.clone());
    
    return response;
  } catch (error) {
    console.log('[SW] Network failed for navigation, trying cache');
    
    // Try cache
    const cachedResponse = await caches.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback to offline page
    const offlineResponse = await caches.match(OFFLINE_URL);
    if (offlineResponse) {
      return offlineResponse;
    }
    
    // Generate basic offline page
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Offline - Emergency Triage</title>
          <style>
            body { font-family: sans-serif; padding: 40px; text-align: center; }
            .offline { color: #dc2626; font-size: 24px; margin-bottom: 20px; }
            .message { color: #6b7280; margin-bottom: 30px; }
          </style>
        </head>
        <body>
          <h1 class="offline">⚠️ Offline Mode</h1>
          <p class="message">You're currently offline. Basic triage functionality is available.</p>
          <p class="message">Patients will be saved locally and synced when you're back online.</p>
          <button onclick="location.reload()">Retry Connection</button>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

// Strategy: Cache first (for static assets)
async function cacheFirstStrategy(event) {
  const cachedResponse = await caches.match(event.request);
  
  if (cachedResponse) {
    // Update cache in background
    event.waitUntil(
      updateCache(event.request).catch(() => {})
    );
    return cachedResponse;
  }
  
  // Not in cache, try network
  try {
    const response = await fetch(event.request);
    
    // Cache the new resource
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put(event.request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('[SW] Network failed for static asset');
    
    // If it's an image, return a placeholder
    if (event.request.destination === 'image') {
      return new Response(
        `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#f3f4f6"/>
          <text x="50%" y="50%" font-family="Arial" font-size="14" fill="#6b7280" text-anchor="middle">Image not available offline</text>
        </svg>`,
        { headers: { 'Content-Type': 'image/svg+xml' } }
      );
    }
    
    // Return error for other assets
    return new Response('Network error', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Strategy: Network first (for external resources)
async function networkFirstStrategy(event) {
  try {
    const response = await fetch(event.request);
    
    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put(event.request, response.clone());
    }
    
    return response;
  } catch (error) {
    // Try cache as fallback
    const cachedResponse = await caches.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// Update cache in background
async function updateCache(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const response = await fetch(request);
  
  if (response.ok) {
    await cache.put(request, response);
  }
}

// Cache cleanup (limit size)
async function cleanupCache() {
  const cache = await caches.open(DYNAMIC_CACHE);
  const keys = await cache.keys();
  
  // Limit cache to 100 items
  if (keys.length > 100) {
    const itemsToDelete = keys.slice(0, keys.length - 100);
    for (const key of itemsToDelete) {
      await cache.delete(key);
    }
    console.log(`[SW] Cleaned ${itemsToDelete.length} items from cache`);
  }
}

// ============================================
// IndexedDB for Offline Data
// ============================================

const DB_NAME = 'upline-triage-db';
const DB_VERSION = 2;

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Patients store
      if (!db.objectStoreNames.contains('patients')) {
        const store = db.createObjectStore('patients', { 
          keyPath: 'id',
          autoIncrement: false
        });
        store.createIndex('priority', 'priority', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
      }
      
      // Pending syncs store
      if (!db.objectStoreNames.contains('pendingSyncs')) {
        const store = db.createObjectStore('pendingSyncs', { 
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      
      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

// Patient operations
async function savePatient(patient) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['patients'], 'readwrite');
    const store = transaction.objectStore('patients');
    
    // Ensure patient has sync status
    patient.syncStatus = patient.syncStatus || 'pending';
    patient.updatedAt = new Date().toISOString();
    
    const request = store.put(patient);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllPatients() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['patients'], 'readonly');
    const store = transaction.objectStore('patients');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function getPendingPatients() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['patients'], 'readonly');
    const store = transaction.objectStore('patients');
    const index = store.index('syncStatus');
    const request = index.getAll('pending');
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function markAsSynced(patientId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['patients'], 'readwrite');
    const store = transaction.objectStore('patients');
    
    const getRequest = store.get(patientId);
    
    getRequest.onsuccess = () => {
      const patient = getRequest.result;
      if (patient) {
        patient.syncStatus = 'synced';
        patient.syncedAt = new Date().toISOString();
        
        const putRequest = store.put(patient);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Background sync
async function syncPendingData() {
  try {
    const pendingPatients = await getPendingPatients();
    
    if (pendingPatients.length === 0) {
      console.log('[SW] No pending data to sync');
      return;
    }
    
    console.log(`[SW] Syncing ${pendingPatients.length} pending patients`);
    
    // In a real app, this would send to a server
    // For demo, we'll just mark as synced
    for (const patient of pendingPatients) {
      await markAsSynced(patient.id);
    }
    
    // Notify clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        data: { syncedCount: pendingPatients.length }
      });
    });
    
    console.log('[SW] Sync completed');
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

// ============================================
// Message Handling
// ============================================

self.addEventListener('message', async (event) => {
  const { type, data } = event.data;
  
  console.log('[SW] Received message:', type);
  
  try {
    switch (type) {
      case 'SAVE_PATIENT':
        await savePatient(data.patient);
        event.ports[0].postMessage({ success: true });
        break;
        
      case 'GET_PATIENTS':
        const patients = await getAllPatients();
        event.ports[0].postMessage({ success: true, data: patients });
        break;
        
      case 'GET_PENDING_DATA':
        const pending = await getPendingPatients();
        event.ports[0].postMessage({ success: true, data: pending });
        break;
        
      case 'CLEAR_PENDING_DATA':
        const db = await openDatabase();
        const transaction = db.transaction(['patients'], 'readwrite');
        const store = transaction.objectStore('patients');
        
        // Mark all pending as synced
        const index = store.index('syncStatus');
        const request = index.getAll('pending');
        
        request.onsuccess = async () => {
          const pendingPatients = request.result || [];
          for (const patient of pendingPatients) {
            patient.syncStatus = 'synced';
            patient.syncedAt = new Date().toISOString();
            store.put(patient);
          }
          event.ports[0].postMessage({ success: true, cleared: pendingPatients.length });
        };
        break;
        
      case 'EXPORT_DATA':
        const allData = await getAllPatients();
        event.ports[0].postMessage({ 
          success: true, 
          data: {
            patients: allData,
            exportedAt: new Date().toISOString()
          }
        });
        break;
        
      case 'PERFORM_SYNC':
        await syncPendingData();
        event.ports[0].postMessage({ success: true });
        break;
        
      default:
        event.ports[0].postMessage({ 
          success: false, 
          error: `Unknown message type: ${type}` 
        });
    }
  } catch (error) {
    console.error('[SW] Message handler error:', error);
    event.ports[0].postMessage({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// Background Sync
// ============================================

self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-patients') {
    event.waitUntil(syncPendingData());
  }
});

// Periodic sync for data backup
self.addEventListener('periodicsync', event => {
  if (event.tag === 'backup-data') {
    event.waitUntil(createBackup());
  }
});

async function createBackup() {
  try {
    const patients = await getAllPatients();
    const backup = {
      patients,
      timestamp: new Date().toISOString(),
      version: CACHE_VERSION
    };
    
    // Store backup in cache
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      new Request('/backup/data.json'),
      new Response(JSON.stringify(backup), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
    
    console.log('[SW] Backup created');
    
    // Notify clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'BACKUP_CREATED',
        data: { timestamp: backup.timestamp }
      });
    });
  } catch (error) {
    console.error('[SW] Backup failed:', error);
  }
}

// ============================================
// Push Notifications
// ============================================

self.addEventListener('push', event => {
  console.log('[SW] Push received');
  
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {
      title: 'Emergency Alert',
      body: 'New emergency notification',
      icon: '/icon-192.png'
    };
  }
  
  const options = {
    body: data.body || 'New emergency case requires attention',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-72x72.png',
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
    self.registration.showNotification(
      data.title || 'Upline Emergency Alert',
      options
    )
  );
});

self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification click:', event.action);
  
  event.notification.close();
  
  if (event.action === 'view' || event.action === '') {
    event.waitUntil(
      clients.openWindow(event.notification.data || '/')
    );
  }
});

// ============================================
// Periodic Tasks
// ============================================

// Run cleanup periodically
setInterval(() => {
  cleanupCache();
}, 24 * 60 * 60 * 1000); // Daily

// Initial cleanup
self.addEventListener('activate', (event) => {
  event.waitUntil(cleanupCache());
});

console.log('[SW] Service Worker loaded successfully');

