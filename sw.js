// sw.js - Client-only Emergency Triage PWA
const CACHE_NAME = 'emergency-triage-v1';
const OFFLINE_URL = '/offline.html';
const DB_NAME = 'triage-db';
const DB_VERSION = 2; // Increased for schema updates

// Assets to cache
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles.css',
  '/app.js',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html',
  '/lib/idb.js' // Include IndexedDB library if needed
];

// Install - Cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate - Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - Cache-first strategy
self.addEventListener('fetch', event => {
  // For HTML pages, network first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/'))
        .then(response => response || caches.match(OFFLINE_URL))
    );
    return;
  }
  
  // For all other assets, cache first
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        
        return fetch(event.request)
          .then(fetchResponse => {
            // Don't cache API-like requests or external resources
            if (!event.request.url.includes('/api/') && 
                event.request.url.startsWith(self.location.origin)) {
              const responseClone = fetchResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseClone));
            }
            return fetchResponse;
          })
          .catch(error => {
            console.log('Fetch failed; returning offline page', error);
            return caches.match(OFFLINE_URL);
          });
      })
  );
});

// ============================
// OFFLINE-ONLY DATA MANAGEMENT
// ============================

// Setup IndexedDB for local storage
self.addEventListener('message', async event => {
  if (event.data.type === 'INIT_DB') {
    await initDatabase();
    event.ports[0].postMessage({ success: true });
  }
  
  if (event.data.type === 'SAVE_PATIENT') {
    const patientId = await savePatient(event.data.patient);
    event.ports[0].postMessage({ success: true, id: patientId });
  }
  
  if (event.data.type === 'GET_PATIENTS') {
    const patients = await getAllPatients();
    event.ports[0].postMessage({ success: true, patients });
  }
  
  if (event.data.type === 'UPDATE_PATIENT') {
    await updatePatient(event.data.id, event.data.updates);
    event.ports[0].postMessage({ success: true });
  }
  
  if (event.data.type === 'DELETE_PATIENT') {
    await deletePatient(event.data.id);
    event.ports[0].postMessage({ success: true });
  }
  
  if (event.data.type === 'EXPORT_DATA') {
    const data = await exportAllData();
    event.ports[0].postMessage({ success: true, data });
  }
  
  if (event.data.type === 'IMPORT_DATA') {
    await importData(event.data.data);
    event.ports[0].postMessage({ success: true });
  }
});

// Database initialization
async function initDatabase() {
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
          autoIncrement: true
        });
        store.createIndex('priority', 'priority', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('location', 'location', { unique: false });
      }
      
      // Triage history for analytics
      if (!db.objectStoreNames.contains('triage_history')) {
        const store = db.createObjectStore('triage_history', {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('user', 'user', { unique: false });
      }
      
      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        const store = db.createObjectStore('settings', {
          keyPath: 'key'
        });
      }
    };
  });
}

// Patient CRUD operations
async function savePatient(patient) {
  const db = await initDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['patients'], 'readwrite');
    const store = transaction.objectStore('patients');
    
    // Add timestamp
    patient.createdAt = new Date().toISOString();
    patient.updatedAt = patient.createdAt;
    patient.synced = false; // Mark as not synced (for future use)
    
    const request = store.add(patient);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllPatients(filters = {}) {
  const db = await initDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['patients'], 'readonly');
    const store = transaction.objectStore('patients');
    
    let request;
    if (filters.priority) {
      const index = store.index('priority');
      request = index.getAll(filters.priority);
    } else if (filters.status) {
      const index = store.index('status');
      request = index.getAll(filters.status);
    } else {
      request = store.getAll();
    }
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function updatePatient(id, updates) {
  const db = await initDatabase();
  return new Promise(async (resolve, reject) => {
    const transaction = db.transaction(['patients'], 'readwrite');
    const store = transaction.objectStore('patients');
    
    // Get existing patient
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const patient = getRequest.result;
      if (!patient) {
        reject(new Error('Patient not found'));
        return;
      }
      
      // Update with new data
      const updatedPatient = {
        ...patient,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      const putRequest = store.put(updatedPatient);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

async function deletePatient(id) {
  const db = await initDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['patients'], 'readwrite');
    const store = transaction.objectStore('patients');
    
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Data export/import (for backup/restore)
async function exportAllData() {
  const db = await initDatabase();
  
  return new Promise(async (resolve, reject) => {
    const exportData = {
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      patients: [],
      settings: [],
      history: []
    };
    
    const transaction = db.transaction(
      ['patients', 'settings', 'triage_history'], 
      'readonly'
    );
    
    // Export patients
    const patientsStore = transaction.objectStore('patients');
    const patientsRequest = patientsStore.getAll();
    patientsRequest.onsuccess = () => {
      exportData.patients = patientsRequest.result;
    };
    
    // Export settings
    const settingsStore = transaction.objectStore('settings');
    const settingsRequest = settingsStore.getAll();
    settingsRequest.onsuccess = () => {
      exportData.settings = settings
