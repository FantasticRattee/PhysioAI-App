// PhysioAI test suite — three Jest "projects", one per layer of the app.
//
//   backend   → Express API via supertest against the REAL Railway Postgres
//               (server.js loads ../backend/.env automatically). CommonJS, no
//               transform. Run serially (--runInBand) so DB state is predictable.
//   patient   → Patient mobile AI pipeline + core logic (ESM → babel). Node env.
//               React-Native-only imports (AsyncStorage, expo-speech) are mapped
//               to in-memory mocks; tests stub global.fetch as needed.
//   therapist → Therapist web shared modules (ESM → babel). jsdom env supplies
//               window / document / localStorage; tests stub fetch.
module.exports = {
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      rootDir: __dirname,
      testMatch: ['<rootDir>/backend/**/*.test.js'],
      transform: {}, // pure CommonJS — no babel needed
      setupFilesAfterEnv: ['<rootDir>/setup/backend.setup.js'], // jest.setTimeout for network
    },
    {
      displayName: 'patient',
      testEnvironment: 'node',
      rootDir: __dirname,
      testMatch: ['<rootDir>/patient/**/*.test.js'],
      setupFiles: ['<rootDir>/setup/patient.setup.js'],
      transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
      moduleNameMapper: {
        '^@react-native-async-storage/async-storage$': '<rootDir>/mocks/asyncStorageMock.js',
        '^expo-speech$': '<rootDir>/mocks/expoSpeechMock.js',
      },
    },
    {
      displayName: 'therapist',
      testEnvironment: 'jsdom',
      rootDir: __dirname,
      testMatch: ['<rootDir>/therapist/**/*.test.js'],
      setupFiles: ['<rootDir>/setup/therapist.setup.js'],
      transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
    },
  ],
};
