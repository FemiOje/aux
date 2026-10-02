import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "./components/Layout";
import { DropPage } from "./pages/DropPage";
import { FeedPage } from "./pages/FeedPage";
import "./styles.css";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    Component: Layout,
    children: [
      { index: true, Component: FeedPage },
      { path: "drops/:id", Component: DropPage },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
