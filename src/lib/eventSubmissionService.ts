import { supabase } from '@/integrations/supabase/client';
import { Event } from '@/lib/types';
import { createLogger } from '@/lib/logger';
import { safeStorage } from '@/lib/safeStorage';

const logger = createLogger('EventSubmissionService');

interface EventSubmissionData {
  event: Event;
  platforms: string[];
  submissionType: 'new' | 'updated' | 'test';
  timestamp: string;
  source: string;
}

class EventSubmissionService {
  private static instance: EventSubmissionService;
  private webhookUrl: string | null = null;
  private enabledPlatforms: string[] = [];
  private autoSubmitEnabled: boolean = false;

  private constructor() {
    this.loadConfiguration();
  }

  public static getInstance(): EventSubmissionService {
    if (!EventSubmissionService.instance) {
      EventSubmissionService.instance = new EventSubmissionService();
    }
    return EventSubmissionService.instance;
  }

  private loadConfiguration() {
    const config = safeStorage.getItem('eventSubmissionConfig');
    if (config) {
      const parsed = JSON.parse(config);
      this.webhookUrl = parsed.masterWebhook || null;
      this.autoSubmitEnabled = parsed.autoSubmit || false;
      this.enabledPlatforms = parsed.platforms
        ?.filter((p: any) => p.enabled)
        ?.map((p: any) => p.id) || [];
    }
  }

  public async submitEvent(event: Event, submissionType: 'new' | 'updated' | 'test' = 'new') {
    this.loadConfiguration(); // Refresh config

    if (!this.autoSubmitEnabled && submissionType !== 'test') {
      logger.debug('submitEvent', 'Auto-submission disabled, skipping event submission');
      return;
    }

    if (!this.webhookUrl && this.enabledPlatforms.length === 0) {
      logger.debug('submitEvent', 'No submission methods configured');
      return;
    }

    const submissionData: EventSubmissionData = {
      event: {
        ...event,
        // Ensure all required fields are present for submission
        title: event.title,
        enhanced_description: event.enhanced_description || event.original_description || event.title,
        original_description: event.original_description || event.title,
        location: event.location || 'Des Moines, IA',
        date: typeof event.date === 'string' ? event.date : event.date.toISOString(),
        category: event.category || 'General',
        venue: event.venue || undefined,
        price: event.price || undefined,
        image_url: event.image_url || undefined,
        source_url: event.source_url || undefined
      },
      platforms: this.enabledPlatforms,
      submissionType,
      timestamp: new Date().toISOString(),
      source: 'des-moines-insider'
    };

    try {
      // Submit to master webhook if configured
      if (this.webhookUrl) {
        await this.submitToWebhook(this.webhookUrl, submissionData);
        logger.info('submitEvent', 'Event submitted to master webhook');
      }

      // Submit to individual platform webhooks
      await this.submitToIndividualPlatforms(submissionData);

      // Log submission to analytics if not a test
      if (submissionType !== 'test') {
        await this.logSubmission(event.id, this.enabledPlatforms);
      }

      logger.info('submitEvent', `Event ${submissionType} submitted to ${this.enabledPlatforms.length} platforms`);
    } catch (error) {
      logger.error('submitEvent', 'Event submission error', { error: String(error) });
      throw error;
    }
  }

  private async submitToWebhook(url: string, data: EventSubmissionData) {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      mode: 'no-cors',
      body: JSON.stringify(data)
    });

    // Note: With no-cors mode, we can't check response status
    // The webhook will need to handle any errors internally
  }

  private async submitToIndividualPlatforms(data: EventSubmissionData) {
    const config = safeStorage.getItem('eventSubmissionConfig');
    if (!config) return;

    const parsed = JSON.parse(config);
    const platforms = parsed.platforms || [];

    for (const platform of platforms) {
      if (platform.enabled && platform.webhookUrl) {
        try {
          await this.submitToWebhook(platform.webhookUrl, {
            ...data,
            platforms: [platform.id]
          });
        } catch (error) {
          logger.error('submitToIndividualPlatforms', `Failed to submit to ${platform.name}`, { error: String(error) });
        }
      }
    }
  }

  private async logSubmission(eventId: string, platforms: string[]) {
    try {
      await supabase
        .from('content_metrics')
        .insert({
          content_type: 'event',
          content_id: eventId,
          metric_type: 'submission',
          metric_value: platforms.length,
          date: new Date().toISOString().split('T')[0]
        });
    } catch (error) {
      logger.error('logSubmission', 'Failed to log submission', { error: String(error) });
    }
  }

  public async generateRSSFeed(): Promise<string> {
    try {
      const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .limit(50);

      if (error) throw error;

      return this.buildRSSXML((events || []) as unknown as Event[]);
    } catch (error) {
      logger.error('generateRSSFeed', 'RSS feed generation error', { error: String(error) });
      throw error;
    }
  }

  private buildRSSXML(events: Event[]): string {
    const baseUrl = window.location.origin;
    // Feed URL: `${baseUrl}/api/events/feed.xml`
    
    const rssItems = events.map(event => {
      const eventUrl = `${baseUrl}/events/${this.createEventSlug(event.title, event)}`;
      const pubDate = new Date(event.created_at || event.date).toUTCString();
      
      return `
        <item>
          <title><![CDATA[${event.title}]]></title>
          <description><![CDATA[${event.enhanced_description || event.original_description || event.title}]]></description>
          <link>${eventUrl}</link>
          <guid isPermaLink="true">${eventUrl}</guid>
          <pubDate>${pubDate}</pubDate>
          <category><![CDATA[${event.category}]]></category>
          ${event.image_url ? `<enclosure url="${event.image_url}" type="image/jpeg" />` : ''}
          <event:start_date>${typeof event.date === 'string' ? event.date : event.date.toISOString()}</event:start_date>
          <event:location><![CDATA[${event.location}]]></event:location>
          ${event.venue ? `<event:venue><![CDATA[${event.venue}]]></event:venue>` : ''}
          ${event.price ? `<event:price><![CDATA[${event.price}]]></event:price>` : ''}
        </item>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:event="http://www.eventbrite.com/rss/event/1.0/"
     xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#">
  <channel>
    <title>Des Moines Insider Events</title>
    <link>${baseUrl}</link>
    <description>Upcoming events in Des Moines, Iowa - concerts, festivals, community gatherings and entertainment</description>
    <language>en-us</language>
    <copyright>© ${new Date().getFullYear()} Des Moines Insider</copyright>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <ttl>60</ttl>
    <image>
      <url>${baseUrl}/DMI-Logo.png</url>
      <title>Des Moines Insider Events</title>
      <link>${baseUrl}</link>
    </image>
    ${rssItems}
  </channel>
</rss>`;
  }

  private createEventSlug(title: string, event: Event): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    
    const date = typeof event.date === 'string' ? new Date(event.date) : event.date;
    const dateStr = date.toISOString().split('T')[0];
    
    return `${slug}-${dateStr}`;
  }
}

export default EventSubmissionService;