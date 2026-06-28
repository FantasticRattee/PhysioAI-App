// jsdom already supplies window / document / localStorage. Provide a default
// fetch that fails loudly so any un-mocked network call is obvious; individual
// tests assign their own global.fetch = jest.fn() before exercising API code.
if (typeof global.fetch === 'undefined') {
  global.fetch = () => Promise.reject(new Error('global.fetch not mocked in this test'));
}
