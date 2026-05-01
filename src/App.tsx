import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Dashboard from "./routes/Dashboard";
import Analytics from "./routes/Analytics";
import Sessions from "./routes/Sessions";
import Settings from "./routes/Settings";

function App() {
  return (
    <HashRouter>
      <ErrorBoundary>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </ErrorBoundary>
    </HashRouter>
  );
}

export default App;
