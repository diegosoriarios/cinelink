import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { PosterBackground } from './PosterBackground';

jest.mock('../api/tmdb', () => ({
  getImageUrl: (path: string | null, size: string) => (path ? `https://img/${size}${path}` : null)
}));

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('renders nothing when there are no posters', () => {
  render(<PosterBackground paths={[]} />);
  expect(screen.queryByTestId('poster-background')).toBeNull();
});

it('renders drifting columns for a poster list', async () => {
  render(<PosterBackground paths={['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg']} />);
  expect(await screen.findByTestId('poster-background')).toBeOnTheScreen();
});
