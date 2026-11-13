// Jest config for unit tests. E2E uses test/jest-e2e.json.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true, diagnostics: false }],
  },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/bootstrap.ts', '!**/*.module.ts', '!**/*.spec.ts'],
  coverageDirectory: './coverage',
  coverageThreshold: {
    // Phase 0: cover the common cross-cutting helpers. Raised per module in later phases.
    global: { branches: 40, functions: 50, lines: 50, statements: 50 },
  },
};
