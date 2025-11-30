#!/usr/bin/env python3
"""
CatchDesMoines Event Crawler
============================

A robust, automated crawler for extracting events from catchdesmoines.com
using Crawl4AI and Claude 4.5 Sonnet for intelligent content extraction.

Features:
- Crawls event listing pages with pagination
- Extracts individual event details including "Visit Website" URLs
- Deduplicates against existing database entries
- Inserts new events into Supabase

Usage:
    python catchdesmoines_crawler.py [--dry-run] [--max-pages N]
"""

import asyncio
import json
import logging
import os
import re
import sys
from datetime import datetime, timedelta
from typing import Optional
from dateutil import parser as date_parser
from zoneinfo import ZoneInfo

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Import Crawl4AI
try:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
except ImportError:
    logger.error("Crawl4AI not installed. Run: pip install crawl4ai")
    sys.exit(1)

# Import Anthropic
try:
    import anthropic
except ImportError:
    logger.error("Anthropic not installed. Run: pip install anthropic")
    sys.exit(1)

# Import Supabase
try:
    from supabase import create_client, Client
except ImportError:
    logger.error("Supabase not installed. Run: pip install supabase")
    sys.exit(1)

# Configuration
CATCHDESMOINES_BASE_URL = "https://www.catchdesmoines.com"
EVENTS_LIST_URL = f"{CATCHDESMOINES_BASE_URL}/events/"
CENTRAL_TZ = ZoneInfo("America/Chicago")

# Claude 4.5 Sonnet model
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"


