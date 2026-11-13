// Flat-config ESLint for the MARBOU API (ESLint v9).
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'prisma/migrations/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['{src,test,prisma}/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  prettier,
);
