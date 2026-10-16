import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/home/Index";
import NotFound from "./pages/not-found/Index";
import { LanguageProvider } from "@/i18n/provider";
import { AuthProvider } from "@/auth/AuthProvider";

// 화면 데이터는 회차 단위로만 바뀐다 — 창 포커스마다 다시 받을 이유가 없다.
// 저장 직후에는 호출부가 invalidateQueries / reloadData() 로 명시적으로 갱신한다.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            {/* 탭 하나가 URL 한 개 — 새로고침·뒤로가기·링크 공유가 모두 살아난다.
                Index 는 부모 라우트에 두고 탭은 자식 세그먼트로만 받는다. 이렇게 해야
                '/' ↔ '/life' 를 오갈 때 Index 가 재마운트되지 않는다(재마운트되면
                loadData() 가 다시 돌아 전체 화면이 로딩 스피너로 깜빡인다).
                자식은 렌더할 것이 없지만(탭 본문은 Index 가 그린다) 이 줄이 있어야
                '/life' 가 아래 '*'(NotFound)로 떨어지지 않는다.
                유효하지 않은 탭 이름은 Index 안에서 '/' 로 되돌린다. */}
            <Route path="/" element={<Index />}>
              <Route path=":tab" element={null} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
