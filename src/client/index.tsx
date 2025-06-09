import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'; // Added useParams
import { nanoid } from 'nanoid';
import { Typography } from 'antd'; // Added Typography for placeholder App

// Removed: import App from './App';
import AgentLoginPage from './agent_console/AgentLoginPage';
import AgentDashboardPage from './agent_console/AgentDashboardPage';
import 'antd/dist/reset.css'; // Global Ant Design styles
import '../admin_dashboard/AdminDashboard.css'; // Import shared admin/agent dashboard styles

const { Title } = Typography; // For placeholder App

// Placeholder App component defined directly in this file
const App: React.FC = () => {
  const { room } = useParams<{ room?: string }>();
  // This is where the original customer chat UI logic, including usePartySocket, would go.
  // For now, a simple placeholder:
  return (
    <div style={{ padding: '20px', margin: '20px auto', maxWidth: '800px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <Title level={2}>Customer Chat Room: {room || 'Default'}</Title>
      <p>This is the placeholder for the customer chat interface.</p>
      <p>Original WebSocket connection (usePartySocket) and message display logic for customer chat would be implemented here.</p>
      <p>Features like message input, displaying list of messages, user list, etc., would be part of this component or its children.</p>
    </div>
  );
};

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          {/* Customer Chat Routes */}
          <Route path="/" element={<Navigate to={`/chat/${nanoid(8)}`} replace />} />
          <Route path="/chat/:room" element={<App />} />

          {/* Legacy or direct agent chat link - also uses the placeholder App for now */}
          {/* This route might need to be removed or re-evaluated if agents ONLY use the new console */}
          <Route path="/chat/:room/agent" element={<App />} />

          {/* New Agent Console Routes */}
          <Route path="/agent/login" element={<AgentLoginPage />} />
          <Route path="/agent/dashboard" element={<AgentDashboardPage />} />
          <Route path="/agent" element={<Navigate to="/agent/login" replace />} />

          {/* Fallback for any other unmatched routes */}
          <Route path="*" element={<Navigate to="/" />} /> {/* Simplified fallback to root, which then redirects */}
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
  );
} else {
  console.error("Failed to find the root element. The application will not be rendered.");
}
