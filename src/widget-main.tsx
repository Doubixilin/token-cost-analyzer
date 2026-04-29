import React from "react";
import ReactDOM from "react-dom/client";
import WidgetApp from "./widget/WidgetApp";
import "./index.css";

ReactDOM.createRoot(document.getElementById("widget-root") as HTMLElement).render(
  <React.StrictMode>
    <WidgetApp />
  </React.StrictMode>,
);
