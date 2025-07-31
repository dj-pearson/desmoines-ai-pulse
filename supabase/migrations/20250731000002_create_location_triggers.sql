
create trigger on_restaurant_location_change
  before insert or update of location on public.restaurants
  for each row execute procedure public.update_coordinates();

create trigger on_event_location_change
  before insert or update of location on public.events
  for each row execute procedure public.update_coordinates();

create trigger on_attraction_location_change
  before insert or update of location on public.attractions
  for each row execute procedure public.update_coordinates();

create trigger on_playground_location_change
  before insert or update of location on public.playgrounds
  for each row execute procedure public.update_coordinates();
