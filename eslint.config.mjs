// Flat-config ESLint for the MARBOU API (ESLint v9 + typescript-eslint).
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores.
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'prisma/migrations/**',
      'jest.config.js',
      'eslint.config.mjs',
    ],
  },

  // TypeScript files in src/, test/ and prisma/seed/.
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'prisma/**/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Variables prefixed with _ are intentionally unused.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `any` is unavoidable in NestJS middleware / guards that receive raw req/res.
      '@typescript-eslint/no-explicit-any': 'off',
      // Type imports are used as values in some decorator contexts.
      '@typescript-eslint/consistent-type-imports': 'off',
      // Empty constructor bodies are common in NestJS modules.
      '@typescript-eslint/no-empty-function': 'off',
      // Allow require() in JS config files and seed scripts.
      '@typescript-eslint/no-require-imports': 'off',
      // Void return in async functions is common in NestJS lifecycle hooks.
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },

  // Disable Prettier-conflicting rules (must be last).
  prettierConfig,
);
