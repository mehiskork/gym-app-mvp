import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { logEvent } from '../utils/logger';
import { Text } from '../ui/Text';
import { tokens } from '../theme/tokens';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
};

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    logEvent('error', 'ui', 'React render error caught', {
      message: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleRetry = () => {
    this.setState({ error: null, errorInfo: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text variant="title" weight="700" style={styles.title}>
          Something went wrong
        </Text>
        <Text variant="body" style={styles.body}>
          TrainFrame hit a problem on this screen. Try restarting the app.
        </Text>
        <Pressable
          onPress={this.handleRetry}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
        >
          <Text variant="subtitle" weight="700" color="#FFFFFF">
            Try again
          </Text>
        </Pressable>
        {__DEV__ ? (
          <View style={styles.devDetails}>
            <Text variant="muted" color="#BDBDBD">
              {this.state.error.message}
            </Text>
            {this.state.errorInfo?.componentStack ? (
              <Text variant="muted" color="#BDBDBD">
                {this.state.errorInfo.componentStack}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1115',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.xl,
  },
  title: {
    marginBottom: tokens.spacing.sm,
  },
  body: {
    color: '#E8E8E8',
    marginBottom: tokens.spacing.lg,
  },
  button: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.lg,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  devDetails: {
    marginTop: tokens.spacing.lg,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    backgroundColor: '#171A21',
    gap: tokens.spacing.sm,
  },
});
