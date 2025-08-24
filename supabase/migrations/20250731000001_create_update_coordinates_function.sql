
create or replace function public.update_coordinates()
returns trigger as $$
declare
  v_location text;
  v_response jsonb;
  v_latitude real;
  v_longitude real;
begin
  if (TG_OP = 'INSERT') then
    v_location := NEW.location;
  elsif (TG_OP = 'UPDATE') then
    v_location := NEW.location;
  end if;

  if v_location is not null then
    begin
      select
        content into v_response
      from
        http_post('https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/geocode-location',
          jsonb_build_object('location', v_location),
          'application/json',
          '{}'::jsonb
        );

      v_latitude := (v_response->>'latitude')::real;
      v_longitude := (v_response->>'longitude')::real;

      NEW.latitude := v_latitude;
      NEW.longitude := v_longitude;

    exception when others then
      -- Do nothing, let the insert/update proceed without coordinates
    end;
  end if;

  return NEW;
end;
$$ language plpgsql;
