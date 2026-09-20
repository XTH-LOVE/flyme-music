import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        minHeight: '60vh',
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 700, opacity: 0.85 }}>404</div>
      <div style={{ fontSize: 14, opacity: 0.6 }}>这个页面不存在</div>
      <Link
        to="/"
        style={{
          marginTop: 8,
          padding: '8px 20px',
          borderRadius: 999,
          background: 'var(--am-accent, #3d7bff)',
          color: '#fff',
          textDecoration: 'none',
          fontSize: 13,
        }}
      >
        回首页
      </Link>
    </div>
  );
}
