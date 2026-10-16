import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 20_000,
    env: { MONGOMS_DOWNLOAD_DIR: '../.cache/mongodb-binaries' },
  },
});
