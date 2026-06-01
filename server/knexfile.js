import { pgConnection } from './src/config.js'

export default {
  client: 'pg',
  connection: pgConnection(),
  migrations: { directory: './src/migrations' },
}
