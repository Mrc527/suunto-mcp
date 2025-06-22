import type { NextPage } from 'next';
import { useRouter } from 'next/router';

const Home: NextPage = () => {
  const router = useRouter();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, Arial, sans-serif',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 8px 32px rgba(60,60,90,0.12)',
          padding: 40,
          maxWidth: 540,
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 32, marginBottom: 32 }}>
          <img src="/img/mcp_logo.svg" alt="MCP Logo" style={{ height: 56 }} />
          <img src="/img/Suunto-logo.svg" alt="Suunto Logo" style={{ height: 36 }} />
        </div>
        <h1 style={{ textAlign: 'center', fontWeight: 700, fontSize: 32, marginBottom: 12, color: '#1a2233' }}>
          Suunto MCP Server
        </h1>
        <p style={{ textAlign: 'center', color: '#4a5568', fontSize: 17, marginBottom: 28 }}>
          Securely access your Suunto activity, workout, and health data via the Model Context Protocol (MCP). Login to get started or connect this server to your favorite AI client.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <button
            onClick={() => router.push('/login')}
            style={{
              fontSize: 18,
              padding: '12px 32px',
              borderRadius: 6,
              background: '#e63946',
              color: '#fff',
              border: '1px solid #e63946',
              cursor: 'pointer',
              fontWeight: 600,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              transition: 'background 0.2s, color 0.2s',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = '#fff';
              e.currentTarget.style.color = '#e63946';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = '#e63946';
              e.currentTarget.style.color = '#fff';
            }}
          >
            Login with Suunto
          </button>
        </div>
        <div style={{ marginTop: 0, fontSize: 16, background: '#f7fafc', borderRadius: 12, padding: 20, marginBottom: 28 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 10, color: '#1a2233' }}>How to Connect This MCP Server</h2>
          <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
            <li style={{ marginBottom: 8 }}>
              <strong>VSCode:</strong> Install an MCP-compatible extension (e.g., Model Context Protocol extension). In the extension settings, add this server's URL (e.g., <code>https://suunto-mcp.vercel.app</code>) as a custom MCP server.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Claude (Claude Desktop):</strong> Open the MCP integration settings and add this server's URL (<code>https://suunto-mcp.vercel.app</code>). Claude will auto-discover available resources and tools.
            </li>
            <li>
              <strong>Other Clients:</strong> Refer to the client documentation for MCP server integration. Typically, you need to provide the server URL (<code>https://suunto-mcp.vercel.app</code>) and follow the authentication flow.
            </li>
          </ul>
          <p style={{ fontSize: 14, color: '#666', marginTop: 10 }}>
            For more details, see the <a href="https://modelcontextprotocol.io/" target="_blank" rel="noopener noreferrer" style={{ color: '#e63946', textDecoration: 'underline' }}>MCP documentation</a> or your client's documentation.
          </p>
        </div>
        <div style={{ marginTop: 12, fontSize: 15, textAlign: 'center', color: '#4a5568', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              {/* Author/User Icon */}
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 4 }}>
                <circle cx="10" cy="6.5" r="3.5" fill="#e63946"/>
                <ellipse cx="10" cy="15.5" rx="7" ry="4.5" fill="#e63946"/>
              </svg>
            </span>
            Author: <a href="https://marco.visin.ch" target="_blank" rel="noopener noreferrer" style={{ color: '#e63946', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>Marco Visin</a>
          </p>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              {/* GitHub Icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 4 }}>
                <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.49 2.87 8.3 6.84 9.64.5.09.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.36-3.37-1.36-.45-1.18-1.1-1.5-1.1-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05A9.38 9.38 0 0 1 12 6.84c.85.004 1.71.12 2.51.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.07.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.58.69.48A10.01 10.01 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" fill="#e63946"/>
              </svg>
            </span>
            Contribute on <a href="https://github.com/Mrc527/suunto-mcp" target="_blank" rel="noopener noreferrer" style={{ color: '#e63946', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>GitHub</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Home;
