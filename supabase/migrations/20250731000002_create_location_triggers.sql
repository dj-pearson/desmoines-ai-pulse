DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurants') THEN
    DROP TRIGGER IF EXISTS on_restaurant_location_change ON public.restaurants;
    CREATE TRIGGER on_restaurant_location_change
      BEFORE INSERT OR UPDATE OF location ON public.restaurants
      FOR EACH ROW EXECUTE PROCEDURE public.update_coordinates();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'events') THEN
    DROP TRIGGER IF EXISTS on_event_location_change ON public.events;
    CREATE TRIGGER on_event_location_change
      BEFORE INSERT OR UPDATE OF location ON public.events
      FOR EACH ROW EXECUTE PROCEDURE public.update_coordinates();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attractions') THEN
    DROP TRIGGER IF EXISTS on_attraction_location_change ON public.attractions;
    CREATE TRIGGER on_attraction_location_change
      BEFORE INSERT OR UPDATE OF location ON public.attractions
      FOR EACH ROW EXECUTE PROCEDURE public.update_coordinates();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'playgrounds') THEN
    DROP TRIGGER IF EXISTS on_playground_location_change ON public.playgrounds;
    CREATE TRIGGER on_playground_location_change
      BEFORE INSERT OR UPDATE OF location ON public.playgrounds
      FOR EACH ROW EXECUTE PROCEDURE public.update_coordinates();
  END IF;
END $$;
