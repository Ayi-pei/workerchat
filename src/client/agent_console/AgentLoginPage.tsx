import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, message, Card, Typography, Row, Col, Alert } from 'antd';

const { Title } = Typography;

const AgentLoginPage: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { nanoidKey: string }) => {
    setIsLoading(true);
    setError(null);
    sessionStorage.removeItem('agentAuthenticated'); // Clear previous auth attempt flag

    const { nanoidKey } = values;
    if (!nanoidKey || nanoidKey.trim() === '') {
      setError('Agent key cannot be empty.');
      setIsLoading(false);
      message.error('Agent key cannot be empty.');
      return;
    }

    const keyToUse = nanoidKey.trim();

    // Construct WebSocket URL
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // The PartyKit DO (Chat) is routed via /chat/* as per wrangler.json and typical PartyKit setup
    // The room "agent_auth_room" is a placeholder for the Chat DO instance.
    // The path seen by the Chat DO will be "/agent_auth_room/agent/KEY_VALUE"
    // The Chat DO's onConnect logic uses `url.pathname.split("/")` and expects "agent" then the key.
    // The server-side Chat DO onConnect logic parses the path *after* the party name and room.
    // Path for DO: /<room>/agent/<key> e.g. /agent_auth_room/agent/KEY
    // Full WebSocket URL: ws(s)://host/chat/agent_auth_room/agent/KEY
    const wsUrl = `${wsProtocol}//${window.location.host}/chat/agent_auth_room/agent/${keyToUse}`;

    console.log(`Attempting WebSocket connection to: ${wsUrl}`);
    const tempWs = new WebSocket(wsUrl);

    tempWs.onopen = () => {
      console.log("WebSocket connection opened successfully for agent login validation.");
      message.success('Agent key validated successfully! Redirecting...');
      sessionStorage.setItem('agentNanoidKey', keyToUse);
      sessionStorage.setItem('agentAuthenticated', 'true');
      setIsLoading(false);
      tempWs.close(1000, "Login validation successful"); // Close successful auth connection
      navigate('/agent/dashboard');
    };

    tempWs.onerror = (event) => {
      console.error("WebSocket error during login attempt:", event);
      setError('Connection error. Please ensure the server is running and the key is correct, or check network issues.');
      message.error('Agent authentication failed due to a connection error.');
      setIsLoading(false);
      // WebSocket instance will attempt to fire onclose after onerror
    };

    tempWs.onclose = (event) => {
      console.log("WebSocket closed during login attempt, code:", event.code, "reason:", event.reason);
      // Only process if not already successfully authenticated and navigated
      if (!sessionStorage.getItem('agentAuthenticated')) {
        if (event.code === 1008) { // Policy Violation - our server sends this for invalid/expired key
          setError('Invalid or expired agent key. Please check your key.');
          message.error('Invalid or expired agent key.');
        } else if (event.code !== 1000 && event.code !== 1005 && event.wasClean === false) {
          // 1000 is normal closure, 1005 is no status set (can happen if server just drops connection)
          // Check if it wasn't a clean closure for other codes
          setError(`Connection failed unexpectedly (code ${event.code}). Please check your key or network.`);
          message.error(`Connection failed (code ${event.code}).`);
        } else if (!event.wasClean && !sessionStorage.getItem('agentAuthenticated')) {
            // General catch for unclean closures if not authenticated yet
            setError('Connection attempt failed. Please try again.');
            message.error('Connection attempt failed.');
        }
      }
      setIsLoading(false);
    };
  };

  const onFinishFailed = () => {
    message.error('Please fill in all required fields correctly.');
  };

  return (
    <Row justify="center" align="middle" style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Col xs={22} sm={18} md={14} lg={10} xl={8} xxl={7}>
        <Card bordered={false} className="login-card" style={{ boxShadow: '0 8px 16px rgba(0,0,0,0.1)'}}>
          <Title level={2} style={{ textAlign: 'center', marginBottom: '24px' }}>Agent Login</Title>
          {error && <Alert message={error} type="error" showIcon closable onClose={() => setError(null)} style={{ marginBottom: 20 }} />}
          <Form
            form={form}
            name="agent_login"
            onFinish={onFinish}
            onFinishFailed={onFinishFailed}
            layout="vertical"
            requiredMark="optional"
          >
            <Form.Item
              name="nanoidKey"
              label="Agent Nanoid Key"
              rules={[
                { required: true, message: 'Please input your Agent Key!' },
                { len: 16, message: 'Agent key must be 16 characters long.' }
              ]}
              hasFeedback
            >
              <Input.Password placeholder="Enter your 16-character agent key" size="large"/>
            </Form.Item>

            <Form.Item style={{marginTop: '24px'}}>
              <Button type="primary" htmlType="submit" block loading={isLoading} size="large">
                Login
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </Col>
    </Row>
  );
};

export default AgentLoginPage;
