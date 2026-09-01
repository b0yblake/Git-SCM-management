import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

// Layer boundaries from ARCHITECTURE.md §2 ("Forbidden edges"), enforced by lint
// rather than by review. Each pattern maps to a row in that table.
const noElectron = (where) => ({
  group: ['electron', 'electron/*'],
  message: `${where} must not import Electron.`
})
const noReact = (where) => ({
  group: ['react', 'react-dom', 'react/*'],
  message: `${where} must not import React.`
})
const noPty = (where) => ({ group: ['node-pty'], message: `${where} must not import node-pty.` })
const noXterm = (where) => ({ group: ['@xterm/*'], message: `${where} must not import xterm.js.` })

const restrict = (...patterns) => ({
  'no-restricted-imports': ['error', { patterns }]
})

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'coverage/**'] },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },

  {
    files: ['src/shared/**/*.ts'],
    rules: restrict(noElectron('shared/'), noReact('shared/'), noPty('shared/'), noXterm('shared/'))
  },

  {
    files: ['src/main/features/*/domain/**/*.ts'],
    rules: restrict(noElectron('Domain'), noReact('Domain'), noPty('Domain'), noXterm('Domain'))
  },

  {
    files: ['src/preload/**/*.ts'],
    rules: restrict({
      group: ['**/main/**', '@main/*'],
      message: 'The preload bridge must not import Main-process code.'
    })
  },

  {
    ...reactHooks.configs.flat.recommended,
    files: ['src/renderer/**/*.{ts,tsx}']
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: restrict(
      {
        group: ['electron', 'electron/*'],
        message: 'Renderer must not import Electron — go through window.gitdeck.'
      },
      noPty('Renderer'),
      { group: ['**/main/**'], message: 'Renderer must not import Main-process code.' }
    )
  },

  {
    files: ['**/*.spec.{ts,tsx}', 'src/**/testing/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' }
  },

  prettier
)
