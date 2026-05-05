import { migration001_private_beta_baseline } from './001_private_beta_baseline';

export type Migration = {
  id: number;
  name: string;
  up: string;
};

export const migrations: Migration[] = [migration001_private_beta_baseline];
