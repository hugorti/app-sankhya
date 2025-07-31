// components/AuthGuard.tsx
import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useSession } from '../hooks/useSession';
import { ActivityIndicator, View } from 'react-native';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session?.jsessionid) {
      router.replace('/login');
    }
  }, [session, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session?.jsessionid) {
    return <Redirect href="/login" />;
  }

  return <>{children}</>;
}