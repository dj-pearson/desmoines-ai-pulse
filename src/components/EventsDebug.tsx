import { useEvents } from "@/hooks/useEvents";

export default function EventsDebug() {
  const { events, isLoading } = useEvents();

  if (isLoading) return <div>Loading events...</div>;

  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h3 className="font-bold mb-4">Events Debug Info</h3>
      <p>Total events: {events.length}</p>

      {events.slice(0, 3).map((event, index) => (
        <div key={event.id} className="mb-4 p-2 bg-white rounded">
          <h4 className="font-semibold">{event.title}</h4>
          <p>Has ai_writeup: {event.ai_writeup ? "YES" : "NO"}</p>
          {event.ai_writeup && (
            <p>Writeup length: {event.ai_writeup.length} chars</p>
          )}
          <p>Generated at: {event.writeup_generated_at || "Not generated"}</p>
        </div>
      ))}
    </div>
  );
}
