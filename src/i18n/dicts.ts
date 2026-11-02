/**
 * dicts.ts — Registers both dictionaries at once for Node (the server and the tests: npm test loads
 * it with --import). The browser does not use this; it downloads only the language in use.
 */
import { en } from './en.ts';
import { id } from './id.ts';
import { registerDict } from './core.ts';

registerDict('en', en);
registerDict('id', id);
