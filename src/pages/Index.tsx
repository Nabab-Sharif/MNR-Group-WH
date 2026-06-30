import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

const Index = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'store_user' && user.office_id) return <Navigate to={`/office/${user.office_id}`} replace />;
  return <Navigate to="/management" replace />;
};

export default Index;
