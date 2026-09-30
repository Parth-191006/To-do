import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import type { Project } from '@/domain/types';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { selection, success, tapLight } from '@/utils/haptics';

import { BottomSheet } from './BottomSheet';
import { Chip, Text } from './ui';

const NAME_PLACEHOLDER = 'e.g. Client work, Home, Thesis';

interface ProjectSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Pass a project to rename/recolour it; omit it to create a new one. */
  project?: Project | null;
  onCreated?: (project: Project) => void;
}

/**
 * Create / rename / recolour a list.
 *
 * "New project" used to create `Project N` out of thin air with no name, no
 * colour and no visible result — which is why it looked like nothing happened.
 * This sheet is the missing half of that feature.
 */
export function ProjectSheet({ visible, onClose, project = null, onCreated }: ProjectSheetProps) {
  const theme = useTheme();
  const addProject = useStore((s) => s.addProject);
  const updateProjectMeta = useStore((s) => s.updateProjectMeta);
  const projectCount = useStore((s) => s.projects.length);

  const editing = project !== null;
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(theme.swatches[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(project?.name ?? '');
    setColor(project?.color ?? theme.swatches[projectCount % theme.swatches.length]);
  }, [project, projectCount, theme.swatches, visible]);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && !busy;

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      if (editing && project) {
        await updateProjectMeta(project.id, { name: trimmed, color });
        success();
      } else {
        const created = await addProject(trimmed, color);
        if (created) {
          success();
          onCreated?.(created);
        }
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit list' : 'New list'}
      subtitle={editing ? 'Rename it or give it a new colour.' : 'Lists keep related tasks together.'}
      heightRatio={0.62}
    >
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radii.lg,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingHorizontal: theme.spacing.md,
          }}
        >
          <Ionicons name="folder-outline" size={18} color={color} />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={NAME_PLACEHOLDER}
            placeholderTextColor={theme.colors.textTertiary}
            autoFocus
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={() => void handleSave()}
            style={[
              theme.typography.body,
              { flex: 1, color: theme.colors.textPrimary, paddingVertical: 14 },
            ]}
          />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" color={theme.colors.textSecondary}>
            Colour
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {theme.swatches.map((swatch) => {
              const active = swatch.toLowerCase() === color.toLowerCase();
              return (
                <Pressable
                  key={swatch}
                  onPress={() => {
                    selection();
                    setColor(swatch);
                  }}
                  hitSlop={6}
                  accessibilityLabel={`Colour ${swatch}`}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: swatch,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: active ? 2.5 : 0,
                    borderColor: theme.colors.textPrimary,
                  }}
                >
                  {active ? <Ionicons name="checkmark" size={17} color="#FFFFFF" /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
          <Chip
            label={busy ? 'Saving…' : editing ? 'Save changes' : 'Create list'}
            icon={editing ? 'checkmark' : 'add'}
            color={color}
            selected
            onPress={() => void handleSave()}
          />
          <Chip label="Cancel" onPress={onClose} />
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => { tapLight(); onClose(); }} hitSlop={8}>
            <Ionicons name="close" size={20} color={theme.colors.textTertiary} />
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}
