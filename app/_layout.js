import { Stack } from 'expo-router';
import { AppProvider } from '../src/utils/AppContext';

export default function RootLayout() {
  return (
    <AppProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: '#0f1117' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="study" />
        <Stack.Screen name="stats" />
        <Stack.Screen name="settings" />
      </Stack>
    </AppProvider>
  );
}
