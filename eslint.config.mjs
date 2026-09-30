// See: https://eslint.org/docs/latest/use/configure/configuration-files

import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import jest from 'eslint-plugin-jest'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['actions/*/dist/**', 'coverage/**']
  },
  {
    // Base rules for every JS/TS file, including script/* and this file.
    files: ['**/*.{js,mjs,ts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    // Type-aware rules for the real source. Kept off build scripts and
    // tests so they don't need a tsconfig project of their own.
    files: ['src/**/*.ts'],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ['__tests__/**/*.ts'],
    extends: [jest.configs['flat/recommended']]
  },
  eslintConfigPrettier
)
