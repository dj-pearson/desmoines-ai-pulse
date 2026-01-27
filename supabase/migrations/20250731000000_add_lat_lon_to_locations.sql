DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurants') THEN
    ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS latitude real, ADD COLUMN IF NOT EXISTS longitude real;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'events') THEN
    ALTER TABLE public.events ADD COLUMN IF NOT EXISTS latitude real, ADD COLUMN IF NOT EXISTS longitude real;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attractions') THEN
    ALTER TABLE public.attractions ADD COLUMN IF NOT EXISTS latitude real, ADD COLUMN IF NOT EXISTS longitude real;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'playgrounds') THEN
    ALTER TABLE public.playgrounds ADD COLUMN IF NOT EXISTS latitude real, ADD COLUMN IF NOT EXISTS longitude real;
  END IF;
END $$;
