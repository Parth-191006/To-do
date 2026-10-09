import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { tabBarHeight } from '@/utils/a11y';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const theme = useTheme();
  // The bar used to be a fixed 84px tall regardless of the device, which left
  // it floating above gesture-nav phones and cramped on button-nav ones.
  const insets = useSafeAreaInsets();
  // Labels follow the OS text-size setting, so the bar has to as well — at
  // 200% text a fixed 58dp clips "Insights" to "Insi…".
  const { fontScale } = useWindowDimensions();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: tabBarHeight(fontScale, insets.bottom),
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
          shadowColor: theme.colors.shadow,
          shadowOpacity: 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -6 },
          elevation: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
        tabBarItemStyle: { paddingTop: 2 },
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.today'),
          // A stable handle for the Maestro flows: the screen heading and the
          // tab label are the same word ("Focus", "Habits"), so a text
          // selector would be ambiguous.
          tabBarButtonTestID: 'tab-today',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'today' : 'today-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: t('tabs.inbox'),
          tabBarButtonTestID: 'tab-inbox',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'file-tray' : 'file-tray-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="focus"
        options={{
          title: t('tabs.focus'),
          tabBarButtonTestID: 'tab-focus',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'timer' : 'timer-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="habits"
        options={{
          title: t('tabs.habits'),
          tabBarButtonTestID: 'tab-habits',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'flame' : 'flame-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t('tabs.insights'),
          tabBarButtonTestID: 'tab-insights',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
