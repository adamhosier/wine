import React from "react";
import ReactDOM from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import App from "./App";
import { restoreGhPagesPath } from "./lib/appRoute";
import "./styles.css";

restoreGhPagesPath(import.meta.env.BASE_URL, window.location, window.history);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
