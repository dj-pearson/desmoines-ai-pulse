-- Fix search path for new gamification functions
CREATE OR REPLACE FUNCTION public.calculate_level_xp(level integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Exponential curve: level 1=100, level 2=250, level 3=450, etc.
  RETURN (level * 100) + ((level - 1) * 50);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_level_from_xp(xp integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  level integer := 1;
  required_xp integer;
BEGIN
  LOOP
    required_xp := public.calculate_level_xp(level);
    IF xp < required_xp THEN
      RETURN level - 1;
    END IF;
    level := level + 1;
    IF level > 100 THEN -- Cap at level 100
      RETURN 100;
    END IF;
  END LOOP;
END;
$$;