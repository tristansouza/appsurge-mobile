import { Ionicons } from '@expo/vector-icons';
import React from 'react';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, size = 22, color = '#24211E' }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}
