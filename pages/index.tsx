import type { NextPage } from 'next';
import { useRouter } from 'next/router';

const Home: NextPage = () => {
  const router = useRouter();

  return (
    <div>
      <h1>Welcome to the Suunto MCP Server</h1>
      <p>Login with your Suunto credentials to get started.</p>
      <button
        onClick={() => router.push('/login')}
        style={{
          fontSize: 18,
          padding: '12px 32px',
          borderRadius: 8,
          background: '#222',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Login with Suunto
      </button>
    </div>
  );
};

export default Home;
