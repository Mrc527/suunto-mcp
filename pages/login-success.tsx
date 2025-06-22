import { NextPage } from 'next';
import { useRouter } from 'next/router';

const LoginSuccess: NextPage = () => {
  const router = useRouter();
  const { mcpToken } = router.query;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 80 }}>
      <h1>Login Successful</h1>
      <p>Your MCP token:</p>
      <code style={{ fontSize: 16, background: '#eee', padding: 8, borderRadius: 4 }}>{mcpToken as string}</code>
      <p style={{ marginTop: 24 }}>Copy this token to use in your MCP client configuration (Claude, VSCode, etc).</p>
    </div>
  );
};

export default LoginSuccess;
