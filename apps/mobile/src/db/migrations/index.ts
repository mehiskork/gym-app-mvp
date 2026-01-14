export type Migration = {
  id: number; // incremental ID, e.g. 1,2,3...
  name: string; // human readable
  up: string; // SQL to apply
};

import { migration001_init } from './migration001_init';

export const migrations: Migration[] = [migration001_init];
