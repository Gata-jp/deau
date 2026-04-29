export default function HomePage() {
  return (
    <main>
      <h1>deau API starter</h1>
      <p>Phase 1 backend endpoints are ready.</p>
      <ul>
        <li>POST /api/availabilities</li>
        <li>POST /api/matches/run</li>
        <li>POST /api/matches/[id]/confirm</li>
        <li>POST /api/matches/[id]/checkin</li>
        <li>POST /api/matches/[id]/cancel</li>
        <li>GET/POST /api/matches/[id]/messages</li>
        <li>GET /api/stations/search?q=...</li>
      </ul>
    </main>
  );
}
