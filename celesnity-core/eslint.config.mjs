import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/generated/**',
      'coverage/**',
      'eslint.config.mjs',
      'jest.config.ts',
      'jest.metadata-crawler-integration.config.ts',
      'jest.mysql-integration.config.ts',
      'prisma.config.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          allowDefaultProject: ['jest.data-workflow-integration.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Keep executable JavaScript linted without applying TypeScript-only type rules.
    files: ['scripts/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  {
    // Everything under src/tests is a specification: Jest globals are legal
    // there and only there.
    //
    // Because they live outside the production layers, the boundary rules below
    // no longer constrain them. That is intended — a specification legitimately
    // reaches across layers to stub a collaborator, and a Prisma-boundary
    // specification has to import the generated enums the domain may not touch.
    // The rules below now describe production code exactly, with no exemptions.
    files: ['src/tests/**/*.ts', '**/*.spec.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // Test doubles commonly implement promise-returning ports without awaiting
      // and Jest assertions intentionally pass methods as values. Keep the
      // production policy strict while allowing those specification idioms.
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@nestjs/*',
            '@prisma/*',
            'express',
            'minio',
            'pg',
            '@infrastructure/*',
            '@presentation/*',
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@nestjs/*',
            '@prisma/*',
            'express',
            'minio',
            'pg',
            '@infrastructure/*',
            '@modules/*',
            '@presentation/*',
          ],
        },
      ],
    },
  },
  {
    // Controllers and DTOs may depend on the application layer and on NestJS, but
    // never on a concrete adapter or on the composition root. This was already
    // true; stating it makes it stay true.
    files: ['src/presentation/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@prisma/*', 'minio', 'pg', '@infrastructure/*', '@modules/*'],
        },
      ],
    },
  },
);
