import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminApp from './AdminApp';
import 'antd/dist/reset.css'; // Import Ant Design styles

const rootElement = document.getElementById('admin-root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AdminApp />
    </React.StrictMode>
  );
}
