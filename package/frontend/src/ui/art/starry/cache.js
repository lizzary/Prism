// IndexedDB cache for the baked painting: [{ meta, blob }] under "<version>@<scale>". Only the latest bake is kept.
const DB = 'prism-art', STORE = 'bakes';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadBake(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const q = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    q.onsuccess = () => resolve(q.result ?? null);
    q.onerror = () => reject(q.error);
  });
}

export async function saveBake(key, entries) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    st.clear();
    st.put(entries, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
