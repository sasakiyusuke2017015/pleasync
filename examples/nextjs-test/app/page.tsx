export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 32, lineHeight: 1.6 }}>
      <h1>@pleasync/client integration test</h1>
      <p>
        This Next.js app validates that <code>@pleasync/client</code> can be
        installed via npm and called from server-side code.
      </p>
      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>GET /api/health</code> - constructs the client and reports load
          status (no network call to Pleasanter)
        </li>
        <li>
          <code>GET /api/site?id=&lt;siteId&gt;</code> - calls{' '}
          <code>client.getSite(siteId)</code> against the configured Pleasanter
          server
        </li>
      </ul>
      <h2>Setup</h2>
      <ol>
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code> and fill in
          your Pleasanter credentials
        </li>
        <li>
          <code>npm install</code>
        </li>
        <li>
          <code>npm run dev</code>
        </li>
        <li>
          Open{' '}
          <a href="/api/health">
            <code>/api/health</code>
          </a>
        </li>
      </ol>
    </main>
  );
}
