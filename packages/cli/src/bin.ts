#!/usr/bin/env node
// pleasync CLI bin entry — Phase 2 scaffolding

import { main } from './index.js';

main(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
