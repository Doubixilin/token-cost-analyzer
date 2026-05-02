import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Global error logger to help locate "Cannot read properties of undefined"
window.addEventListener("error", (event) => {
  if (event.error) {
    console.error("[GLOBAL-ERROR]", event.error.message, "\nStack:", event.error.stack);
  }
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[GLOBAL-UNHANDLED]", event.reason);
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
