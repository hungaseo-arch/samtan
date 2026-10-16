// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  // 배포 베이스 경로 — GitHub Pages(서브경로) 배포 시 VITE_BASE=/samtan/ 로 빌드.
  // 미설정(일반 빌드/개발)은 루트('/') 유지.
  base: process.env.VITE_BASE ?? "/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // 벤더를 갈라 두면 앱 코드만 바뀐 배포에서 recharts·supabase 청크가 캐시에
    // 그대로 남는다. 합쳐 두면 문구 하나 고쳐도 1.3 MB 를 다시 받게 된다.
    // xlsx 는 이미 동적 import 로 갈라져 있어 여기서 다루지 않는다.
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ["recharts"],
          supabase: ["@supabase/supabase-js"],
          vendor: ["@tanstack/react-query", "radix-ui", "lucide-react"],
        },
      },
    },
    // 위 분리 후 최대 청크가 500 kB 밑으로 내려간다. 경고선을 낮춰 두어야
    // 다음에 무거운 의존성이 들어올 때 다시 눈에 띈다.
    chunkSizeWarningLimit: 500,
  },
});
