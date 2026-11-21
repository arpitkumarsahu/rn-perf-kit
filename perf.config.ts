import type { BudgetConfig } from 'rn-perf-kit';

const config: BudgetConfig = {
  startup: {
    LOW: 3000,
    MID: 2000,
    HIGH: 1500,
  },
  screens: {
    Home: {
      LOW: 1200,
      MID: 800,
      HIGH: 500,
    },
    ProductDetail: {
      LOW: 900,
      MID: 600,
      HIGH: 400,
    },
    Search: {
      LOW: 700,
      MID: 450,
      HIGH: 300,
    },
  },
  navigation: {
    'Home→ProductDetail': {
      LOW: 600,
      MID: 350,
      HIGH: 250,
    },
    'Home→Search': {
      LOW: 450,
      MID: 280,
      HIGH: 200,
    },
  },
  minFps: {
    LOW: 45,
    MID: 55,
    HIGH: 58,
  },
  droppedFramesPct: {
    LOW: 15,
    MID: 5,
    HIGH: 2,
  },
  maxCommitDuration: {
    LOW: 32,
    MID: 16,
    HIGH: 11,
  },
};

export default config;
