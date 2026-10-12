/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams: { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}` | `/`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/stats` | `/stats`; params?: Router.UnknownInputParams; } | { pathname: `/game/race`; params?: Router.UnknownInputParams; } | { pathname: `/game/[mode]`, params: Router.UnknownInputParams & { mode: string | number; } };
      hrefOutputParams: { pathname: Router.RelativePathString, params?: Router.UnknownOutputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownOutputParams } | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}` | `/`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}/stats` | `/stats`; params?: Router.UnknownOutputParams; } | { pathname: `/game/race`; params?: Router.UnknownOutputParams; } | { pathname: `/game/[mode]`, params: Router.UnknownOutputParams & { mode: string; } };
      href: Router.RelativePathString | Router.ExternalPathString | `/_sitemap${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}${`?${string}` | `#${string}` | ''}` | `/${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}/stats${`?${string}` | `#${string}` | ''}` | `/stats${`?${string}` | `#${string}` | ''}` | `/game/race${`?${string}` | `#${string}` | ''}` | { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}` | `/`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/stats` | `/stats`; params?: Router.UnknownInputParams; } | { pathname: `/game/race`; params?: Router.UnknownInputParams; } | `/game/${Router.SingleRoutePart<T>}${`?${string}` | `#${string}` | ''}` | { pathname: `/game/[mode]`, params: Router.UnknownInputParams & { mode: string | number; } };
    }
  }
}
