-- Fix infinite recursion in friend_group_members RLS policy
-- Create security definer function to check group membership safely
CREATE OR REPLACE FUNCTION public.user_can_access_group(p_user_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is a member of the group
  RETURN EXISTS (
    SELECT 1 FROM public.friend_group_members 
    WHERE user_id = p_user_id AND group_id = p_group_id
  );
END;
$$;

-- Drop existing problematic policy
DROP POLICY IF EXISTS "Users can view group members if they are members" ON public.friend_group_members;

-- Create new safe policy using security definer function
CREATE POLICY "Users can view group members if they are members" 
ON public.friend_group_members 
FOR SELECT 
USING (
  auth.uid() = user_id OR 
  public.user_can_access_group(auth.uid(), group_id)
);

-- Fix search path issues in existing functions by updating critical ones (wrapped for safety)
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION public.user_has_role_or_higher(p_user_id uuid, p_min_role user_role)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $func$
  DECLARE
    user_role_enum user_role;
    role_hierarchy INTEGER;
    min_role_hierarchy INTEGER;
  BEGIN
    -- Get user's role from user_roles table first, then profiles as fallback
    SELECT role INTO user_role_enum
    FROM public.user_roles 
    WHERE user_id = p_user_id 
    ORDER BY 
      CASE role
        WHEN 'root_admin' THEN 5
        WHEN 'admin' THEN 4  
        WHEN 'moderator' THEN 3
        WHEN 'user' THEN 2
        ELSE 1
      END DESC
    LIMIT 1;
    
    -- Fallback to profiles table if no role found in user_roles
    IF user_role_enum IS NULL THEN
      SELECT user_role INTO user_role_enum
      FROM public.profiles
      WHERE user_id = p_user_id;
    END IF;
    
    -- Default to 'user' if still no role found
    IF user_role_enum IS NULL THEN
      user_role_enum := 'user';
    END IF;
    
    -- Convert roles to hierarchy numbers for comparison
    role_hierarchy := CASE user_role_enum
      WHEN 'root_admin' THEN 5
      WHEN 'admin' THEN 4
      WHEN 'moderator' THEN 3
      WHEN 'user' THEN 2
      ELSE 1
    END;
    
    min_role_hierarchy := CASE p_min_role
      WHEN 'root_admin' THEN 5
      WHEN 'admin' THEN 4
      WHEN 'moderator' THEN 3
      WHEN 'user' THEN 2
      ELSE 1
    END;
    
    RETURN role_hierarchy >= min_role_hierarchy;
  END;
  $func$;
EXCEPTION
  WHEN undefined_object OR undefined_table THEN
    -- user_role type or tables don't exist, skip
    NULL;
END $$;

-- Update other critical functions with proper search paths (wrapped for safety)
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION public.update_user_reputation(p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $func$
  DECLARE
      total_helpful_votes INTEGER := 0;
      total_ratings_given INTEGER := 0;
      avg_rating_given NUMERIC := 0;
      reputation_points INTEGER := 0;
      calculated_level public.reputation_level;
  BEGIN
      -- Calculate helpful votes received on user's ratings
      SELECT COALESCE(SUM(
          CASE WHEN chv.is_helpful THEN 2 ELSE -1 END
      ), 0) INTO total_helpful_votes
      FROM public.user_ratings ur
      JOIN public.content_helpful_votes chv ON chv.rating_id = ur.id
      WHERE ur.user_id = p_user_id;
      
      -- Calculate total ratings given and average
      SELECT 
          COUNT(*),
          COALESCE(AVG(rating::INTEGER), 0)
      INTO total_ratings_given, avg_rating_given
      FROM public.user_ratings
      WHERE user_id = p_user_id;
      
      -- Calculate reputation points
      reputation_points := 
          (total_helpful_votes * 5) +           -- 5 points per helpful vote
          (total_ratings_given * 2) +           -- 2 points per rating given
          CASE 
              WHEN avg_rating_given >= 4 THEN 50  -- Bonus for high-quality ratings
              WHEN avg_rating_given >= 3 THEN 25
              ELSE 0
          END;
      
      -- Calculate level
      calculated_level := public.calculate_reputation_level(reputation_points);
      
      -- Upsert reputation record
      INSERT INTO public.user_reputation (
          user_id, 
          reputation_points, 
          level, 
          helpful_votes_received,
          total_ratings_given,
          average_rating_given,
          updated_at
      )
      VALUES (
          p_user_id,
          reputation_points,
          calculated_level,
          total_helpful_votes,
          total_ratings_given,
          avg_rating_given,
          now()
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
          reputation_points = reputation_points,
          level = calculated_level,
          helpful_votes_received = total_helpful_votes,
          total_ratings_given = total_ratings_given,
          average_rating_given = avg_rating_given,
          updated_at = now();
  END;
  $func$;
EXCEPTION
  WHEN undefined_object OR undefined_table THEN
    -- reputation_level type or tables don't exist, skip
    NULL;
END $$;