import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const rootEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));
dotenv.config({ path: rootEnvFile });
