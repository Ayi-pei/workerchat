import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Tabs, Typography, message, Spin, Table, Tag, Button, Alert, Modal, Row, Col, Space, Form, Input, Select } from 'antd';

const { Title } = Typography;
const { Option } = Select;

interface AgentKey {
  seatId: number;
  nanoid: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
}

interface AdminAgent {
  id: string;
  nickname: string;
  accountStatus: 'enabled' | 'disabled';
  assignedKeyId: number | null;
  createdAt: string;
}


const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const [agentKeys, setAgentKeys] = useState<AgentKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState<boolean>(false);
  const [fetchKeysError, setFetchKeysError] = useState<string | null>(null);
  const [regeneratingSeatId, setRegeneratingSeatId] = useState<number | null>(null);


  const fetchAgentKeys = useCallback(async () => {
    setLoadingKeys(true);
    setFetchKeysError(null);
    const masterKey = sessionStorage.getItem('adminMasterKey');

    if (!masterKey) {
      setFetchKeysError("Admin key not found in session. Please re-login.");
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
          message.error('Authentication failed fetching keys. Please login again.', 3);
          sessionStorage.removeItem('adminMasterKey');
          navigate('../login');
        } else {
          setFetchKeysError(`Failed to fetch agent keys: ${response.status} - ${errorText || response.statusText}`);
          message.error(`Error fetching keys: ${response.status} - ${errorText || response.statusText}`, 5);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setFetchKeysError(`An error occurred fetching keys: ${errorMessage}`);
      message.error(`Fetch keys error: ${errorMessage}`, 5);
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
            fetchAgentKeys();
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
    });
  };


  const KeyManagementContent: React.FC = () => {
    const columns = [
      { title: 'Seat ID', dataIndex: 'seatId', key: 'seatId', sorter: (a: AgentKey, b: AgentKey) => a.seatId - b.seatId, defaultSortOrder: 'ascend' as const, width: 100, fixed: 'left' as const },
      { title: 'Key Value (Masked)', dataIndex: 'nanoid', key: 'nanoid', render: (text: string) => text ? `${text.substring(0, 4)}...${text.substring(text.length - 4)}` : 'N/A', ellipsis: true },
      { title: 'Created At', dataIndex: 'createdAt', key: 'createdAt', render: (text: string) => new Date(text).toLocaleString(), sorter: (a: AgentKey, b: AgentKey) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(), width: 200 },
      { title: 'Expires At', dataIndex: 'expiresAt', key: 'expiresAt', render: (text: string) => new Date(text).toLocaleString(), sorter: (a: AgentKey, b: AgentKey) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(), width: 200 },
      {
        title: 'Status', key: 'status', dataIndex: 'isActive', render: (_: any, record: AgentKey) => {
          const isExpired = new Date(record.expiresAt) < new Date();
          if (isExpired) return <Tag color="red">Expired</Tag>;
          return record.isActive ? <Tag color="green">Active</Tag> : <Tag color="orange">Inactive</Tag>;
        },
        filters: [ { text: 'Active', value: true }, { text: 'Inactive (but not expired)', value: false }, { text: 'Expired', value: 'expired' } ],
        onFilter: (value: React.Key | boolean, record: AgentKey) => {
            const isExpired = new Date(record.expiresAt) < new Date();
            if (value === 'expired') return isExpired;
            if (isExpired) return false;
            return record.isActive === value;
        }, width: 120,
      },
      {
        title: 'Actions', key: 'actions', width: 120, fixed: 'right' as const, render: (_: any, record: AgentKey) => (
          <Button type="link" onClick={() => handleRegenerateKey(record.seatId)} loading={regeneratingSeatId === record.seatId} disabled={loadingKeys || (regeneratingSeatId !== null && regeneratingSeatId !== record.seatId)}>Regenerate</Button>
        ),
      },
    ];

    if (loadingKeys && agentKeys.length === 0) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '50px' }}><Spin size="large" tip="Loading keys..." /></div>;
    }

    return (
      <div>
        <div className="key-management-header">
            <Title level={4}>Key Management Console</Title>
            <Button onClick={fetchAgentKeys} loading={loadingKeys && agentKeys.length > 0} disabled={regeneratingSeatId !== null}>Refresh Keys</Button>
        </div>
        {fetchKeysError && <Alert message="Error Fetching Keys" description={fetchKeysError} type="error" showIcon closable style={{ marginBottom: 16 }} onClose={() => setFetchKeysError(null)} />}
        <Table columns={columns} dataSource={agentKeys} rowKey="seatId" loading={loadingKeys && agentKeys.length > 0 && regeneratingSeatId === null} bordered size="middle" scroll={{ x: 1000 }} />
      </div>
    );
  };

  // eslint-disable-next-line react/no-multi-comp
  const AgentManagementContent: React.FC<{ agentKeysProp: AgentKey[] }> = ({ agentKeysProp }) => {
    const [agents, setAgents] = useState<AdminAgent[]>([]);
    const [loadingAgents, setLoadingAgents] = useState<boolean>(false);
    const [fetchAgentsError, setFetchAgentsError] = useState<string | null>(null);
    const [isAddAgentModalVisible, setIsAddAgentModalVisible] = useState<boolean>(false);
    const [addAgentLoading, setAddAgentLoading] = useState<boolean>(false);
    const [addAgentForm] = Form.useForm();

    const [isEditAgentModalVisible, setIsEditAgentModalVisible] = useState<boolean>(false);
    const [editingAgent, setEditingAgent] = useState<AdminAgent | null>(null);
    const [editAgentLoading, setEditAgentLoading] = useState<boolean>(false);
    const [editAgentForm] = Form.useForm();

    const localNavigate = useNavigate();

    const fetchAdminAgents = useCallback(async () => {
      setLoadingAgents(true);
      setFetchAgentsError(null);
      const masterKey = sessionStorage.getItem('adminMasterKey');
      if (!masterKey) {
        message.error("Admin key not found. Please re-login.");
        setLoadingAgents(false);
        localNavigate('../login');
        return;
      }

      try {
        const response = await fetch('/api/admin/agents', {
          headers: { 'X-Admin-Key': masterKey },
        });
        if (response.ok) {
          const data = await response.json();
          setAgents(data);
        } else { /* ... error handling ... */
            const errorText = await response.text();
            if (response.status === 401 || response.status === 403) {
              message.error('Authentication failed fetching agents. Please login again.');
              sessionStorage.removeItem('adminMasterKey');
              localNavigate('../login');
            } else {
              setFetchAgentsError(`Failed to fetch agents: ${response.status} - ${errorText || response.statusText}`);
            }
        }
      } catch (err) { /* ... error handling ... */
        const errorMsg = err instanceof Error ? err.message : String(err);
        setFetchAgentsError(`An error occurred fetching agents: ${errorMsg}`);
      } finally {
        setLoadingAgents(false);
      }
    }, [localNavigate]);

    useEffect(() => {
      fetchAdminAgents();
    }, [fetchAdminAgents]);

    const assignableKeysForAdd = useMemo(() => {
        return agentKeysProp.filter(key => {
          const isExpired = new Date(key.expiresAt) < new Date();
          const isAssigned = agents.some(agent => agent.assignedKeyId === key.seatId);
          return key.isActive && !isExpired && !isAssigned;
        });
    }, [agentKeysProp, agents]);

    const assignableKeysForEdit = useMemo(() => {
        if (!editingAgent) return [];
        return agentKeysProp.filter(key => {
          const isExpired = new Date(key.expiresAt) < new Date();
          const isAssignedToOtherAgent = agents.some(agent =>
              agent.id !== editingAgent.id && agent.assignedKeyId === key.seatId
          );
          return key.isActive && !isExpired && (key.seatId === editingAgent.assignedKeyId || !isAssignedToOtherAgent);
        });
    }, [agentKeysProp, agents, editingAgent]);

    const handleAddAgentSubmit = async (values: { nickname: string; assignedKeyId: number }) => {
        setAddAgentLoading(true);
        const masterKey = sessionStorage.getItem('adminMasterKey');
        if (!masterKey) { message.error("Admin key not found."); setAddAgentLoading(false); localNavigate('../login'); return; }

        try {
            const response = await fetch('/api/admin/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Key': masterKey },
                body: JSON.stringify({ nickname: values.nickname, assignedKeyId: values.assignedKeyId }),
            });
            if (response.ok) {
                message.success("Agent added successfully!");
                fetchAdminAgents();
                setIsAddAgentModalVisible(false);
                addAgentForm.resetFields();
            } else {
                const errorData = await response.json();
                if (response.status === 401 || response.status === 403) { message.error('Auth failed.'); sessionStorage.removeItem('adminMasterKey'); localNavigate('../login'); }
                else { message.error(`Failed to add agent: ${errorData.error || response.statusText}`, 7); }
            }
        } catch (err) {
            message.error(`An error occurred: ${err instanceof Error ? err.message : String(err)}`, 7);
        } finally {
            setAddAgentLoading(false);
        }
    };

    const handleOpenEditAgentModal = (agentRecord: AdminAgent) => {
        setEditingAgent(agentRecord);
        setIsEditAgentModalVisible(true);
    };

    useEffect(() => {
        if (editingAgent && isEditAgentModalVisible) {
          editAgentForm.setFieldsValue({
            nickname: editingAgent.nickname,
            accountStatus: editingAgent.accountStatus,
            assignedKeyId: editingAgent.assignedKeyId,
          });
        }
      }, [editingAgent, isEditAgentModalVisible, editAgentForm]);

    const handleEditAgentSubmit = async (values: { nickname: string; accountStatus: 'enabled' | 'disabled'; assignedKeyId: number | null }) => {
        if (!editingAgent) return;
        setEditAgentLoading(true);
        const masterKey = sessionStorage.getItem('adminMasterKey');
        if (!masterKey) { message.error("Admin key not found."); setEditAgentLoading(false); localNavigate('../login'); return; }

        try {
            const response = await fetch(`/api/admin/agents/${editingAgent.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Key': masterKey },
                body: JSON.stringify(values),
            });
            if (response.ok) {
                message.success(`Agent ${editingAgent.nickname} updated successfully!`);
                fetchAdminAgents();
                setIsEditAgentModalVisible(false);
                setEditingAgent(null);
            } else {
                const errorData = await response.json();
                if (response.status === 401 || response.status === 403) { message.error('Auth failed.'); sessionStorage.removeItem('adminMasterKey'); localNavigate('../login'); }
                else { message.error(`Failed to update agent: ${errorData.error || response.statusText}`, 7); }
            }
        } catch (err) {
            message.error(`An error occurred: ${err instanceof Error ? err.message : String(err)}`, 7);
        } finally {
            setEditAgentLoading(false);
        }
    };

    const handleDeleteAgent = async (agentId: string, nickname: string) => {
        Modal.confirm({
          title: 'Confirm Agent Deletion',
          content: `Are you sure you want to delete agent "${nickname}" (ID: ${agentId})? This action cannot be undone.`,
          okText: 'Delete',
          okType: 'danger',
          cancelText: 'Cancel',
          onOk: async () => {
            setLoadingAgents(true); // Use general loading for table refresh
            const masterKey = sessionStorage.getItem('adminMasterKey');
            if (!masterKey) {
              message.error("Admin key not found. Please re-login.");
              setLoadingAgents(false);
              localNavigate('../login');
              return;
            }

            try {
              const response = await fetch(`/api/admin/agents/${agentId}`, {
                method: 'DELETE',
                headers: { 'X-Admin-Key': masterKey },
              });

              if (response.ok) {
                message.success(`Agent "${nickname}" (ID: ${agentId}) deleted successfully.`);
                fetchAdminAgents();
              } else {
                const errorData = await response.text();
                if (response.status === 401 || response.status === 403) {
                  message.error('Authentication failed. Please login again.');
                  sessionStorage.removeItem('adminMasterKey');
                  localNavigate('../login');
                } else {
                  message.error(`Failed to delete agent: ${response.status} - ${errorData || response.statusText}`, 7);
                }
              }
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              message.error(`An error occurred: ${errorMsg}`, 7);
            } finally {
              setLoadingAgents(false);
            }
          },
        });
      };

    const agentColumns = [
      { title: 'ID', dataIndex: 'id', key: 'id', width: 120, ellipsis: true, sorter: (a: AdminAgent, b: AdminAgent) => a.id.localeCompare(b.id) },
      { title: 'Nickname', dataIndex: 'nickname', key: 'nickname', sorter: (a: AdminAgent, b: AdminAgent) => a.nickname.localeCompare(b.nickname) },
      {
        title: 'Account Status', dataIndex: 'accountStatus', key: 'accountStatus', width: 150,
        render: (status: string) => <Tag color={status === 'enabled' ? 'green' : 'red'}>{status.toUpperCase()}</Tag>,
        filters: [ { text: 'Enabled', value: 'enabled'}, { text: 'Disabled', value: 'disabled'} ],
        onFilter: (value: React.Key | boolean, record: AdminAgent) => record.accountStatus === value,
      },
      {
        title: 'Assigned Key', dataIndex: 'assignedKeyId', key: 'assignedKeyId', width: 200,
        render: (keyId: number | null) => {
          if (keyId === null || keyId === undefined) return <Tag>Unassigned</Tag>;
          const key = agentKeysProp.find(k => k.seatId === keyId);
          return key ? <Tag color="blue">{`${key.nanoid.substring(0, 4)}... (Seat ${keyId})`}</Tag> : <Tag color="volcano">Key Not Found (ID: {keyId})</Tag>;
        },
      },
      { title: 'Created At', dataIndex: 'createdAt', key: 'createdAt', render: (text: string) => new Date(text).toLocaleString(), sorter: (a: AdminAgent, b: AdminAgent) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(), width: 200 },
      { title: 'Actions', key: 'actions', width: 180, fixed: 'right' as const, render: (_: any, record: AdminAgent) => (
        <Space size="middle">
          <Button type="link" onClick={() => handleOpenEditAgentModal(record)} disabled={loadingAgents || addAgentLoading || editAgentLoading || regeneratingSeatId !== null}>Edit</Button>
          <Button type="link" danger onClick={() => handleDeleteAgent(record.id, record.nickname)} disabled={loadingAgents || addAgentLoading || editAgentLoading || regeneratingSeatId !== null}>Delete</Button>
        </Space>
      )},
    ];

    if (loadingAgents && agents.length === 0) {
        return <div style={{ textAlign: 'center', padding: '50px' }}><Spin size="large" tip="Loading agents..." /></div>;
    }

    return (
      <div>
        <Row className="key-management-header" justify="space-between" align="middle">
          <Col><Title level={4}>Agent Management Console</Title></Col>
          <Col>
            <Space>
              <Button onClick={fetchAdminAgents} loading={loadingAgents && agents.length > 0} disabled={addAgentLoading || editAgentLoading}>Refresh Agents</Button>
              <Button type="primary" onClick={() => setIsAddAgentModalVisible(true)} disabled={addAgentLoading || editAgentLoading}>Add New Agent</Button>
            </Space>
          </Col>
        </Row>
        {fetchAgentsError && <Alert message="Error Fetching Agents" description={fetchAgentsError} type="error" showIcon closable onClose={() => setFetchAgentsError(null)} style={{ marginBottom: 16 }} />}
        <Table
          columns={agentColumns}
          dataSource={agents}
          rowKey="id"
          loading={loadingAgents && agents.length > 0 && !addAgentLoading && !editAgentLoading}
          bordered
          size="middle"
          scroll={{ x: 1000 }}
        />
        <Modal
            title="Add New Agent"
            open={isAddAgentModalVisible}
            onCancel={() => { setIsAddAgentModalVisible(false); addAgentForm.resetFields(); }}
            destroyOnClose={true}
            confirmLoading={addAgentLoading}
            okText="Add Agent"
            onOk={() => addAgentForm.submit()}
        >
            <Form form={addAgentForm} layout="vertical" name="add_agent_form" onFinish={handleAddAgentSubmit} initialValues={{ nickname: '', assignedKeyId: null }}>
                <Form.Item name="nickname" label="Nickname" rules={[{ required: true, message: 'Please input the agent nickname!' }]}>
                    <Input placeholder="Enter agent nickname" />
                </Form.Item>
                <Form.Item name="assignedKeyId" label="Assign Key (Seat ID)" rules={[{ required: true, message: 'Please select a key to assign!' }]}>
                    <Select placeholder="Select an available key" loading={loadingKeys} disabled={loadingKeys}>
                        {assignableKeysForAdd.length === 0 && !loadingKeys && <Option value={null} disabled>No assignable keys available</Option>}
                        {assignableKeysForAdd.map(key => (
                            <Option key={key.seatId} value={key.seatId}>
                                {`${key.nanoid.substring(0,4)}...${key.nanoid.substring(key.nanoid.length - 4)} (Seat ${key.seatId}, Expires: ${new Date(key.expiresAt).toLocaleDateString()})`}
                            </Option>
                        ))}
                    </Select>
                </Form.Item>
            </Form>
        </Modal>
        <Modal
            title="Edit Agent"
            open={isEditAgentModalVisible}
            onCancel={() => { setIsEditAgentModalVisible(false); setEditingAgent(null); /* editAgentForm.resetFields(); done by destroyOnClose */}}
            destroyOnClose={true}
            confirmLoading={editAgentLoading}
            okText="Save Changes"
            onOk={() => editAgentForm.submit()}
        >
            <Form form={editAgentForm} layout="vertical" name="edit_agent_form" onFinish={handleEditAgentSubmit}>
                <Form.Item name="nickname" label="Nickname" rules={[{ required: true, message: 'Please input the agent nickname!' }]}>
                    <Input placeholder="Enter agent nickname" />
                </Form.Item>
                <Form.Item name="accountStatus" label="Account Status" rules={[{ required: true, message: 'Please select account status!'}]}>
                    <Select>
                        <Option value="enabled">Enabled</Option>
                        <Option value="disabled">Disabled</Option>
                    </Select>
                </Form.Item>
                <Form.Item name="assignedKeyId" label="Assign Key (Seat ID) (Optional)"> {/* Made optional by removing required rule here */}
                     <Select placeholder="Select a key or leave unassigned" allowClear loading={loadingKeys} disabled={loadingKeys}>
                        {assignableKeysForEdit.length === 0 && !loadingKeys && (!editingAgent || !editingAgent.assignedKeyId) && <Option value={null} disabled>No other keys available</Option>}
                        {/* Ensure null can be selected if allowClear is true */}
                        {editingAgent?.assignedKeyId === null && <Option value={null}>Unassigned</Option>}
                        {assignableKeysForEdit.map(key => (
                            <Option key={key.seatId} value={key.seatId}>
                                {`${key.nanoid.substring(0,4)}...${key.nanoid.substring(key.nanoid.length - 4)} (Seat ${key.seatId}, Expires: ${new Date(key.expiresAt).toLocaleDateString()})`}
                                {key.seatId === editingAgent?.assignedKeyId && " (Current)"}
                            </Option>
                        ))}
                    </Select>
                </Form.Item>
            </Form>
        </Modal>
      </div>
    );
  };

  const tabItems = [
    { label: 'Key Management', key: 'keyManagement', children: <KeyManagementContent /> },
    { label: 'Agent Management', key: 'agentManagement', children: <AgentManagementContent agentKeysProp={agentKeys} /> },
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
      <Title level={3} style={{ marginBottom: 24, borderBottom: '1px solid #f0f0f0', paddingBottom: '10px' }} className="dashboard-page-header">Admin Console</Title>
      <Tabs defaultActiveKey="keyManagement" type="card" items={tabItems} />
    </>
  );
};

export default DashboardPage;
