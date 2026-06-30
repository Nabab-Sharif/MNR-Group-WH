import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppErrorBoundary from "./components/AppErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </AppErrorBoundary>
);
