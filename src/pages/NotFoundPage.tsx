import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <img 
        src="/logo.png" 
        alt="Goxprint Logo" 
        style={{ width: '150px', marginBottom: '2rem', borderRadius: '10px' }} 
      />
      <h1 style={{ fontSize: '5rem', fontWeight: 'bold', color: '#1e293b', margin: '0 0 1rem' }}>404</h1>
      <h2 style={{ fontSize: '1.8rem', color: '#475569', margin: '0 0 1rem' }}>
        Trang không tồn tại
      </h2>
      <p style={{ color: '#64748b', maxWidth: '450px', marginBottom: '2rem', lineHeight: '1.5' }}>
        Có vẻ như đường dẫn bạn đang cố truy cập (ví dụ Web Setting) không hợp lệ, hoặc tính năng này đang bảo trì. Vui lòng kiểm tra lại URL.
      </p>
      <Link 
        to="/dashboard"
        style={{
          padding: '12px 24px',
          backgroundColor: '#3b82f6',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '8px',
          fontWeight: '600',
          transition: 'background-color 0.2s',
          boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)'
        }}
        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
      >
        Trở về Bảng điều khiển
      </Link>
    </div>
  );
};

export default NotFoundPage;
