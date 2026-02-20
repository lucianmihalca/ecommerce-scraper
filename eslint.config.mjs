import tseslint from '@typescript-eslint/eslint-plugin'
import parser from '@typescript-eslint/parser'

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': ['warn'],
      '@typescript-eslint/consistent-type-imports': ['error'],
    },
  },
]
