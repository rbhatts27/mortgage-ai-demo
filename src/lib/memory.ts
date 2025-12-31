/**
 * Customer Memory System
 * Currently uses Supabase, designed to be easily swapped with Twilio Memory/Conversations later
 */

import { supabaseAdmin } from './supabase';

interface Observation {
  content: string;
  source: 'voice' | 'sms' | 'whatsapp';
  occurredAt: string;
}

interface RecallResult {
  observations: Array<{
    content: string;
    occurredAt: string;
    source: string;
  }>;
  summaries: Array<{
    content: string;
  }>;
}

/**
 * Create or update a customer profile
 * Note: Profile creation is already handled by getOrCreateCustomerProfile in conversation.ts
 * This function updates additional traits if provided
 */
export async function createOrUpdateProfile(
  phone: string,
  traits?: { name?: string; email?: string }
): Promise<boolean> {
  try {
    if (!traits) return true;

    const { error } = await (supabaseAdmin
      .from('customer_profiles') as any)
      .update({
        name: traits.name || undefined,
        email: traits.email || undefined,
      })
      .eq('phone', phone);

    if (error) {
      console.error('Failed to update profile:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating profile:', error);
    return false;
  }
}

/**
 * Lookup a profile by phone number
 * Returns the phone number itself as the identifier (we use phone as primary key)
 */
export async function lookupProfile(phone: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('customer_profiles')
      .select('phone')
      .eq('phone', phone)
      .single();

    const profile = data as { phone: string } | null;
    return profile?.phone || null;
  } catch (error) {
    console.error('Error looking up profile:', error);
    return null;
  }
}

/**
 * Get or create a profile (combines lookup and create)
 * Returns phone number as the profile identifier
 */
export async function getOrCreateProfile(
  phone: string,
  traits?: { name?: string; email?: string }
): Promise<string | null> {
  try {
    // Check if profile exists
    const existingPhone = await lookupProfile(phone);

    if (existingPhone) {
      // Update traits if provided
      if (traits) {
        await createOrUpdateProfile(phone, traits);
      }
      return existingPhone;
    }

    // Create new profile (this is handled by getOrCreateCustomerProfile in conversation.ts)
    // But we can still create it here if needed
    const { error } = await (supabaseAdmin
      .from('customer_profiles') as any)
      .insert({
        phone,
        name: traits?.name || null,
        email: traits?.email || null,
      });

    if (error) {
      console.error('Error creating profile:', error);
      return null;
    }

    return phone;
  } catch (error) {
    console.error('Error in getOrCreateProfile:', error);
    return null;
  }
}

/**
 * Create an observation for a profile
 * profileId is the customer's phone number in this implementation
 */
export async function createObservation(
  profileId: string,
  content: string,
  source: 'voice' | 'sms' | 'whatsapp'
): Promise<boolean> {
  try {
    const { error } = await (supabaseAdmin
      .from('customer_observations') as any)
      .insert({
        customer_phone: profileId,
        content,
        source,
        occurred_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Failed to create observation:', error);
      return false;
    }

    console.log(`Created observation for profile ${profileId}`);
    return true;
  } catch (error) {
    console.error('Error creating observation:', error);
    return false;
  }
}

/**
 * Recall memories for a profile based on a query
 * Uses full-text search if query provided, otherwise returns recent observations
 */
export async function recallMemories(
  profileId: string,
  query: string = '',
  conversationId?: string
): Promise<RecallResult | null> {
  try {
    let observations: any[] = [];

    if (query && query.trim()) {
      // Use full-text search for relevant observations
      const { data, error } = await supabaseAdmin
        .from('customer_observations')
        .select('content, occurred_at, source')
        .eq('customer_phone', profileId)
        .textSearch('content', query)
        .order('occurred_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error searching observations:', error);
      } else {
        observations = data || [];
      }

      // If no results from search, fall back to recent observations
      if (observations.length === 0) {
        const { data: fallbackData } = await supabaseAdmin
          .from('customer_observations')
          .select('content, occurred_at, source')
          .eq('customer_phone', profileId)
          .order('occurred_at', { ascending: false })
          .limit(5);

        observations = fallbackData || [];
      }
    } else {
      // No query, get recent observations
      const { data } = await supabaseAdmin
        .from('customer_observations')
        .select('content, occurred_at, source')
        .eq('customer_phone', profileId)
        .order('occurred_at', { ascending: false })
        .limit(10);

      observations = data || [];
    }

    console.log(`Recalled ${observations.length} observations for profile ${profileId}`);

    return {
      observations: observations.map(obs => ({
        content: obs.content,
        occurredAt: obs.occurred_at,
        source: obs.source,
      })),
      summaries: [], // Summaries could be generated by analyzing observations with LLM
    };
  } catch (error) {
    console.error('Error recalling memories:', error);
    return null;
  }
}

/**
 * Extract key facts from a conversation and store as observations
 */
export async function extractAndStoreObservations(
  profileId: string,
  conversationMessages: Array<{ role: string; content: string }>,
  source: 'call' | 'sms' | 'whatsapp'
): Promise<void> {
  try {
    // Extract facts from user messages (filter out assistant responses)
    const userMessages = conversationMessages
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content)
      .join(' ');

    // Simple fact extraction - you could enhance this with an LLM call
    const facts: string[] = [];

    // Check for mortgage-related information
    if (userMessages.toLowerCase().includes('preapproval') || userMessages.toLowerCase().includes('pre-approval')) {
      facts.push('Customer is interested in mortgage pre-approval');
    }
    if (userMessages.toLowerCase().includes('first time') && userMessages.toLowerCase().includes('buyer')) {
      facts.push('Customer is a first-time home buyer');
    }
    if (userMessages.match(/\$[\d,]+/)) {
      const amounts = userMessages.match(/\$[\d,]+/g);
      if (amounts) {
        facts.push(`Customer mentioned budget: ${amounts[0]}`);
      }
    }
    if (userMessages.toLowerCase().includes('rate') || userMessages.toLowerCase().includes('interest')) {
      facts.push('Customer inquired about interest rates');
    }
    if (userMessages.toLowerCase().includes('document')) {
      facts.push('Customer asked about required documents');
    }

    // Store each fact as an observation
    for (const fact of facts) {
      await createObservation(profileId, fact, source);
    }
  } catch (error) {
    console.error('Error extracting observations:', error);
  }
}

/**
 * Format recalled memories for inclusion in AI prompt
 */
export function formatMemoriesForPrompt(memories: RecallResult | null): string {
  if (!memories) return '';

  let context = '';

  if (memories.observations && memories.observations.length > 0) {
    context += '\n\nCustomer History:\n';
    memories.observations.slice(0, 5).forEach(obs => {
      context += `- ${obs.content} (${new Date(obs.occurredAt).toLocaleDateString()})\n`;
    });
  }

  if (memories.summaries && memories.summaries.length > 0) {
    context += '\nKey Facts:\n';
    memories.summaries.forEach(summary => {
      context += `- ${summary.content}\n`;
    });
  }

  return context;
}
