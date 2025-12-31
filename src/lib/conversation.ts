import { openai, AI_CONFIG, SYSTEM_PROMPT } from './openai';
import { supabaseAdmin } from './supabase';
import type { AIResponse, ConversationContext, ConversationMessage } from './types';

/**
 * Get or create a customer profile
 */
export async function getOrCreateCustomerProfile(
  customerPhone: string
): Promise<void> {
  // Check if profile exists
  const { data: existing } = await supabaseAdmin
    .from('customer_profiles')
    .select('phone')
    .eq('phone', customerPhone)
    .single();

  // If profile doesn't exist, create it
  if (!existing) {
    const { error } = await (supabaseAdmin
      .from('customer_profiles') as any)
      .insert({
        phone: customerPhone,
        name: null,
        email: null,
        notes: null,
      });

    if (error) throw error;
  }
}

/**
 * Get or create a conversation for a customer
 */
export async function getOrCreateConversation(
  customerPhone: string,
  channel: 'voice' | 'sms' | 'whatsapp'
): Promise<string> {
  // Ensure customer profile exists first
  await getOrCreateCustomerProfile(customerPhone);

  // Check for existing active conversation for this specific channel
  const { data } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('customer_phone', customerPhone)
    .eq('channel', channel)
    .eq('status', 'active')
    .single();

  const existing = data as { id: string } | null;

  if (existing) {
    return existing.id;
  }

  // Create new conversation
  const { data: newConvData, error } = await (supabaseAdmin
    .from('conversations') as any)
    .insert({
      customer_phone: customerPhone,
      channel,
      status: 'active',
      ai_enabled: true,
    })
    .select('id')
    .single();

  if (error) throw error;
  const newConv = newConvData as { id: string };
  return newConv.id;
}

/**
 * Get conversation history
 */
export async function getConversationHistory(
  conversationId: string
): Promise<ConversationMessage[]> {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const messages = data as Array<{ role: 'user' | 'assistant' | 'system'; content: string; created_at: string }> | null;

  return (messages || []).map((msg) => ({
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.created_at),
  }));
}

/**
 * Save a message to the conversation
 */
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
): Promise<void> {
  const { error } = await (supabaseAdmin
    .from('messages') as any)
    .insert({
      conversation_id: conversationId,
      role,
      content,
    });

  if (error) throw error;
}

/**
 * Generate AI response based on conversation context
 */
export async function generateAIResponse(
  context: ConversationContext
): Promise<AIResponse> {
  try {
    // Build messages array for OpenAI
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...context.messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: AI_CONFIG.model,
      messages,
      temperature: AI_CONFIG.temperature,
      max_tokens: AI_CONFIG.maxTokens,
    });

    const aiMessage = completion.choices[0].message.content || 'I apologize, I could not generate a response.';

    // Determine if handoff is needed
    const shouldHandoff = detectHandoffIntent(aiMessage, context);

    return {
      message: aiMessage,
      shouldHandoff,
      handoffReason: shouldHandoff ? 'Customer requested human assistance' : undefined,
    };
  } catch (error) {
    console.error('Error generating AI response:', error);
    return {
      message: 'I apologize, but I encountered an error. Let me connect you with a human agent.',
      shouldHandoff: true,
      handoffReason: 'AI error',
    };
  }
}

/**
 * Detect if the conversation should be handed off to a human agent
 * Checks the user's messages for explicit handoff requests
 */
function detectHandoffIntent(aiMessage: string, context: ConversationContext): boolean {
  // Check if user explicitly requested a human agent in their last few messages
  const recentUserMessages = context.messages
    .filter(msg => msg.role === 'user')
    .slice(-3) // Check last 3 user messages
    .map(msg => msg.content.toLowerCase());

  const userHandoffKeywords = [
    'speak to a person',
    'talk to a human',
    'human agent',
    'real person',
    'actual person',
    'transfer me',
    'connect me to',
    'yes', // Affirmative response after AI offers handoff
    'yeah',
    'sure',
    'please',
    'ok',
    'okay',
  ];

  // Check if the AI just asked about connecting to an agent
  const aiAskedAboutHandoff = aiMessage.toLowerCase().includes('would you like') &&
                               aiMessage.toLowerCase().includes('human');

  // If AI asked about handoff, check if user said yes in their last message
  if (aiAskedAboutHandoff && recentUserMessages.length > 0) {
    const lastUserMessage = recentUserMessages[recentUserMessages.length - 1];
    return ['yes', 'yeah', 'sure', 'please', 'ok', 'okay'].some(keyword =>
      lastUserMessage.includes(keyword)
    );
  }

  // Otherwise check if user explicitly requested human agent
  return recentUserMessages.some(message =>
    userHandoffKeywords.some(keyword => message.includes(keyword))
  );
}

/**
 * Mark conversation as handed off
 */
export async function markConversationHandedOff(conversationId: string): Promise<void> {
  const { error } = await (supabaseAdmin
    .from('conversations') as any)
    .update({ status: 'handed_off' })
    .eq('id', conversationId);

  if (error) throw error;
}
