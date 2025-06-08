import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import './AdminDashboard.css'; // Import custom CSS

const { Header, Content, Footer } = Layout;

// Import the new LoginPage
import LoginPage from './LoginPage';

// Import the new DashboardPage
import DashboardPage from './DashboardPage';

const AdminApp: React.FC = () => {
  return (
    <BrowserRouter basename="/admin"> {/* Set basename for admin routes */}
      <Layout className="layout" style={{ minHeight: '100vh' }}>
        <Header>
          <div className="logo" style={{ color: 'white', float: 'left', marginRight: '20px' }}>Admin Dashboard</div>
          <Menu theme="dark" mode="horizontal" defaultSelectedKeys={['1']}>
            <Menu.Item key="1"><Link to="login">Login</Link></Menu.Item>
            <Menu.Item key="2"><Link to="dashboard">Dashboard</Link></Menu.Item>
          </Menu>
        </Header>
        <Content style={{ padding: '0 50px', marginTop: '20px' }}>
          <div className="site-layout-content" style={{ background: '#fff', padding: 24, minHeight: 280 }}>
            <Routes>
              <Route path="login" element={<LoginPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="/" element={<LoginPage />} /> {/* Default to login */}
            </Routes>
          </div>
        </Content>
        <Footer style={{ textAlign: 'center' }}>Admin Dashboard ©2024</Footer>
      </Layout>
    </BrowserRouter>
  );
};

export default AdminApp;
