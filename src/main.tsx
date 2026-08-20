import React, { Component, ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught React Error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'sans-serif', background: '#f8fafc', color: '#1e293b' }}>
          <div style={{ maxWidth: '600px', width: '100%', background: '#fff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444', marginBottom: '10px' }}>⚠️ 시스템 렌더링 오류 감지</h2>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>페이지를 불러오는 중 예외가 발생했습니다.</p>
            <pre style={{ background: '#f1f5f9', padding: '12px', borderRadius: '8px', fontSize: '12px', overflowX: 'auto', color: '#334155', marginBottom: '20px' }}>
              {this.state.error?.toString()}
            </pre>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { window.location.href = '/'; }}
                style={{ flex: 1, padding: '10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                메인 홈으로 이동
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{ flex: 1, padding: '10px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                새로고침
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
