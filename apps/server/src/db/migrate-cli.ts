import { loadConfig } from '../config';
import { migrate } from './migrate';
import { createDb } from './pool';

const config = loadConfig();
const { pool, close } = createDb(config.DATABASE_URL, 2);
migrate(pool, (m) => console.log(m))
  .then((applied) => console.log(applied.length ? `${applied.length} applied` : 'up to date'))
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => close());
