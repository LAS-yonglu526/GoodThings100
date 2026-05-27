import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import ListHomeScreen from './src/screens/ListHomeScreen';
import ListDetailScreen from './src/screens/ListDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';

type Screen = 'home' | 'detail' | 'settings';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedListId, setSelectedListId] = useState<string>('');

  const handleSelectList = (listId: string) => {
    setSelectedListId(listId);
    setScreen('detail');
  };

  const handleBack = () => setScreen('home');
  const handleGoSettings = () => setScreen('settings');

  return (
    <>
      <StatusBar style="dark" />
      {screen === 'home' && (
        <ListHomeScreen onSelectList={handleSelectList} onGoSettings={handleGoSettings} />
      )}
      {screen === 'detail' && (
        <ListDetailScreen listId={selectedListId} onBack={handleBack} />
      )}
      {screen === 'settings' && (
        <SettingsScreen onBack={handleBack} />
      )}
    </>
  );
}