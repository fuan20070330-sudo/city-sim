import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createDefaultScenario } from '../src/data/defaultScenario'

const targetDirectory = resolve(process.cwd(), 'public', 'scenarios')
await mkdir(targetDirectory, { recursive: true })
const scenario = createDefaultScenario()
await writeFile(
  resolve(targetDirectory, 'riverfront-fire.json'),
  JSON.stringify(scenario, null, 2),
  'utf8',
)
console.log('Wrote public/scenarios/riverfront-fire.json')
