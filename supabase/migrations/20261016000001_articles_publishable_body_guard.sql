-- SEO-058: refuse to publish an article whose body is a raw generator dump or
-- an unfinished draft.
--
-- Fifteen 2025 articles went live with the AI generator's JSON response stored
-- as the body ({"title": ..., "content": "<h1>...", "content_score": ...}), raw
-- HTML that ArticleDetails (react-markdown, no raw-HTML plugin) prints as text,
-- or "[Content continues with ...]" placeholders. Several paths can publish a
-- row: ai-article-pipeline auto-publishes, the admin CMS, the content queue,
-- the scheduler and hand-run SQL. A trigger is the one place all of them pass
-- through, so the check lives here rather than in any one caller.
--
-- Additive: a new function and a new trigger. It never touches stored rows and
-- it only fires when a row is BECOMING published/scheduled, or when the body
-- of a published/scheduled row changes. View-count bumps, SEO edits and
-- archiving a bad row all keep working. Nothing published today trips it
-- (checked against production 2026-10-01 after the SEO-058 rewrites).
--
-- Trigger name sorts after articles_author_publish_guard, so for non-admin
-- writers that guard has already demoted status before this one looks at it.

create or replace function public.article_body_problem(body text)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  b text := btrim(coalesce(body, ''));
begin
  if b = '' then
    return 'empty body';
  end if;

  -- The generator's JSON envelope, with or without a ```json fence.
  if b ~ '^```' or b ~ '^[{\[]' then
    return 'body is a JSON or code-fence dump, not article markdown';
  end if;
  if b ~* '"(content_score|featured_image_suggestions|internal_linking_opportunities|local_schema_suggestions|seo_title|seo_description)"\s*:' then
    return 'body contains generator JSON keys';
  end if;

  -- Raw HTML: react-markdown renders it as literal tags. Markdown bodies may
  -- carry the odd inline tag, so only an HTML-first body or an HTML-structured
  -- one (3+ closing block tags) is refused.
  if b ~* '^<(p|h[1-6]|div|ul|ol|section|article|html|body)[\s>]' then
    return 'body is raw HTML, not markdown';
  end if;
  if (select count(*) from regexp_matches(b, '</(p|h[1-6]|li|ul|ol|div)>', 'gi')) >= 3 then
    return 'body is structured as raw HTML, not markdown';
  end if;

  -- Unfinished-draft placeholders. A markdown link "[text](url)" is not one.
  if b ~* '\[[^]\n]{0,80}(content continues|continues with|continued\.\.\.|additional [a-z ]{0,30}content|to be (added|written|continued)|insert [a-z ]{1,40} here|placeholder)[^]\n]{0,80}\](?!\()' then
    return 'body contains a [placeholder] marker';
  end if;
  if b ~* 'lorem ipsum' then
    return 'body contains lorem ipsum';
  end if;

  return null;
end;
$$;

comment on function public.article_body_problem(text) is
  'SEO-058: returns why an article body is not publishable (JSON dump, raw HTML, placeholder), or null when it is fine.';

create or replace function public.articles_publishable_body_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  problem text;
begin
  if new.status not in ('published', 'scheduled') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status in ('published', 'scheduled')
     and new.content is not distinct from old.content then
    return new;
  end if;

  problem := public.article_body_problem(new.content);
  if problem is not null then
    raise exception 'article_body_not_publishable: %', problem
      using errcode = '23514',
            hint = 'Store the article body as clean markdown before publishing (SEO-058).';
  end if;

  return new;
end;
$$;

drop trigger if exists articles_publishable_body_guard on public.articles;
create trigger articles_publishable_body_guard
  before insert or update on public.articles
  for each row execute function public.articles_publishable_body_guard();
