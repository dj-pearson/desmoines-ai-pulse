-- US-046: Teams table for sports hub
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  sport TEXT NOT NULL,
  league TEXT NOT NULL,
  venue_name TEXT,
  venue_id UUID REFERENCES public.venues(id),
  logo_url TEXT,
  website TEXT,
  schedule_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Admin insert" ON public.teams FOR INSERT WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "Admin update" ON public.teams FOR UPDATE USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Indexes
CREATE INDEX idx_teams_slug ON public.teams(slug);
CREATE INDEX idx_teams_sport ON public.teams(sport);

-- Seed Des Moines teams
INSERT INTO public.teams (name, slug, sport, league, venue_name, description, website) VALUES
('Iowa Cubs', 'iowa-cubs', 'Baseball', 'Triple-A (MiLB)', 'Principal Park', 'The Triple-A affiliate of the Chicago Cubs, playing at the beautiful Principal Park along the Des Moines River since 1992.', 'https://www.milb.com/iowa'),
('Iowa Wild', 'iowa-wild', 'Hockey', 'AHL', 'Wells Fargo Arena', 'The AHL affiliate of the Minnesota Wild, bringing fast-paced professional hockey to Des Moines.', 'https://www.iowawild.com'),
('Iowa Wolves', 'iowa-wolves', 'Basketball', 'NBA G League', 'Wells Fargo Arena', 'The NBA G League affiliate of the Minnesota Timberwolves, showcasing future NBA talent in Des Moines.', 'https://iowa.gleague.nba.com'),
('Iowa Barnstormers', 'iowa-barnstormers', 'Arena Football', 'IFL', 'Wells Fargo Arena', 'Indoor football excitement at Wells Fargo Arena — high-scoring, fast-paced action right in downtown Des Moines.', 'https://www.theiowabarnstormers.com'),
('Des Moines Menace', 'des-moines-menace', 'Soccer', 'USL League Two', 'Valley Stadium', 'Des Moines'' premier soccer club competing in USL League Two, with a passionate fanbase and electric match-day atmosphere.', 'https://www.menacesoccer.com'),
('Drake Bulldogs', 'drake-bulldogs', 'Multi-Sport', 'NCAA Division I (MVC)', 'Drake Stadium / Knapp Center', 'Drake University''s Division I athletics program, famous for hosting the Drake Relays — America''s Athletic Classic since 1910.', 'https://www.godrakebulldogs.com'),
('Grand View Vikings', 'grand-view-vikings', 'Multi-Sport', 'NAIA (Heart)', 'Grand View Campus', 'Grand View University''s nationally competitive NAIA athletics program in Des Moines, with strong wrestling and football programs.', 'https://www.grandviewvikings.com');
