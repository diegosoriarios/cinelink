const mockStorage = new Map<string, string>();

const resetMockAsyncStorage = () => {
  mockStorage.clear();
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => (mockStorage.has(key) ? mockStorage.get(key)! : null),
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStorage.delete(key);
    },
    multiRemove: async (keys: string[]) => {
      keys.forEach((key) => mockStorage.delete(key));
    },
    clear: async () => {
      mockStorage.clear();
    }
  }
}));

(globalThis as Record<string, unknown>).__mockAsyncStorageStore = mockStorage;
(globalThis as Record<string, unknown>).__resetMockAsyncStorage = resetMockAsyncStorage;

export {};
