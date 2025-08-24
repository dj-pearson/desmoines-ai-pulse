-- Fix security warnings by adding search_path to functions

-- Function to calculate user reputation level based on points
CREATE OR REPLACE FUNCTION public.calculate_reputation_level(points INTEGER)
RETURNS public.reputation_level
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    CASE 
        WHEN points >= 10000 THEN RETURN 'platinum';
        WHEN points >= 5000 THEN RETURN 'gold';
        WHEN points >= 1000 THEN RETURN 'silver';
        WHEN points >= 100 THEN RETURN 'bronze';
        ELSE RETURN 'new';
    END CASE;
END;
$$;

-- Function to get user reputation weight for rating calculations
CREATE OR REPLACE FUNCTION public.get_user_reputation_weight(user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    user_level public.reputation_level;
    weight NUMERIC DEFAULT 1.0;
BEGIN
    SELECT level INTO user_level
    FROM public.user_reputation
    WHERE user_reputation.user_id = get_user_reputation_weight.user_id;
    
    -- If no reputation record exists, return base weight
    IF user_level IS NULL THEN
        RETURN 1.0;
    END IF;
    
    -- Assign weights based on reputation level
    CASE user_level
        WHEN 'new' THEN weight := 0.8;
        WHEN 'bronze' THEN weight := 1.0;
        WHEN 'silver' THEN weight := 1.2;
        WHEN 'gold' THEN weight := 1.5;
        WHEN 'platinum' THEN weight := 2.0;
        WHEN 'moderator' THEN weight := 2.5;
        WHEN 'admin' THEN weight := 3.0;
        ELSE weight := 1.0;
    END CASE;
    
    RETURN weight;
END;
$$;

-- Function to update rating aggregates
CREATE OR REPLACE FUNCTION public.update_content_rating_aggregate(
    p_content_type public.content_type,
    p_content_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_avg_rating NUMERIC;
    v_weighted_avg NUMERIC;
    v_total_ratings INTEGER;
    v_distribution JSONB;
    rating_record RECORD;
    weight NUMERIC;
BEGIN
    -- Calculate basic average
    SELECT 
        AVG(rating::INTEGER),
        COUNT(*)
    INTO v_avg_rating, v_total_ratings
    FROM public.user_ratings
    WHERE content_type = p_content_type 
    AND content_id = p_content_id;
    
    -- Calculate weighted average
    SELECT 
        SUM(rating::INTEGER * public.get_user_reputation_weight(user_id)) / 
        SUM(public.get_user_reputation_weight(user_id))
    INTO v_weighted_avg
    FROM public.user_ratings
    WHERE content_type = p_content_type 
    AND content_id = p_content_id;
    
    -- Calculate rating distribution
    SELECT jsonb_object_agg(rating_value, rating_count)
    INTO v_distribution
    FROM (
        SELECT 
            rating as rating_value,
            COUNT(*) as rating_count
        FROM public.user_ratings
        WHERE content_type = p_content_type 
        AND content_id = p_content_id
        GROUP BY rating
        
        UNION ALL
        
        SELECT unnest(ARRAY['1','2','3','4','5']) as rating_value, 0 as rating_count
    ) sub
    GROUP BY rating_value;
    
    -- Upsert the aggregate record
    INSERT INTO public.content_rating_aggregates (
        content_type, 
        content_id, 
        average_rating, 
        total_ratings,
        weighted_average,
        rating_distribution,
        last_updated
    )
    VALUES (
        p_content_type,
        p_content_id,
        COALESCE(v_avg_rating, 0),
        COALESCE(v_total_ratings, 0),
        COALESCE(v_weighted_avg, 0),
        COALESCE(v_distribution, '{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}'),
        now()
    )
    ON CONFLICT (content_type, content_id)
    DO UPDATE SET
        average_rating = COALESCE(v_avg_rating, 0),
        total_ratings = COALESCE(v_total_ratings, 0),
        weighted_average = COALESCE(v_weighted_avg, 0),
        rating_distribution = COALESCE(v_distribution, '{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}'),
        last_updated = now();
END;
$$;

-- Function to update user reputation
CREATE OR REPLACE FUNCTION public.update_user_reputation(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_total_ratings INTEGER;
    v_helpful_votes INTEGER;
    v_points INTEGER;
    v_new_level public.reputation_level;
BEGIN
    -- Count user's ratings
    SELECT COUNT(*) INTO v_total_ratings
    FROM public.user_ratings
    WHERE user_id = p_user_id;
    
    -- Count helpful votes received
    SELECT COUNT(*) INTO v_helpful_votes
    FROM public.rating_helpful_votes rhv
    JOIN public.user_ratings ur ON rhv.rating_id = ur.id
    WHERE ur.user_id = p_user_id AND rhv.is_helpful = true;
    
    -- Calculate points (ratings worth 10 points, helpful votes worth 5 points)
    v_points := (v_total_ratings * 10) + (v_helpful_votes * 5);
    
    -- Calculate new level
    v_new_level := public.calculate_reputation_level(v_points);
    
    -- Upsert reputation record
    INSERT INTO public.user_reputation (
        user_id, 
        points, 
        level, 
        total_ratings, 
        helpful_votes,
        updated_at
    )
    VALUES (
        p_user_id,
        v_points,
        v_new_level,
        v_total_ratings,
        v_helpful_votes,
        now()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
        points = v_points,
        level = v_new_level,
        total_ratings = v_total_ratings,
        helpful_votes = v_helpful_votes,
        updated_at = now();
END;
$$;

-- Trigger to update aggregates when ratings change
CREATE OR REPLACE FUNCTION public.trigger_update_rating_aggregate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Handle insert/update
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        PERFORM public.update_content_rating_aggregate(NEW.content_type, NEW.content_id);
        PERFORM public.update_user_reputation(NEW.user_id);
        RETURN NEW;
    END IF;
    
    -- Handle delete
    IF TG_OP = 'DELETE' THEN
        PERFORM public.update_content_rating_aggregate(OLD.content_type, OLD.content_id);
        PERFORM public.update_user_reputation(OLD.user_id);
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$;

-- Trigger to update reputation when helpful votes change
CREATE OR REPLACE FUNCTION public.trigger_update_helpful_votes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rating_user_id UUID;
BEGIN
    -- Get the user_id of the rating owner
    SELECT user_id INTO v_rating_user_id
    FROM public.user_ratings
    WHERE id = COALESCE(NEW.rating_id, OLD.rating_id);
    
    -- Update their reputation
    IF v_rating_user_id IS NOT NULL THEN
        PERFORM public.update_user_reputation(v_rating_user_id);
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;