-- Create webhook configuration table for articles
CREATE TABLE IF NOT EXISTS public.article_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.article_webhooks ENABLE ROW LEVEL SECURITY;

-- Only admins can manage webhooks
DO $$ BEGIN
  CREATE POLICY "Admins can manage article webhooks"
    ON public.article_webhooks
    FOR ALL
    USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object OR undefined_table OR undefined_function THEN NULL;
END $$;

-- Create function to trigger webhook on article publish
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION public.trigger_article_webhook()
  RETURNS TRIGGER AS $func$
  DECLARE
    webhook_url TEXT;
  BEGIN
    -- Only trigger if status changed to 'published'
    IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
      -- Get active webhook URL
      SELECT aw.webhook_url INTO webhook_url
      FROM public.article_webhooks aw
      WHERE aw.is_active = true
      LIMIT 1;
      
      -- If webhook exists, call the edge function
      IF webhook_url IS NOT NULL THEN
        PERFORM net.http_post(
          url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/publish-article-webhook',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUzNzk3NywiZXhwIjoyMDY5MTEzOTc3fQ.zsR9yYH5T0UnQT9U-umyUf--yIiDYJMMF4tvhkzPzRM'
          ),
          body := jsonb_build_object(
            'articleId', NEW.id,
            'webhookUrl', webhook_url
          )
        );
      END IF;
    END IF;
    
    RETURN NEW;
  END;
  $func$ LANGUAGE plpgsql SECURITY DEFINER;
EXCEPTION
  WHEN undefined_table OR undefined_function OR undefined_object THEN NULL;
END $$;

-- Create trigger
DO $$ BEGIN
  DROP TRIGGER IF EXISTS article_publish_webhook_trigger ON public.articles;
  
  CREATE TRIGGER article_publish_webhook_trigger
    AFTER INSERT OR UPDATE ON public.articles
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_article_webhook();
EXCEPTION
  WHEN undefined_table OR undefined_function THEN NULL;
END $$;