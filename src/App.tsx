import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { useKnowledge } from './context/KnowledgeContext';
import { Login } from './components/Login';
import { Signup } from './components/Signup';
import { ForgotPassword } from './components/ForgotPassword';
import { UpdatePassword } from './components/UpdatePassword';
import { KnowledgeUpload } from './components/KnowledgeUpload';
import { ChatInterface } from './components/ChatInterface';
import { Loader2 } from 'lucide-react';

function App() {
  const { session, loading: authLoading, recoveryMode } = useAuth();
  const { isUploaded, loading: knowledgeLoading } = useKnowledge();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  if (authLoading || (session && knowledgeLoading)) {
    return (
      <div className="auth-container">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  // If user clicked a password reset link in their email
  if (recoveryMode) {
    return <UpdatePassword />;
  }

  if (!session) {
    return (
      <div className="auth-container">
        {isForgotPassword ? (
          <ForgotPassword onBack={() => setIsForgotPassword(false)} />
        ) : isLogin ? (
          <Login
            onToggle={() => setIsLogin(false)}
            onForgotPassword={() => setIsForgotPassword(true)}
          />
        ) : (
          <Signup onToggle={() => setIsLogin(true)} />
        )}
      </div>
    );
  }

  if (!isUploaded) {
    return <KnowledgeUpload />;
  }

  return <ChatInterface />;
}

export default App;
