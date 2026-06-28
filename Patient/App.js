// PhysioAI · Version-2 (React Native / Expo) — patient app root.

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import WelcomeScreen from './src/screens/WelcomeScreen.js';
import LoginScreen from './src/screens/LoginScreen.js';
import RegisterScreen from './src/screens/RegisterScreen.js';
import HomeScreen from './src/screens/HomeScreen.js';
import PracticeScreen from './src/screens/PracticeScreen.js';
import { loadLang } from './src/core/i18n.js';
import { getSession } from './src/core/auth.js';

const Stack = createNativeStackNavigator();

export default function App() {
  const [ready, setReady] = useState(false);
  const [initial, setInitial] = useState('Welcome');
  useEffect(() => {
    (async () => {
      await loadLang();
      const s = await getSession();
      setInitial(s ? 'Home' : 'Welcome'); // skip Welcome if already logged in / guest
      setReady(true);
    })();
  }, []);
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Practice" component={PracticeScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
