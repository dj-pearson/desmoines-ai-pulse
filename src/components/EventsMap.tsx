
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Link } from "react-router-dom";
import { createEventSlugWithCentralTime } from "@/lib/timezone";

// Fix for default icon issue with Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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
      {validEvents.map((event) => (
        <Marker
          key={event.id}
          position={[event.latitude!, event.longitude!]}
        >
          <Popup>
            <Link to={`/events/${createEventSlugWithCentralTime(event.title, event.date)}`}>
              {event.title}
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default EventsMap;
