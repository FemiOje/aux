import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { AuthProvider } from "./auth/AuthProvider";
import { Layout } from "./components/Layout";
import { DropPage } from "./pages/DropPage";
import { FeedPage } from "./pages/FeedPage";
import { SavedPage } from "./pages/SavedPage";
import "./styles.css";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    Component: Layout,
    children: [
      { index: true, Component: FeedPage },
      { path: "drops/:id", Component: DropPage },
      { path: "saved", Component: SavedPage },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthProvider>
  </StrictMode>,
);
