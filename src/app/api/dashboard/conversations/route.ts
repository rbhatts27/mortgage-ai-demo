import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface ConversationRow {
  id: string;
  customer_phone: string;
  channel: string;
  status: string;
  ai_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  try {
    // Get all conversations with customer info
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select(`
        id,
        customer_phone,
        channel,
        status,
        ai_enabled,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const conversations = data as ConversationRow[] | null;

    // Get messages for each conversation
    const conversationsWithMessages = await Promise.all(
      (conversations || []).map(async (conv) => {
        const { data: messagesData } = await supabaseAdmin
          .from('messages')
          .select('id, role, content, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true });

        const messages = messagesData as Array<{
          id: string;
          role: string;
          content: string;
          created_at: string;
        }> | null;

        return {
          ...conv,
          messages: messages || [],
          messageCount: messages?.length || 0,
        };
      })
    );

    // Calculate stats
    const activeCount = conversations?.filter(c => c.status === 'active').length || 0;
    const handedOffToday = conversations?.filter(c => {
      const today = new Date().toDateString();
      const convDate = new Date(c.updated_at).toDateString();
      return c.status === 'handed_off' && convDate === today;
    }).length || 0;

    const totalCompleted = conversations?.filter(c => c.status === 'completed').length || 0;
    const totalHandedOff = conversations?.filter(c => c.status === 'handed_off').length || 0;
    const aiResolutionRate = totalCompleted + totalHandedOff > 0
      ? Math.round((totalCompleted / (totalCompleted + totalHandedOff)) * 100)
      : 0;

    return NextResponse.json({
      conversations: conversationsWithMessages,
      stats: {
        active: activeCount,
        handedOffToday,
        aiResolutionRate,
      },
    });

  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
