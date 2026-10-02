import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Same root .env the dev scripts load.
if (existsSync('../../.env')) process.loadEnvFile('../../.env')

export default defineConfig({})
