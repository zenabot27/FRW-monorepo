import { defaultConfig } from '@tamagui/config/v4';
import { createTamagui } from 'tamagui';

export const tamaguiConfig: ReturnType<typeof createTamagui> = createTamagui({
  ...defaultConfig,
  settings: {
    ...defaultConfig.settings,
    disableSSR: true,
  },
});
