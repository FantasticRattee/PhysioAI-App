// In-memory stand-in for @react-native-async-storage/async-storage.
// Default import (`import AsyncStorage from '...'`) resolves to this object.
// Call AsyncStorage.__reset() in beforeEach to isolate tests.
let store = {};
const AsyncStorage = {
  getItem: (k) => Promise.resolve(Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
    return Promise.resolve();
  },
  removeItem: (k) => {
    delete store[k];
    return Promise.resolve();
  },
  clear: () => {
    store = {};
    return Promise.resolve();
  },
  getAllKeys: () => Promise.resolve(Object.keys(store)),
  multiGet: (ks) => Promise.resolve(ks.map((k) => [k, Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null])),
  multiSet: (pairs) => {
    pairs.forEach(([k, v]) => {
      store[k] = String(v);
    });
    return Promise.resolve();
  },
  multiRemove: (ks) => {
    ks.forEach((k) => delete store[k]);
    return Promise.resolve();
  },
  __reset: () => {
    store = {};
  },
  __dump: () => ({ ...store }),
};
module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
