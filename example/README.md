# JankLab

Demo React Native app with intentionally planted performance bugs for testing rn-perf-kit.

## Planted Bugs and Expected Findings

| Screen | Bug | Expected Finding |
|---|---|---|
| Home | ScrollView + .map() on 100 items | Memory growth, slow mount |
| Home | Inline onPress on memoized cards | Unstable reference |
| ProductDetail | ReviewsList mounts during transition | Mount during transition |
| ProductDetail | setState in useLayoutEffect | Cascading update |
| ProductDetail | Listener never cleaned up | Memory leak after back nav |
| Search | Sync filter of 10k items/keystroke | JS stall during input |
| Search | startTransition with heavy results | Discarded renders |

## Running

```sh
pnpm install
cd example
pnpm start
```
