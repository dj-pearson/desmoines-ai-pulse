import { MapContainer, TileLayer, Marker, Popup, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { formatInCentralTime } from "@/lib/timezone";
import { Link } from "react-router-dom";
import { createEventSlugWithCentralTime } from "@/lib/timezone";

// Helper to get color by event date
function getPinColor(date: string) {
  const today = new Date();
  const eventDate = new Date(date);
  const diffDays = Math.floor(
    (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "red"; // today
  if (diffDays > 0 && diffDays <= 7) return "orange"; // this week
  if (diffDays > 7) return "blue"; // future
  return "gray"; // past
}

function createColoredIcon(color: string) {
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}

interface Event {
  id: string;
  title: string;
  date: string;
  latitude?: number;
  longitude?: number;
}

interface EventsMapProps {
  events: Event[];
}

const EventsMap = ({ events }: EventsMapProps) => {
  const validEvents = events.filter(
    (e) => e.latitude != null && e.longitude != null
  );

  return (
    <MapContainer
      center={[41.5868, -93.625]}
      zoom={12}
      className="h-[600px] w-full rounded-lg"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {validEvents.map((event) => {
        const color = getPinColor(event.date);
        const icon = createColoredIcon(color);
        const dateLabel = formatInCentralTime(event.date, "MM/dd");
        return (
          <Marker
            key={event.id}
            position={[event.latitude!, event.longitude!]}
            icon={icon}
          >
            <Tooltip direction="top" offset={[0, -30]} opacity={1} permanent>
              <span style={{ fontWeight: "bold", color }}>{dateLabel}</span>
            </Tooltip>
            <Popup>
              <Link
                to={`/events/${createEventSlugWithCentralTime(
                  event.title,
                  event
                )}`}
              >
                {event.title}
              </Link>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
};

export default EventsMap;
