import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Flat ESLint config.
 *
 * Deliberately narrow: `typescript-eslint` recommended plus the two classic
 * React Hooks rules. eslint-plugin-react-hooks v7's `recommended` also turns on
 * the React Compiler rule suite (immutability, refs, set-state-in-effect,
 * purity, ...), which flags a large amount of otherwise-working code in this
 * project. Enabling it wholesale would produce hundreds of findings and make
 * the lint gate useless; adopt those rules incrementally if/when the codebase
 * is migrated to the compiler.
 *
 * `supabase/functions` is excluded: it is Deno (URL imports, `Deno` global) and
 * is checked with `deno check` instead. `src-tauri` is Rust.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'release-cf/**',
      'node_modules/**',
      'src-tauri/**',
      'supabase/functions/**',
      '.dsh/**',
      '.wrangler/**',
      '.edgeone/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Underscore-prefixed args/vars are intentional placeholders.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Node-run tooling. Needs its own block because the TS block above only
    // matches **/*.{ts,tsx}, so plain .mjs/.js scripts would otherwise have no
    // node globals and trip `no-undef` on process/console/URL.
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'vite.config.ts', 'vitest.config.ts', 'eslint.config.js'],
    rules: {
      // Node-side config + tests may log and use non-browser globals freely.
      'no-console': 'off',
    },
  },
  {
    // CLI scripts report progress on stdout by design.
    files: ['scripts/**/*.{js,mjs,cjs}'],
    rules: {
      'no-console': 'off',
    },
  },
);
