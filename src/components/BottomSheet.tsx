import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './ui';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Fraction of screen height the sheet may occupy. */
  heightRatio?: number;
}

/**
 * Contextual slide-up sheet used for editing, date picking and tag assignment.
 *
 * Drag-to-dismiss is implemented with PanResponder so the sheet keeps working
 * even where the Reanimated worklet runtime is unavailable.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  heightRatio = 0.72,
}: BottomSheetProps) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(height)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  const sheetHeight = Math.min(height * heightRatio, height - 80);

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: sheetHeight,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [backdrop, dragY, sheetHeight, translateY, visible]);

  const dismiss = useCallback(() => {
    Animated.timing(dragY, {
      toValue: sheetHeight,
      duration: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      dragY.setValue(0);
      onClose();
    });
  }, [dragY, onClose, sheetHeight]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          dragY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > sheetHeight * 0.25 || gesture.vy > 1.1) {
            dismiss();
          } else {
            Animated.spring(dragY, {
              toValue: 0,
              useNativeDriver: true,
              speed: 24,
              bounciness: 4,
            }).start();
          }
        },
      }),
    [dismiss, dragY, sheetHeight],
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay, opacity: backdrop }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sheet" />
        </Animated.View>

        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: sheetHeight,
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.radii['2xl'],
            borderTopRightRadius: theme.radii['2xl'],
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            transform: [{ translateY: Animated.add(translateY, dragY) }],
          }}
        >
          <View {...panResponder.panHandlers} style={{ paddingTop: theme.spacing.md }}>
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.borderStrong,
              }}
            />
            {title ? (
              <View style={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg }}>
                <Text variant="title">{title}</Text>
                {subtitle ? (
                  <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 4 }}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing['2xl'] }}>
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
