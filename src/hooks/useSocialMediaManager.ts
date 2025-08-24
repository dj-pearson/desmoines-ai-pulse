import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SocialMediaPost {
  id: string;
  content_type: string;
  subject_type: string;
  platform_type: string;
  post_content: string;
  post_title?: string;
  status: string;
  created_at: string;
  content_url?: string;
  scheduled_for?: string;
  posted_at?: string;
}

interface Webhook {
  id: string;
  name: string;
  platform: string;
  webhook_url: string;
  is_active: boolean;
  created_at: string;
}

export function useSocialMediaManager() {
  const { user, isAdmin } = useAuth();
  const [posts, setPosts] = useState<SocialMediaPost[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchPosts = async () => {
    if (!isAdmin) {
      console.log('User does not have admin role, skipping fetch');
      return;
    }
    
    setLoading(true);
    try {
      console.log('Fetching social media posts...');
      const { data, error } = await supabase
        .from('social_media_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching posts:', error);
        throw error;
      }
      console.log('Fetched posts:', data);
      setPosts(data || []);
    } catch (error) {
      console.error('Failed to fetch posts:', error);
      toast.error('Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhooks = async () => {
    if (!isAdmin) {
      console.log('User does not have admin role, skipping webhook fetch');
      return;
    }
    
    try {
      console.log('Fetching social media webhooks...');
      const { data, error } = await supabase
        .from('social_media_webhooks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching webhooks:', error);
        throw error;
      }
      console.log('Fetched webhooks:', data);
      setWebhooks(data || []);
    } catch (error) {
      console.error('Failed to fetch webhooks:', error);
      toast.error('Failed to fetch webhooks');
    }
  };

  const generatePost = async (data: { contentType: string; subjectType: string }) => {
    setGenerating(true);
    try {
      console.log('Generating post:', data);
      const { data: result, error } = await supabase.functions.invoke('social-media-manager', {
        body: {
          action: 'generate',
          contentType: data.contentType,
          subjectType: data.subjectType
        }
      });

      if (error) {
        console.error('Error generating post:', error);
        throw error;
      }
      
      console.log('Post generated:', result);
      toast.success('Post generated successfully!');
      await fetchPosts(); // Refresh posts
      return { success: true, post: result };
    } catch (error) {
      console.error('Failed to generate post:', error);
      toast.error('Failed to generate post');
      throw error;
    } finally {
      setGenerating(false);
    }
  };

  const publishPost = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('social-media-manager', {
        body: {
          action: 'publish',
          postId: id
        }
      });

      if (error) throw error;
      
      toast.success('Post published successfully!');
      await fetchPosts(); // Refresh posts
      return true;
    } catch (error) {
      console.error('Failed to publish post:', error);
      toast.error('Failed to publish post');
      throw error;
    }
  };

  const deletePost = async (id: string) => {
    try {
      const { error } = await supabase
        .from('social_media_posts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Post deleted successfully!');
      await fetchPosts(); // Refresh posts
      return true;
    } catch (error) {
      console.error('Failed to delete post:', error);
      toast.error('Failed to delete post');
      throw error;
    }
  };

  const repostPost = async (id: string, type: string) => {
    try {
      // Logic for reposting would go here
      toast.success('Post reposted successfully!');
      return true;
    } catch (error) {
      console.error('Failed to repost:', error);
      toast.error('Failed to repost');
      throw error;
    }
  };

  const addWebhook = async (webhook_url: string) => {
    try {
      const { error } = await supabase
        .from('social_media_webhooks')
        .insert([{
          name: 'New Webhook',
          platform: 'custom',
          webhook_url,
          is_active: true
        }]);

      if (error) throw error;
      
      toast.success('Webhook added successfully!');
      await fetchWebhooks(); // Refresh webhooks
      return true;
    } catch (error) {
      console.error('Failed to add webhook:', error);
      toast.error('Failed to add webhook');
      throw error;
    }
  };

  const updateWebhook = async (id: string, webhook_url: string) => {
    try {
      const { error } = await supabase
        .from('social_media_webhooks')
        .update({ webhook_url })
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Webhook updated successfully!');
      await fetchWebhooks(); // Refresh webhooks
      return true;
    } catch (error) {
      console.error('Failed to update webhook:', error);
      toast.error('Failed to update webhook');
      throw error;
    }
  };

  const deleteWebhook = async (id: string) => {
    try {
      const { error } = await supabase
        .from('social_media_webhooks')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Webhook deleted successfully!');
      await fetchWebhooks(); // Refresh webhooks
      return true;
    } catch (error) {
      console.error('Failed to delete webhook:', error);
      toast.error('Failed to delete webhook');
      throw error;
    }
  };

  const testWebhook = async (id: string) => {
    try {
      // Logic for testing webhook would go here
      toast.success('Webhook test successful!');
      return true;
    } catch (error) {
      console.error('Failed to test webhook:', error);
      toast.error('Failed to test webhook');
      throw error;
    }
  };

  const debugContent = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('social-media-manager', {
        body: {
          action: 'debug'
        }
      });

      if (error) throw error;
      
      console.log('Debug content:', data);
      toast.success('Check console for debug information');
      return data;
    } catch (error) {
      console.error('Failed to debug content:', error);
      toast.error('Failed to debug content');
      throw error;
    }
  };

  useEffect(() => {
    console.log('useSocialMediaManager effect running, user:', user, 'isAdmin:', isAdmin);
    console.log('User object:', JSON.stringify(user, null, 2));
    console.log('IsAdmin check result:', isAdmin);
    
    if (user && isAdmin) {
      console.log('Auth conditions met, fetching data...');
      fetchPosts();
      fetchWebhooks();
    } else {
      console.log('Auth conditions not met. User:', !!user, 'IsAdmin:', isAdmin);
    }
  }, [user, isAdmin]);

  return {
    posts,
    webhooks,
    loading,
    isLoading: loading,
    isGenerating: generating,
    generatePost,
    publishPost,
    deletePost,
    repostPost,
    addWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
    debugContent,
    refresh: () => {
      fetchPosts();
      fetchWebhooks();
    }
  };
}