import { v4 as uuidv4 } from 'uuid';

export function newId(prefix: string) {
  return `${prefix}_${uuidv4()}`;
}
