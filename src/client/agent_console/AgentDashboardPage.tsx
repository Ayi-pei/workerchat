import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Typography, Spin, Avatar, Button, Space, message, Tag, List, Badge, Input } from 'antd';
import { UserOutlined, MessageOutlined, TeamOutlined, LogoutOutlined, WifiOutlined, DisconnectOutlined, SendOutlined } from '@ant-design/icons';
import { usePartySocket } from 'partysocket/react';
import type { ChatMessage, Message as ServerMessage } from '../../shared';
import { formatDistanceToNow } from 'date-fns';
import { nanoid } from 'nanoid';
import './AgentConsole.css'; // Import agent console specific styles

const { Title, Text, Paragraph } = Typography;
const { Header, Content, Sider } = Layout;

interface ConversationSummary {
  id: string;
  customerName: string;
  lastMessageSnippet?: string;
  unreadCount?: number;
  timestamp?: string;
  avatarUrl?: string;
  isOnline?: boolean;
}

const AgentDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [agentId, setAgentId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loadingConversations, setLoadingConversations] = useState(false);

  const [currentChatMessages, setCurrentChatMessages] = useState<ChatMessage[]>([]);
  const [messageInputValue, setMessageInputValue] = useState<string>("");
  const [sendingMessage, setSendingMessage] = useState<boolean>(false);

  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  const [websocketError, setWebsocketError] = useState<Error | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('Initializing...');

  const scrollToBottom = useCallback(() => { // Wrapped in useCallback
    chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []); // No dependencies, ref is stable

  useEffect(scrollToBottom, [currentChatMessages]);

  useEffect(() => {
    const isAuthenticated = sessionStorage.getItem('agentAuthenticated') === 'true';
    const storedAgentKey = sessionStorage.getItem('agentNanoidKey');

    if (isAuthenticated && storedAgentKey) {
      setAgentId(storedAgentKey);
      setAuthLoading(false);
      const simulatedConvos: ConversationSummary[] = [
        { id: 'cust101', customerName: 'Alice W.', avatarUrl: `https://i.pravatar.cc/150?u=cust101`, lastMessageSnippet: 'My order #12345 seems to be stuck in processing.', unreadCount: 2, timestamp: new Date(Date.now() - 5 * 60000).toISOString(), isOnline: true },
        { id: 'cust102', customerName: 'Bob B.', avatarUrl: `https://i.pravatar.cc/150?u=cust102`, lastMessageSnippet: 'Can you help me with a refund request?', unreadCount: 0, timestamp: new Date(Date.now() - 10 * 60000).toISOString(), isOnline: false },
        { id: 'cust103', customerName: 'Charlie M.', avatarUrl: `https://i.pravatar.cc/150?u=cust103`, lastMessageSnippet: 'Thanks a lot, that resolved my issue!', unreadCount: 0, timestamp: new Date(Date.now() - 3600 * 1000).toISOString(), isOnline: true },
      ];
      setConversations(simulatedConvos);
    } else {
      message.error('Agent not authenticated. Redirecting to login.', 3);
      navigate('/agent/login');
    }
  }, [navigate]);

  useEffect(() => {
    if (selectedConversationId && agentId) {
      setCurrentChatMessages([
        { id: 'msg1_sim', user: selectedConversationId, customerId: selectedConversationId, role: 'user', userType: 'customer', content: 'Hello Agent, I have an issue with my recent order.', timestamp: new Date(Date.now() - 3 * 60000).toISOString() },
        { id: 'msg2_sim', user: agentId, role: 'assistant', userType: 'agent', content: 'Hi there! I see. Could you please provide me with your order number?', timestamp: new Date(Date.now() - 2 * 60000).toISOString(), customerId: selectedConversationId },
        { id: 'msg3_sim', user: selectedConversationId, customerId: selectedConversationId, role: 'user', userType: 'customer', content: 'Sure, it is #ORD1234567.', timestamp: new Date(Date.now() - 1 * 60000).toISOString() },
      ]);
    } else {
      setCurrentChatMessages([]);
    }
  }, [selectedConversationId, agentId]);


  const roomNameForSocket = agentId ? `agent_console_room/agent/${agentId}` : null;

  const socket = usePartySocket({
    host: window.location.host, party: "chat", room: roomNameForSocket!, skip: !roomNameForSocket,
    onOpen: () => { setConnectionStatus('Connected'); message.success('Connected to agent server.', 2); console.log('Agent console WebSocket connected.'); },
    onMessage: (event: MessageEvent) => {
      try {
        const serverMsg = JSON.parse(event.data as string) as ServerMessage;
        console.log('Message from server (agent console):', serverMsg);

        if (serverMsg.type === 'add') {
          const newChatMessage = serverMsg as any;
          if (newChatMessage.customerId === selectedConversationId && newChatMessage.user !== agentId) {
            setCurrentChatMessages((prev) => [...prev, newChatMessage]);
          }
          setConversations(prevConvos => prevConvos.map(convo => {
            const convoId = newChatMessage.customerId || (newChatMessage.userType === 'customer' ? newChatMessage.user : null);
            if (convo.id === convoId) {
              return {
                ...convo,
                lastMessageSnippet: newChatMessage.content,
                timestamp: newChatMessage.timestamp || new Date().toISOString(),
                unreadCount: convo.id === selectedConversationId ? 0 : (convo.unreadCount || 0) + 1,
              };
            }
            return convo;
          }));
        } else if (serverMsg.type === 'agent_assigned') {
            message.success(`You have been assigned to customer: ${serverMsg.customerId.substring(0,6)}...`, 5);
            setConversations(prevConvos => { /* ... (same as before) ... */
                const existingConvo = prevConvos.find(c => c.id === serverMsg.customerId);
                if (existingConvo) {
                    return prevConvos.map(c => c.id === serverMsg.customerId ? {...c, unreadCount: (c.unreadCount || 0) +1, lastMessageSnippet: "New assignment!"} : c);
                } else {
                    return [...prevConvos, {
                        id: serverMsg.customerId, customerName: `Customer ${serverMsg.customerId.substring(0,6)}`,
                        lastMessageSnippet: "Newly assigned to you.", unreadCount: 1, timestamp: new Date().toISOString(), isOnline: true,
                    }];
                }
            });
        }
      } catch (e) { console.error('Failed to parse message:', e); message.error('Error processing server message.'); }
    },
    onClose: (event: CloseEvent) => { setConnectionStatus(`Disconnected (Code: ${event.code})`); if(event.code !== 1000 && event.code !== 1005) message.error(`WebSocket disconnected: ${event.reason || event.code}`, 5); console.warn('Agent console WebSocket disconnected:', event.code, event.reason);},
    onError: (errorEvent: Event) => { setWebsocketError(new Error('WebSocket error.')); message.error('WebSocket error.'); setConnectionStatus('Error'); console.error('Agent console WebSocket error:', errorEvent);}
  });

  const handleSendMessage = async () => {
    if (!messageInputValue.trim() || !agentId || !selectedConversationId) return;
    setSendingMessage(true);
    const messageToSend: ChatMessage = {
      id: nanoid(8), user: agentId, role: 'assistant', userType: 'agent',
      content: messageInputValue.trim(), timestamp: new Date().toISOString(), customerId: selectedConversationId,
    };
    try {
      socket.send(JSON.stringify({ type: "add", ...messageToSend } as ServerMessage));
      setCurrentChatMessages((prev) => [...prev, messageToSend]);
      setMessageInputValue("");
      setConversations(prevConvos => prevConvos.map(convo =>
        convo.id === selectedConversationId ? { ...convo, lastMessageSnippet: messageToSend.content, timestamp: messageToSend.timestamp } : convo
      ));
    } catch (e) { message.error("Failed to send message."); console.error("Send message error:", e);
    } finally { setSendingMessage(false); }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('agentAuthenticated'); sessionStorage.removeItem('agentNanoidKey');
    if (socket && socket.readyState === WebSocket.OPEN) socket.close(1000, "Agent logged out");
    message.success('Logged out.'); navigate('/agent/login');
  };

  if (authLoading) {
    return <Layout style={{ minHeight: '100vh', justifyContent: 'center', alignItems: 'center' }}><Spin size="large" tip="Authenticating Agent..." /></Layout>;
  }
  const getConnectionStatusTag = () => {
    if (connectionStatus === 'Connected') return <Tag icon={<WifiOutlined />} color="success">Connected</Tag>;
    if (connectionStatus.startsWith('Disconnected')) return <Tag icon={<DisconnectOutlined />} color="warning">{connectionStatus}</Tag>;
    if (connectionStatus === 'Error') return <Tag icon={<DisconnectOutlined />} color="error">Error</Tag>;
    return <Tag color="processing">{connectionStatus}</Tag>;
  };
  const currentSelectedConversation = conversations.find(c => c.id === selectedConversationId);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', background: '#001529' }}>
        <Title level={3} style={{ color: 'white', margin: 0, lineHeight: '64px' }}>Agent Console</Title>
        <Space size="middle" className="agent-console-header-space"> {/* Added class */}
          {getConnectionStatusTag()}
          {agentId && (
            <Space align="center" className="header-agent-info"> {/* Added class */}
              <Avatar style={{ backgroundColor: '#1890ff' }} icon={<UserOutlined />} />
              <Text /* style={{ color: 'rgba(255, 255, 255, 0.85)' }} - Handled by CSS */ >Agent: {agentId.substring(0, 4)}...</Text>
            </Space>
          )}
          <Button type="default" icon={<LogoutOutlined />} onClick={handleLogout} ghost>Logout</Button>
        </Space>
      </Header>
      <Layout>
        <Sider
            width={300} theme="light" className="conversation-sider" // Added class
            style={{ borderRight: '1px solid #f0f0f0', paddingBottom: '10px', overflowY: 'auto', height: 'calc(100vh - 64px)' }}
            breakpoint="lg" collapsedWidth="0"
        >
          <Title level={5} style={{ margin: '16px', textAlign: 'left' }}>Conversations</Title>
          <List itemLayout="horizontal" dataSource={conversations} renderItem={item => (
              <List.Item
                onClick={() => { setSelectedConversationId(item.id); setConversations(prev => prev.map(c => c.id === item.id ? {...c, unreadCount: 0} : c));}}
                className={selectedConversationId === item.id ? 'selected-conversation' : ''} // Apply class for selection
                // style prop removed in favor of CSS classes
              >
                <List.Item.Meta
                  avatar={<Avatar src={item.avatarUrl || undefined} icon={!item.avatarUrl ? <UserOutlined /> : undefined} />}
                  title={<Space style={{width: '100%', justifyContent: 'space-between'}}><Typography.Text strong ellipsis>{item.customerName}</Typography.Text>{item.timestamp && <Typography.Text type="secondary" style={{fontSize: '0.8em'}}>{formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}</Typography.Text>}</Space>}
                  description={<Typography.Text ellipsis type="secondary">{item.lastMessageSnippet || 'No messages yet'}</Typography.Text>}
                />
                <Space direction="vertical" align="end" style={{height: '100%', justifyContent: 'space-around', flexShrink:0}}>{item.unreadCount && item.unreadCount > 0 && (<Badge count={item.unreadCount} size="small" />)}{item.isOnline && <Tag color="green" style={{fontSize: '0.7em', padding: '0 4px', margin: 0}}>Online</Tag>}</Space>
              </List.Item>
            )}
            locale={{ emptyText: 'No active conversations' }} // Added empty text for List
          />
        </Sider>
        <Layout style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 64px)' /* Ensure layout doesn't exceed viewport with header */ }}>
          <Content className="chat-window-content" style={{ background: '#f9f9f9' /* Slightly off-white background for content area */, padding: 0, margin: '16px 0 0 0', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' /* Parent controls overflow */ }}>
            {selectedConversationId && currentSelectedConversation ? (
              <>
                <div style={{padding: '16px 20px', borderBottom: '1px solid #f0f0f0', flexShrink: 0}}> {/* Chat Header */}
                    <Title level={4} style={{ margin: 0 }}>Chat with {currentSelectedConversation.customerName}</Title>
                </div>
                <div className="chat-message-list-container"> {/* Renamed for clarity */}
                    <div className="chat-message-list"> {/* Actual list for messages */}
                    {currentChatMessages.map(msg => (
                        <div key={msg.id} className="message-item-wrapper">
                            <div className={`message-item ${msg.userType === 'agent' ? 'agent-message' : 'customer-message'}`}>
                            {/* Sender can be added if needed: <div className="message-sender">{msg.userType === 'agent' ? 'You' : currentSelectedConversation.customerName}</div> */}
                            <Paragraph>{msg.content}</Paragraph>
                            <div className="message-timestamp">{new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        </div>
                    ))}
                    <div ref={chatMessagesEndRef} />
                    </div>
                </div>
                <div className="message-input-area" style={{padding: '16px 20px', borderTop: '1px solid #f0f0f0', background: '#fff'}}>
                  <Input.TextArea
                    value={messageInputValue}
                    onChange={(e) => setMessageInputValue(e.target.value)}
                    placeholder="Type your message..."
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    onPressEnter={(e) => { if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); handleSendMessage(); }}} // More specific Enter key check
                  />
                  <Button type="primary" icon={<SendOutlined />} onClick={handleSendMessage} loading={sendingMessage} disabled={!messageInputValue.trim()} style={{marginLeft: '10px'}} />
                </div>
              </>
            ) : (
              <div className="chat-placeholder"><MessageOutlined /><p>Select a conversation to start chatting.</p></div>
            )}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default AgentDashboardPage;
