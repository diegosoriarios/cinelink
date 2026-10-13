import { render, screen } from '@testing-library/react-native';
import HomeScreen from '../../app/(tabs)/index';

jest.mock('expo-router', () => {
  const { View } = jest.requireActual('react-native');
  return {
    Link: ({ children }: { children: React.ReactNode }) => <View>{children}</View>
  };
});

jest.mock('../api/tmdb', () => ({
  getImageUrl: jest.fn(() => null),
  getPersonDetails: jest.fn(),
  getPersonCredits: jest.fn()
}));

jest.mock('../components/PosterBackground', () => ({
  PosterBackground: () => null
}));

it('renders the home screen with play actions', () => {
  process.env.EXPO_PUBLIC_RACE_URL = 'https://race.example.com';
  try {
    render(<HomeScreen />);

    expect(screen.getByText('CineLink')).toBeOnTheScreen();
    expect(screen.getByText('Play Daily')).toBeOnTheScreen();
    expect(screen.getByText('Explorer Mode')).toBeOnTheScreen();
    expect(screen.getByText('Speed Run')).toBeOnTheScreen();
    expect(screen.getByText('Race a friend')).toBeOnTheScreen();
  } finally {
    delete process.env.EXPO_PUBLIC_RACE_URL;
  }
});

it('hides the race action when no race server is configured', () => {
  delete process.env.EXPO_PUBLIC_RACE_URL;
  render(<HomeScreen />);

  expect(screen.getByText('Play Daily')).toBeOnTheScreen();
  expect(screen.queryByText('Race a friend')).toBeNull();
});
