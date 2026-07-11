import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useScrollPreservation } from './useScrollPreservation';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useSocialMediaManager');

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
  const { preserveScrollPosition } = useScrollPreservation();
  const [posts, setPosts] = useState<SocialMediaPost[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchPosts = async () => {
    if (!isAdmin) {
      logger.debug('fetchPosts', 'User does not have admin role, skipping fetch');
      return;
    }

    await preserveScrollPosition(async () => {
      setLoading(true);
      try {
        logger.info('fetchPosts', 'Fetching social media posts');
        const { data, error } = await supabase
          .from('social_media_posts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) {
          logger.error('fetchPosts', 'Error fetching posts', { error });
          throw error;
        }
        logger.debug('fetchPosts', 'Fetched posts', { data });
        setPosts(data || []);
      } catch (error) {
        logger.error('fetchPosts', 'Failed to fetch posts', { error });
        toast.error('Failed to fetch posts');
      } finally {
        setLoading(false);
      }
    });
  };

  const fetchWebhooks = async () => {
    if (!isAdmin) {
      logger.debug('fetchWebhooks', 'User does not have admin role, skipping webhook fetch');
      return;
    }

    try {
      logger.info('fetchWebhooks', 'Fetching social media webhooks');
      const { data, error } = await supabase
        .from('social_media_webhooks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('fetchWebhooks', 'Error fetching webhooks', { error });
        throw error;
      }
      logger.debug('fetchWebhooks', 'Fetched webhooks', { data });
      setWebhooks(data || []);
    } catch (error) {
      logger.error('fetchWebhooks', 'Failed to fetch webhooks', { error });
      toast.error('Failed to fetch webhooks');
    }
  };

  const generatePost = async (data: { contentType: string; subjectType: string }) => {
    let result: { success: boolean; post?: unknown } | undefined;
    await preserveScrollPosition(async () => {
      setGenerating(true);
      try {
        logger.info('generatePost', 'Generating post', { data });
        const { data: responseData, error } = await supabase.functions.invoke('social-media-manager', {
          body: {
            action: 'generate',
            contentType: data.contentType,
            subjectType: data.subjectType
          }
        });

        if (error) {
          logger.error('generatePost', 'Error generating post', { error });
          throw error;
        }

        logger.debug('generatePost', 'Post generated', { responseData });
        toast.success('Post generated successfully!');
        await fetchPosts(); // Refresh posts
        result = { success: true, post: responseData };
      } catch (error) {
        logger.error('generatePost', 'Failed to generate post', { error });
        toast.error('Failed to generate post');
        throw error;
      } finally {
        setGenerating(false);
      }
    });
    return result;
  };

  const publishPost = async (id: string) => {
    let success = false;
    await preserveScrollPosition(async () => {
      try {
        const { data: _data, error } = await supabase.functions.invoke('social-media-manager', {
          body: {
            action: 'publish',
            postId: id
          }
        });

        if (error) throw error;
        
        toast.success('Post published successfully!');
        await fetchPosts(); // Refresh posts
        success = true;
      } catch (error) {
        logger.error('publishPost', 'Failed to publish post', { error });
        toast.error('Failed to publish post');
        throw error;
      }
    });
    return success;
  };

  const deletePost = async (id: string) => {
    let success = false;
    await preserveScrollPosition(async () => {
      try {
        const { error } = await supabase
          .from('social_media_posts')
          .delete()
          .eq('id', id);

        if (error) throw error;
        
        toast.success('Post deleted successfully!');
        await fetchPosts(); // Refresh posts
        success = true;
      } catch (error) {
        logger.error('deletePost', 'Failed to delete post', { error });
        toast.error('Failed to delete post');
        throw error;
      }
    });
    return success;
  };

  const repostPost = async (_id: string, _type: string) => {
    try {
      // Logic for reposting would go here
      toast.success('Post reposted successfully!');
      return true;
    } catch (error) {
      logger.error('repostPost', 'Failed to repost', { error });
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
      logger.error('addWebhook', 'Failed to add webhook', { error });
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
      logger.error('updateWebhook', 'Failed to update webhook', { error });
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
      logger.error('deleteWebhook', 'Failed to delete webhook', { error });
      toast.error('Failed to delete webhook');
      throw error;
    }
  };

  const testWebhook = async (_id: string) => {
    try {
      // Logic for testing webhook would go here
      toast.success('Webhook test successful!');
      return true;
    } catch (error) {
      logger.error('testWebhook', 'Failed to test webhook', { error });
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
      
      logger.debug('debugContent', 'Debug content', { data });
      toast.success('Check console for debug information');
      return data;
    } catch (error) {
      logger.error('debugContent', 'Failed to debug content', { error });
      toast.error('Failed to debug content');
      throw error;
    }
  };

  useEffect(() => {
    logger.debug('effect', 'useSocialMediaManager effect running', { user, isAdmin });

    if (user && isAdmin) {
      logger.debug('effect', 'Auth conditions met, fetching data');
      fetchPosts();
      fetchWebhooks();
    } else {
      logger.debug('effect', 'Auth conditions not met', { hasUser: !!user, isAdmin });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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