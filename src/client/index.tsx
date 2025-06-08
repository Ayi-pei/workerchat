import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
// The existing App component for customer chat
import App from './App'; // Assuming App.tsx is in the same directory or path is correct
import AgentLoginPage from './agent_console/AgentLoginPage';
import AgentDashboardPage from './agent_console/AgentDashboardPage';
import 'antd/dist/reset.css'; // Global Ant Design styles
import '../admin_dashboard/AdminDashboard.css'; // Import shared admin/agent dashboard styles

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          {/* Existing Customer Chat Routes */}
          {/* Redirect root to a new customer chat room */}
          <Route path="/" element={<Navigate to={`/chat/${nanoid(8)}`} replace />} />
          {/* Customer chat room */}
          <Route path="/chat/:room" element={<App />} />

          {/* Legacy or direct agent chat link, if App handles it.
              This might need re-evaluation based on how agents connect with keys.
              For now, assuming this direct agent chat via App is separate from the new console.
              If the new agent console is the ONLY way agents should interact, this route might be removed or changed.
              The prompt for agent authentication in backend was: /<room_name>/agent/<agent_nanoid_key>
              This route /chat/:room/agent does not fit that pattern for key-based auth directly in URL.
              Let's keep it as is from previous state for now, assuming App.tsx handles its own logic.
          */}
          <Route path="/chat/:room/agent" element={<App />} />

          {/* New Agent Console Routes */}
          <Route path="/agent/login" element={<AgentLoginPage />} />
          <Route path="/agent/dashboard" element={<AgentDashboardPage />} />
          {/* Redirect /agent to /agent/login by default */}
          <Route path="/agent" element={<Navigate to="/agent/login" replace />} />

          {/* Fallback for any other unmatched routes within this SPA */}
          {/* This will catch any /foo or /bar and send to a new customer chat room */}
          <Route path="*" element={<Navigate to={`/chat/${nanoid(8)}`} replace />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
  );
} else {
  console.error("Failed to find the root element. The Admin Dashboard will not be rendered.");
}
