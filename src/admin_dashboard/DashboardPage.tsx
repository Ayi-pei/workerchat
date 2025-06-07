import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Tabs, Typography, message, Spin, Table, Tag, Button, Alert, Modal } from 'antd'; // Added Modal

const { Title } = Typography;

interface AgentKey {
  seatId: number;
  nanoid: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const [agentKeys, setAgentKeys] = useState<AgentKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [regeneratingSeatId, setRegeneratingSeatId] = useState<number | null>(null);


  const fetchAgentKeys = useCallback(async () => {
    setLoadingKeys(true);
    setFetchError(null);
    const masterKey = sessionStorage.getItem('adminMasterKey');

    if (!masterKey) {
      setFetchError("Admin key not found in session. Please re-login.");
      setLoadingKeys(false);
      message.error('Authentication required. Redirecting to login.');
      navigate('../login');
      return;
    }

    try {
      const response = await fetch('/api/admin/agent_keys', {
        headers: { 'X-Admin-Key': masterKey },
      });

      if (response.ok) {
        const data = await response.json();
        setAgentKeys(data);
      } else {
        const errorText = await response.text();
        if (response.status === 401 || response.status === 403) {
          message.error('Authentication failed. Please login again.', 3);
          sessionStorage.removeItem('adminMasterKey');
          navigate('../login');
        } else {
          setFetchError(`Failed to fetch agent keys: ${response.status} - ${errorText || response.statusText}`);
          message.error(`Error: ${response.status} - ${errorText || response.statusText}`, 5);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setFetchError(`An error occurred: ${errorMessage}`);
      message.error(`Fetch error: ${errorMessage}`, 5);
    } finally {
      setLoadingKeys(false);
    }
  }, [navigate]);

  useEffect(() => {
    const masterKey = sessionStorage.getItem('adminMasterKey');
    if (!masterKey) {
      message.error('Admin key not found. Please login.', 3);
      navigate('../login');
    } else {
      fetchAgentKeys();
    }
    setIsLoadingAuth(false);
  }, [navigate, fetchAgentKeys]);

  const handleRegenerateKey = async (seatId: number) => {
    Modal.confirm({
      title: 'Confirm Key Regeneration',
      content: `Are you sure you want to regenerate the key for Seat ID ${seatId}? The old key will be immediately invalidated.`,
      okText: 'Regenerate',
      cancelText: 'Cancel',
      onOk: async () => {
        setRegeneratingSeatId(seatId);
        const masterKey = sessionStorage.getItem('adminMasterKey');
        if (!masterKey) {
          message.error("Admin key not found. Please re-login.");
          setRegeneratingSeatId(null);
          navigate('../login');
          return;
        }

        try {
          const response = await fetch(`/api/admin/agent_keys/${seatId}/regenerate`, {
            method: 'POST',
            headers: { 'X-Admin-Key': masterKey },
          });

          if (response.ok) {
            const updatedKey = await response.json();
            message.success(`Key for Seat ID ${seatId} regenerated. New key: ${updatedKey.nanoid.substring(0,4)}...`);
            fetchAgentKeys(); // Refresh the list
          } else {
            const errorData = await response.text();
            if (response.status === 401 || response.status === 403) {
              message.error('Authentication failed. Please login again.');
              sessionStorage.removeItem('adminMasterKey');
              navigate('../login');
            } else {
              message.error(`Failed to regenerate key for Seat ID ${seatId}: ${response.status} - ${errorData || response.statusText}`, 7);
            }
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          message.error(`An error occurred while regenerating key for Seat ID ${seatId}: ${errorMsg}`, 7);
        } finally {
          setRegeneratingSeatId(null);
        }
      },
      onCancel: () => {
        // console.log('Key regeneration cancelled for Seat ID:', seatId);
      },
    });
  };


  const KeyManagementContent: React.FC = () => {
    const columns = [
      { title: 'Seat ID', dataIndex: 'seatId', key: 'seatId', sorter: (a: AgentKey, b: AgentKey) => a.seatId - b.seatId, defaultSortOrder: 'ascend' as const, width: 100, fixed: 'left' as const },
      {
        title: 'Key Value (Masked)',
        dataIndex: 'nanoid',
        key: 'nanoid',
        render: (text: string) => text ? `${text.substring(0, 4)}...${text.substring(text.length - 4)}` : 'N/A',
        ellipsis: true,
      },
      {
        title: 'Created At',
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (text: string) => new Date(text).toLocaleString(),
        sorter: (a: AgentKey, b: AgentKey) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        width: 200,
      },
      {
        title: 'Expires At',
        dataIndex: 'expiresAt',
        key: 'expiresAt',
        render: (text: string) => new Date(text).toLocaleString(),
        sorter: (a: AgentKey, b: AgentKey) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
        width: 200,
      },
      {
        title: 'Status',
        key: 'status',
        dataIndex: 'isActive',
        render: (_: any, record: AgentKey) => {
          const isExpired = new Date(record.expiresAt) < new Date();
          if (isExpired) return <Tag color="red">Expired</Tag>;
          return record.isActive ? <Tag color="green">Active</Tag> : <Tag color="orange">Inactive</Tag>;
        },
        filters: [
            { text: 'Active', value: true },
            { text: 'Inactive (but not expired)', value: false },
            { text: 'Expired', value: 'expired' },
        ],
        onFilter: (value: React.Key | boolean, record: AgentKey) => {
            const isExpired = new Date(record.expiresAt) < new Date();
            if (value === 'expired') return isExpired;
            if (isExpired) return false;
            return record.isActive === value;
        },
        width: 120,
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 120,
        fixed: 'right' as const,
        render: (_: any, record: AgentKey) => (
          <Button
            type="link"
            onClick={() => handleRegenerateKey(record.seatId)}
            loading={regeneratingSeatId === record.seatId}
            disabled={loadingKeys || (regeneratingSeatId !== null && regeneratingSeatId !== record.seatId)}
          >
            Regenerate
          </Button>
        ),
      },
    ];

    if (loadingKeys && agentKeys.length === 0) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '50px' }}><Spin size="large" tip="Loading keys..." /></div>;
    }

    return (
      <div>
        <div className="key-management-header"> {/* Apply CSS class */}
            <Title level={4} /* style={{ margin: 0 }} - CSS will handle margin */>Key Management Console</Title>
            <Button onClick={fetchAgentKeys} loading={loadingKeys && agentKeys.length > 0} disabled={regeneratingSeatId !== null}>
                Refresh Keys
            </Button>
        </div>
        {fetchError && <Alert message="Error" description={fetchError} type="error" showIcon closable style={{ marginBottom: 16 }} onClose={() => setFetchError(null)} />}
        <Table
          columns={columns}
          dataSource={agentKeys}
          rowKey="seatId"
          loading={loadingKeys && agentKeys.length > 0 && regeneratingSeatId === null}
          bordered
          size="middle"
          scroll={{ x: 1000 }}
        />
      </div>
    );
  };

  const tabItems = [
    {
      label: 'Key Management',
      key: 'keyManagement',
      children: <KeyManagementContent />,
    },
  ];

  if (isLoadingAuth) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 200px)' }}>
        <Spin size="large" tip="Verifying authentication..." />
      </div>
    );
  }

  return (
    <>
      <Title level={3} style={{ marginBottom: 24, borderBottom: '1px solid #f0f0f0', paddingBottom: '10px' }}>
        Admin Console
      </Title>
      <Tabs
        defaultActiveKey="keyManagement"
        type="card"
        items={tabItems}
      />
    </>
  );
};

export default DashboardPage;
