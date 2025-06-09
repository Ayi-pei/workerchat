import React from 'react';
import { Form, Input, Button, Card, Typography, Row, Col, message } from 'antd';
import { useNavigate } from 'react-router-dom';

const { Title } = Typography;

const LoginPage: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const onFinish = (values: { masterKey: string }) => {
    if (values.masterKey && values.masterKey.trim() !== '') {
      sessionStorage.setItem('adminMasterKey', values.masterKey);
      message.success('Key stored successfully. Redirecting to dashboard...');
      // The navigate function automatically considers the basename set in BrowserRouter
      navigate('../dashboard'); // Use relative path to navigate from /admin/login to /admin/dashboard
    } else {
      message.error('Master key cannot be empty.');
      // form.resetFields(['masterKey']); // Optionally reset if you want to clear on empty submit
    }
  };

  const onFinishFailed = () => {
    message.error('Submission failed. Please check the form.');
  };

  return (
    <Row justify="center" align="middle" style={{ minHeight: 'calc(100vh - 180px)' /* Adjusted based on typical AntD header/footer */ }} className="login-page-container">
      <Col xs={22} sm={18} md={14} lg={10} xl={8} xxl={7}> {/* Slightly wider on XXL */}
        <Card bordered={true} className="login-card"> {/* Use class from CSS */}
          <Title level={2} style={{ textAlign: 'center', marginBottom: '24px' }}>Admin Login</Title>
          <Form
            form={form}
            name="admin_login"
            onFinish={onFinish}
            onFinishFailed={onFinishFailed}
            layout="vertical"
            requiredMark="optional" // Can be true, false, or 'optional'
            initialValues={{ masterKey: '' }} // Optional: set initial values
          >
            <Form.Item
              name="masterKey"
              label="Master Admin Key"
              rules={[
                {
                  required: true,
                  message: 'Please input your Master Admin Key!'
                },
                // Example of a custom validator if needed in future:
                // {
                //   validator: (_, value) =>
                //     value && value.startsWith('admin') ? Promise.resolve() : Promise.reject(new Error('Key should start with admin'))
                // }
              ]}
              hasFeedback // Shows validation status icon
            >
              <Input.Password placeholder="Enter master admin key" size="large" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}> {/* Remove default bottom margin for the last item if desired */}
              <Button type="primary" htmlType="submit" block size="large">
                Login
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </Col>
    </Row>
  );
};

export default LoginPage;
