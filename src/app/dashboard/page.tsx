'use client';

import { useEffect, useState } from 'react';

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  customer_phone: string;
  channel: string;
  status: string;
  ai_enabled: boolean;
  created_at: string;
  updated_at: string;
  messageCount: number;
  messages: Message[];
}

interface DashboardData {
  conversations: Conversation[];
  stats: {
    active: number;
    handedOffToday: number;
    aiResolutionRate: number;
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedConvs, setExpandedConvs] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const toggleConversation = (id: string) => {
    setExpandedConvs(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const fetchData = async () => {
    try {
      const response = await fetch('/api/dashboard/conversations');
      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      handed_off: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-gray-100 text-gray-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getChannelIcon = (channel: string) => {
    const icons = {
      sms: '💬',
      voice: '📞',
      whatsapp: '💚',
    };
    return icons[channel as keyof typeof icons] || '💬';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          AI Conversation Dashboard
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Stats Cards */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Active Conversations</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{data?.stats.active || 0}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Handed Off Today</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{data?.stats.handedOffToday || 0}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">AI Resolution Rate</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{data?.stats.aiResolutionRate || 0}%</p>
          </div>
        </div>

        {/* Conversations List */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Live Conversations & Messages</h2>
            <p className="text-sm text-gray-500 mt-1">Click on a conversation to view message transcript</p>
          </div>
          <div className="p-6">
            {!data?.conversations || data.conversations.length === 0 ? (
              <p className="text-gray-500 text-center">No conversations yet. Start by sending a message to your Twilio number.</p>
            ) : (
              <div className="space-y-4">
                {data.conversations.map((conv) => (
                  <div key={conv.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Conversation Header */}
                    <button
                      onClick={() => toggleConversation(conv.id)}
                      className="w-full px-6 py-4 bg-gray-50 hover:bg-gray-100 text-left flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center space-x-4 flex-1">
                        <span className="text-2xl">{getChannelIcon(conv.channel)}</span>
                        <div>
                          <div className="flex items-center space-x-3">
                            <span className="font-medium text-gray-900">{conv.customer_phone}</span>
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(conv.status)}`}>
                              {conv.status.replace('_', ' ')}
                            </span>
                            <span className="text-xs text-gray-500 uppercase">{conv.channel}</span>
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            <span className="font-mono text-xs">{conv.id.substring(0, 8)}...</span> • {conv.messageCount} messages • Started {new Date(conv.created_at).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${expandedConvs.has(conv.id) ? 'transform rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Message Transcript */}
                    {expandedConvs.has(conv.id) && (
                      <div className="px-6 py-4 bg-white border-t border-gray-200">
                        <div className="mb-3 text-xs text-gray-500 font-mono">
                          Conversation ID: {conv.id}
                        </div>
                        {conv.messages.length === 0 ? (
                          <p className="text-gray-400 text-sm italic">No messages yet</p>
                        ) : (
                          <div className="space-y-3">
                            {conv.messages.map((msg) => (
                              <div
                                key={msg.id}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                              >
                                <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                                  msg.role === 'user'
                                    ? 'bg-blue-500 text-white'
                                    : msg.role === 'assistant'
                                    ? 'bg-gray-100 text-gray-900'
                                    : 'bg-yellow-50 text-yellow-900 border border-yellow-200'
                                }`}>
                                  <div className="text-xs font-semibold mb-1 opacity-75">
                                    {msg.role === 'user' ? 'Customer' : msg.role === 'assistant' ? 'AI Assistant' : 'System'}
                                  </div>
                                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                                  <div className={`text-xs mt-1 ${
                                    msg.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                                  }`}>
                                    {new Date(msg.created_at).toLocaleTimeString()}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
