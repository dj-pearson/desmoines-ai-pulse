/**
 * Routes /events/:segment to either MonthlyEventsPage (month-year format)
 * or EventDetails (event slug). Prevents Soft 404 when month-year URLs
 * (e.g. /events/march-2026) were incorrectly showing "Event Not Found".
 */
import { useParams } from "react-router-dom";
import EventDetails from "@/pages/EventDetails";
import MonthlyEventsPage from "@/pages/MonthlyEventsPage";

const MONTH_YEAR_PATTERN = /^(january|february|march|april|may|june|july|august|september|october|november|december)-\d{4}$/i;

export default function EventsSegmentHandler() {
  const { slug } = useParams<{ slug: string }>();
  const isMonthYear = slug ? MONTH_YEAR_PATTERN.test(slug) : false;

  if (isMonthYear) {
    return <MonthlyEventsPage />;
  }
  return <EventDetails />;
}
