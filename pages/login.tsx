import { NextPage } from 'next';
import { useRouter } from 'next/router';

const Login: NextPage = () => {
  const handleLogin = () => {
    window.location.href = '/api/oauth-login';
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 80 }}>
      <h1>Login with Suunto</h1>
      <button onClick={handleLogin} style={{ fontSize: 18, padding: '12px 32px', borderRadius: 8, background: '#222', color: '#fff', border: 'none', cursor: 'pointer' }}>
        Login with Suunto
      </button>
    </div>
  );
};

export default Login;
