// lib/ui/ErrorBoundary.tsx - Catches React errors and shows fallback
import * as Sentry from "@sentry/react-native";
import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (__DEV__) console.error("[ErrorBoundary]", error, errorInfo.componentStack);
    Sentry.captureException(error, {
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {__DEV__ ? this.state.error.message : "Please try again. If this keeps happening, update the app."}
          </Text>
          <Pressable onPress={this.handleReset} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}>
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.bgDeep,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 8 },
  message: { color: colors.textTertiary, fontSize: 14, textAlign: "center", marginBottom: 20 },
  btn: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: colors.accent, borderRadius: 10 },
  btnText: { color: colors.text, fontSize: 15, fontWeight: "700" },
});
