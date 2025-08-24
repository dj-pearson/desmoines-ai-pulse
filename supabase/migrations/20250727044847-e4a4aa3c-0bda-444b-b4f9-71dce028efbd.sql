-- Create user_event_feedback table to store thumbs up/down data
CREATE TABLE public.user_event_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('thumbs_up', 'thumbs_down', 'interested', 'not_interested')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);

-- Enable RLS
ALTER TABLE public.user_event_feedback ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own feedback" 
ON public.user_event_feedback 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own feedback" 
ON public.user_event_feedback 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own feedback" 
ON public.user_event_feedback 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own feedback" 
ON public.user_event_feedback 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create user_event_interactions table to track event views, clicks, etc.
CREATE TABLE public.user_event_interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('view', 'click', 'share', 'save')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_event_interactions ENABLE ROW LEVEL SECURITY;

-- Create policies for interactions
CREATE POLICY "Users can view their own interactions" 
ON public.user_event_interactions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own interactions" 
ON public.user_event_interactions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Add triggers for updating timestamps
CREATE TRIGGER update_user_event_feedback_updated_at
BEFORE UPDATE ON public.user_event_feedback
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_user_event_feedback_user_id ON public.user_event_feedback(user_id);
CREATE INDEX idx_user_event_feedback_event_id ON public.user_event_feedback(event_id);
CREATE INDEX idx_user_event_interactions_user_id ON public.user_event_interactions(user_id);
CREATE INDEX idx_user_event_interactions_event_id ON public.user_event_interactions(event_id);