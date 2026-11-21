// MUST be first import — installs React fiber hook before React loads
import 'rn-perf-kit/install';
import { registerRootComponent } from 'expo';
import App from './src/App';
registerRootComponent(App);
