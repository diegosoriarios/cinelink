import React, { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions
} from 'react-native';
import { getImageUrl } from '../api/tmdb';

const POSTER_ASPECT = 1.5;
const GAP = 10;
const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const DEFAULT_SPEED_MS = 38_000;
const WIDE_BREAKPOINT = 900;

export type PosterBackgroundProps = {
  paths: (string | null | undefined)[];
  columns?: number;
  speed?: number;
};

type PosterColumnProps = {
  paths: string[];
  tileWidth: number;
  setHeight: number;
  direction: 1 | -1;
  duration: number;
  offset: number;
  left: number;
};

const PosterColumn = ({ paths, tileWidth, setHeight, direction, duration, offset, left }: PosterColumnProps) => {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (setHeight <= 0) {
      return;
    }
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER
      })
    );
    animation.start();
    return () => {
      animation.stop();
      progress.setValue(0);
    };
  }, [progress, duration, setHeight]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: direction === -1 ? [0, -setHeight] : [-setHeight, 0]
  });

  const renderTile = (path: string, key: string) => {
    const uri = getImageUrl(path, 'w342');
    return uri ? (
      <Image key={key} source={{ uri }} style={[styles.tile, { width: tileWidth, height: tileWidth * POSTER_ASPECT }]} />
    ) : (
      <View key={key} style={[styles.tile, styles.tileFallback, { width: tileWidth, height: tileWidth * POSTER_ASPECT }]} />
    );
  };

  return (
    <View style={[styles.column, { left, width: tileWidth, top: -offset }]}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {[0, 1].map((copy) =>
          paths.map((path, index) => renderTile(path, `${copy}-${index}`))
        )}
      </Animated.View>
    </View>
  );
};

export const PosterBackground = ({ paths, columns, speed = DEFAULT_SPEED_MS }: PosterBackgroundProps) => {
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => {
        if (active) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const cleaned = useMemo(() => paths.filter((path): path is string => Boolean(path)), [paths]);

  if (reduceMotion || cleaned.length === 0 || width === 0 || height === 0) {
    return null;
  }

  const columnCount = columns ?? (width >= WIDE_BREAKPOINT ? 6 : 3);
  const tileWidth = width / columnCount;
  const step = tileWidth * POSTER_ASPECT + GAP;
  const perColumn = Math.max(Math.ceil(height / step) + 1, 3);
  const setHeight = perColumn * step;

  const byColumn = Array.from({ length: columnCount }, () => [] as string[]);
  cleaned.forEach((path, index) => {
    byColumn[index % columnCount].push(path);
  });

  return (
    <View style={styles.container} pointerEvents="none" testID="poster-background">
      {byColumn.map((columnPaths, columnIndex) => {
        if (columnPaths.length === 0) {
          return null;
        }
        const stack: string[] = [];
        while (stack.length < perColumn) {
          stack.push(...columnPaths);
        }
        return (
          <PosterColumn
            key={columnIndex}
            paths={stack.slice(0, perColumn)}
            tileWidth={tileWidth}
            setHeight={setHeight}
            direction={columnIndex % 2 === 0 ? -1 : 1}
            duration={speed + columnIndex * 900}
            offset={(columnIndex * setHeight) / columnCount}
            left={columnIndex * tileWidth}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#020617'
  },
  column: {
    position: 'absolute',
    left: 0
  },
  tile: {
    borderRadius: 8,
    marginBottom: GAP,
    backgroundColor: '#0f172a'
  },
  tileFallback: {
    backgroundColor: '#0f172a'
  }
});

export default PosterBackground;
