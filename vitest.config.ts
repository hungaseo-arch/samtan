// vitest.config.ts — 순수 계산 모듈(src/lib · src/data) 단위 테스트.
// 별칭(@/)은 vite.config.ts 를 그대로 물려받는다.
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
      environment: "node",
    },
  }),
);