class CatchDesMoinesCrawler:
    """Crawler for catchdesmoines.com events."""

    def __init__(self, dry_run: bool = False, max_pages: int = 5):
        self.dry_run = dry_run
        self.max_pages = max_pages
        self.supabase: Optional[Client] = None
        self.anthropic_client: Optional[anthropic.Anthropic] = None
        self.events_found: list = []
        self.events_inserted: int = 0
        self.duplicates_skipped: int = 0

    def _init_clients(self):
        """Initialize Supabase and Anthropic clients."""
        # Get environment variables
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_API")

        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

        if not anthropic_key:
            raise ValueError("ANTHROPIC_API_KEY or CLAUDE_API must be set")

        self.supabase = create_client(supabase_url, supabase_key)
        self.anthropic_client = anthropic.Anthropic(api_key=anthropic_key)
        logger.info("Initialized Supabase and Anthropic clients")

    async def crawl_events_list(self, page: int = 0) -> str:
        """Crawl the events listing page."""
        url = EVENTS_LIST_URL
        if page > 0:
            url = f"{EVENTS_LIST_URL}?skip={page * 12}&bounds=false&view=grid&sort=date"

        logger.info(f"Crawling events list page {page + 1}: {url}")

        browser_config = BrowserConfig(
            headless=True,
            verbose=False,
        )

        crawler_config = CrawlerRunConfig(
            wait_until="networkidle",
            page_timeout=30000,
        )

        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url, config=crawler_config)

            if not result.success:
                logger.error(f"Failed to crawl {url}: {result.error}")
                return ""

            logger.info(f"Crawled {len(result.html)} characters from events list")
            return result.html

    async def crawl_event_detail(self, event_url: str) -> dict:
        """Crawl an individual event detail page to get the 'Visit Website' URL."""
        logger.info(f"Crawling event detail: {event_url}")

        browser_config = BrowserConfig(
            headless=True,
            verbose=False,
        )

        crawler_config = CrawlerRunConfig(
            wait_until="networkidle",
            page_timeout=20000,
        )

        try:
            async with AsyncWebCrawler(config=browser_config) as crawler:
                result = await crawler.arun(event_url, config=crawler_config)

                if not result.success:
                    logger.warning(f"Failed to crawl event detail {event_url}: {result.error}")
                    return {"source_url": event_url}

                html = result.html

                # Extract "Visit Website" URL using multiple patterns
                visit_website_url = self._extract_visit_website_url(html, event_url)

                return {
                    "source_url": visit_website_url or event_url,
                    "html": html
                }
        except Exception as e:
            logger.error(f"Error crawling event detail {event_url}: {e}")
            return {"source_url": event_url}

    def _extract_visit_website_url(self, html: str, fallback_url: str) -> Optional[str]:
        """Extract the 'Visit Website' URL from event detail HTML."""
        # Patterns to find the "Visit Website" link
        patterns = [
            # Pattern 1: action-item class with Visit Website text
            r'<a[^>]*href=["\']([^"\']+)["\'][^>]*class=["\'][^"\']*action-item[^"\']*["\'][^>]*>.*?Visit Website.*?</a>',
            # Pattern 2: Reverse order
            r'<a[^>]*class=["\'][^"\']*action-item[^"\']*["\'][^>]*href=["\']([^"\']+)["\'][^>]*>.*?Visit Website.*?</a>',
            # Pattern 3: Any link with Visit Website text
            r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>\s*(?:<[^>]*>)*\s*Visit\s+Website\s*(?:</[^>]*>)*\s*</a>',
            # Pattern 4: linkUrl in JSON data
            r'["\']linkUrl["\']\s*:\s*["\'](https?://[^"\']+)["\']',
        ]

        # Domains to exclude
        excluded_domains = [
            "catchdesmoines.com", "simpleview", "facebook.com", "twitter.com",
            "instagram.com", "youtube.com", "vimeo.com", "google.com",
            "googleapis.com", "cloudflare", "doubleclick"
        ]

        for pattern in patterns:
            matches = re.findall(pattern, html, re.IGNORECASE | re.DOTALL)
            for match in matches:
                url = match.strip()

                # Convert relative URLs to absolute
                if url.startswith("/"):
                    url = f"{CATCHDESMOINES_BASE_URL}{url}"
                elif url.startswith("//"):
                    url = f"https:{url}"

                # Validate URL
                if not url.startswith("http"):
                    continue

                # Check if domain is excluded
                if any(domain in url.lower() for domain in excluded_domains):
                    continue

                logger.info(f"Found Visit Website URL: {url}")
                return url

        logger.warning(f"No Visit Website URL found, using fallback: {fallback_url}")
        return None

    async def extract_events_with_claude(self, html: str, page_url: str) -> list:
        """Use Claude 4.5 Sonnet to extract events from HTML."""
        logger.info(f"Extracting events from {page_url} using Claude {CLAUDE_MODEL}")

        # Clean HTML for Claude (limit size)
        clean_html = re.sub(r'<script[^>]*>[\s\S]*?</script>', '', html, flags=re.IGNORECASE)
        clean_html = re.sub(r'<style[^>]*>[\s\S]*?</style>', '', clean_html, flags=re.IGNORECASE)
        clean_html = clean_html[:50000]  # Limit to 50k chars

        today = datetime.now(CENTRAL_TZ).strftime("%Y-%m-%d")

        prompt = f"""You are an expert at extracting event information from CatchDesMoines.com.
Your task is to find EVERY EVENT on this page.

CURRENT DATE: {today}
WEBSITE CONTENT:
{clean_html}

CRITICAL EXTRACTION RULES:

1. FIND ALL EVENTS - Look for:
   - Event titles/names
   - Event cards, articles, list items
   - Links to event detail pages (format: /event/event-name/12345/)

2. DATE FORMAT - All dates must be in Central Time:
   - Format: YYYY-MM-DD HH:MM:SS
   - Default to 19:00:00 (7 PM) if no time specified
   - Only include FUTURE events (on or after {today})

3. EXTRACT the event detail URL path (e.g., /event/chef-georges-steak-bar/53924/)
   - This is CRITICAL for fetching the actual source URL later

For EACH event, extract:
- title: Event name
- description: Brief description
- date: YYYY-MM-DD HH:MM:SS (Central Time)
- location: City/venue (default: "Des Moines, IA")
- venue: Specific venue name
- category: Music/Sports/Arts/Community/Entertainment/Festival/Food
- price: Price or "See website"
- detail_url: The event detail page path (e.g., /event/event-name/12345/)

FORMAT AS JSON ARRAY ONLY:
[
  {{
    "title": "Event Name",
    "description": "Event details",
    "date": "2025-MM-DD HH:MM:SS",
    "location": "Des Moines, IA",
    "venue": "Venue Name",
    "category": "Category",
    "price": "Price",
    "detail_url": "/event/event-name/12345/"
  }}
]

Return ONLY the JSON array. No other text."""

        try:
            message = self.anthropic_client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=8000,
                temperature=0.1,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )

            response_text = message.content[0].text.strip()

            # Extract JSON array from response
            json_match = re.search(r'\[[\s\S]*\]', response_text)
            if not json_match:
                logger.error(f"No JSON array found in Claude response")
                return []

            events = json.loads(json_match.group())

            if not isinstance(events, list):
                logger.error(f"Parsed data is not a list: {type(events)}")
                return []

            logger.info(f"Claude extracted {len(events)} events")
            return events

        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error: {e}")
            return []
        except Exception as e:
            logger.error(f"Claude API error: {e}")
            return []

    def _parse_event_datetime(self, date_str: str) -> Optional[datetime]:
        """Parse event datetime string to UTC datetime."""
        if not date_str:
            return None

        try:
            # Parse the datetime
            if re.match(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$', date_str):
                dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
            elif re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
                dt = datetime.strptime(date_str, "%Y-%m-%d")
                dt = dt.replace(hour=19, minute=0, second=0)  # Default 7 PM
            else:
                dt = date_parser.parse(date_str)

            # Assume Central Time and convert to UTC
            dt_central = dt.replace(tzinfo=CENTRAL_TZ)
            dt_utc = dt_central.astimezone(ZoneInfo("UTC"))

            return dt_utc

        except Exception as e:
            logger.warning(f"Could not parse date '{date_str}': {e}")
            return None

    async def _check_duplicate(self, event: dict) -> bool:
        """Check if event already exists in database."""
        if self.dry_run or not self.supabase:
            return False

        try:
            # Query for existing event with same title and venue
            result = self.supabase.table("events").select("id").ilike(
                "title", event.get("title", "").strip()
            ).ilike(
                "venue", event.get("venue", "").strip()
            ).execute()

            return len(result.data) > 0

        except Exception as e:
            logger.warning(f"Error checking duplicate: {e}")
            return False

    async def _insert_event(self, event: dict) -> bool:
        """Insert event into Supabase."""
        if self.dry_run:
            logger.info(f"[DRY RUN] Would insert: {event.get('title')}")
            return True

        if not self.supabase:
            logger.error("Supabase client not initialized")
            return False

        try:
            # Parse datetime
            parsed_dt = self._parse_event_datetime(event.get("date", ""))
            if not parsed_dt:
                logger.warning(f"Skipping event with invalid date: {event.get('title')}")
                return False

            # Skip past events
            if parsed_dt < datetime.now(ZoneInfo("UTC")):
                logger.info(f"Skipping past event: {event.get('title')}")
                return False

            # Build event record
            now = datetime.now(ZoneInfo("UTC")).isoformat()
            event_record = {
                "title": event.get("title", "Untitled Event")[:200],
                "original_description": event.get("description", "")[:500],
                "enhanced_description": event.get("description", "")[:500],
                "date": parsed_dt.isoformat(),
                "event_start_local": event.get("date", ""),
                "event_timezone": "America/Chicago",
                "event_start_utc": parsed_dt.isoformat(),
                "location": event.get("location", "Des Moines, IA")[:100],
                "venue": event.get("venue", event.get("location", "TBD"))[:100],
                "category": event.get("category", "General")[:50],
                "price": event.get("price", "See website")[:50],
                "source_url": event.get("source_url", ""),
                "is_featured": False,
                "is_enhanced": False,
                "created_at": now,
                "updated_at": now,
            }

            result = self.supabase.table("events").insert(event_record).execute()

            if result.data:
                logger.info(f"Inserted event: {event.get('title')}")
                return True
            else:
                logger.error(f"Failed to insert event: {event.get('title')}")
                return False

        except Exception as e:
            logger.error(f"Error inserting event '{event.get('title')}': {e}")
            return False

    async def run(self):
        """Run the crawler."""
        logger.info("=" * 60)
        logger.info("CatchDesMoines Event Crawler")
        logger.info(f"Dry Run: {self.dry_run}")
        logger.info(f"Max Pages: {self.max_pages}")
        logger.info("=" * 60)

        # Initialize clients
        self._init_clients()

        all_events = []

        # Crawl event listing pages
        for page in range(self.max_pages):
            html = await self.crawl_events_list(page)

            if not html:
                logger.warning(f"No HTML returned for page {page + 1}")
                if page == 0:
                    logger.error("First page failed, aborting")
                    return
                break

            # Extract events using Claude
            events = await self.extract_events_with_claude(html, f"{EVENTS_LIST_URL}?page={page}")

            if not events:
                logger.info(f"No more events found on page {page + 1}")
                break

            all_events.extend(events)
            logger.info(f"Total events found so far: {len(all_events)}")

            # Small delay between pages
            if page < self.max_pages - 1:
                await asyncio.sleep(2)

        logger.info(f"Extracted {len(all_events)} total events from {self.max_pages} pages")

        # Process each event
        for i, event in enumerate(all_events):
            logger.info(f"Processing event {i + 1}/{len(all_events)}: {event.get('title')}")

            # Check for duplicates
            is_duplicate = await self._check_duplicate(event)
            if is_duplicate:
                logger.info(f"Skipping duplicate: {event.get('title')}")
                self.duplicates_skipped += 1
                continue

            # Get source URL from event detail page
            detail_url = event.get("detail_url")
            if detail_url and not detail_url.startswith("http"):
                detail_url = f"{CATCHDESMOINES_BASE_URL}{detail_url}"

            if detail_url:
                detail_result = await self.crawl_event_detail(detail_url)
                event["source_url"] = detail_result.get("source_url", detail_url)

                # Small delay between detail page requests
                await asyncio.sleep(1)
            else:
                event["source_url"] = EVENTS_LIST_URL

            # Insert event
            success = await self._insert_event(event)
            if success:
                self.events_inserted += 1
                self.events_found.append(event)

        # Summary
        logger.info("=" * 60)
        logger.info("CRAWL SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Total events extracted: {len(all_events)}")
        logger.info(f"Events inserted: {self.events_inserted}")
        logger.info(f"Duplicates skipped: {self.duplicates_skipped}")
        logger.info("=" * 60)

        return {
            "total_found": len(all_events),
            "inserted": self.events_inserted,
            "duplicates": self.duplicates_skipped,
        }


async def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="CatchDesMoines Event Crawler")
    parser.add_argument("--dry-run", action="store_true", help="Don't insert into database")
    parser.add_argument("--max-pages", type=int, default=5, help="Maximum pages to crawl")
    args = parser.parse_args()

    # Load environment variables from .env file if present
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    crawler = CatchDesMoinesCrawler(dry_run=args.dry_run, max_pages=args.max_pages)
    result = await crawler.run()

    # Output for GitHub Actions
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"events_found={result['total_found']}\n")
            f.write(f"events_inserted={result['inserted']}\n")
            f.write(f"duplicates_skipped={result['duplicates']}\n")

    return result


if __name__ == "__main__":
    asyncio.run(main())
