import React, { useRef } from 'react';
import { Pressable } from 'react-native';
import { tokens } from '../theme/tokens';
import { Text } from '../ui/Text';
import { setDebugUnlocked } from '../utils/debugUnlock';
import appConfig from '../../app.json';

const expoConfig = appConfig.expo as {
  version?: string;
  ios?: { buildNumber?: string };
  android?: { versionCode?: number };
};

const buildNumber =
  expoConfig?.ios?.buildNumber ?? expoConfig?.android?.versionCode?.toString() ?? '0';

type Props = {
  onUnlocked: () => void;
  onLocked?: () => void;
};

export function VersionTapUnlock({ onUnlocked, onLocked }: Props) {
  const countRef = useRef(0);
  const lastTapRef = useRef(0);

  const versionLabel = `${expoConfig?.version ?? '0.0.0'} (${buildNumber})`;

  return (
    <Pressable
      onPress={async () => {
        const now = Date.now();
        const withinWindow = now - lastTapRef.current < 1200;

        countRef.current = withinWindow ? countRef.current + 1 : 1;
        lastTapRef.current = now;

        if (countRef.current >= 7) {
          countRef.current = 0;
          await setDebugUnlocked(true);
          onUnlocked();
        }
      }}
      onLongPress={async () => {
        countRef.current = 0;
        await setDebugUnlocked(false);
        onLocked?.();
      }}
    >
      <Text color={tokens.colors.textSecondary}>{`Version ${versionLabel}`}</Text>
    </Pressable>
  );
}
