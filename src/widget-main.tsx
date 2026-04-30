import React from "react";
import ReactDOM from "react-dom/client";
import WidgetApp from "./widget/WidgetApp";
import "./index.css";

const rootEl = document.getElementById("widget-root");
if (!rootEl) throw new Error("Widget root element not found");
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <WidgetApp />
  </React.StrictMode>,
);
